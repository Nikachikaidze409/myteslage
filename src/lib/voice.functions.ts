import { createServerFn } from "@tanstack/react-start";
import { requireMapAccess } from "@/lib/map-access.middleware";
import { cleanSpokenDestination } from "@/lib/voice-intent";

const AI_BASE = "https://ai.gateway.lovable.dev/v1";

export interface SpokenDestination {
  /** Exactly what the driver said. */
  heard: string;
  /** The address or place to look up on the map. */
  query: string;
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Speech -> text with Lovable AI (handles Georgian on every phone). */
async function transcribe(key: string, audio: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append("model", "google/gemini-3.5-transcribe");
  form.append("file", new Blob([audio as BlobPart], { type: "audio/wav" }), "speech.wav");
  form.append("stream", "true");

  const res = await fetch(`${AI_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Voice service is busy. Try again in a moment.");
    if (res.status === 402) throw new Error("Voice service is out of credit.");
    throw new Error(`Could not understand the recording (${res.status}). ${body.slice(0, 120)}`);
  }

  const raw = await res.text();
  let text = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const evt = JSON.parse(payload) as { type?: string; delta?: string; text?: string };
      if (evt.type === "transcript.text.delta" && evt.delta) text += evt.delta;
      else if (evt.type === "transcript.text.done" && evt.text) text = evt.text;
    } catch {
      /* ignore partial frames */
    }
  }
  return text.trim();
}

/**
 * Understand the sentence and return only the place to navigate to.
 * Falls back to plain word-stripping if the model is unavailable.
 */
async function extractDestination(key: string, heard: string): Promise<string> {
  const prompt =
    "You turn a Georgian or English spoken navigation command into a short map search phrase.\n" +
    "Answer with the destination text only: no URL, no link, no coordinates, no explanation, " +
    "no quotes, one single line, at most 8 words. Assume the country is Georgia (GE).\n" +
    "Drop words like წამიყვანე, მიმიყვანე, მინდა, take me to, navigate to. Fix the grammatical " +
    "case (სითი მოლში -> სითი მოლი). Keep street numbers (ბელიაშვილის 12).\n" +
    "Examples:\n" +
    "Spoken: წამიყვანე სითი მოლში -> სითი მოლი\n" +
    "Spoken: მიმიყვანე ბელიაშვილის 12 ნომერში -> ბელიაშვილის 12\n\n" +
    `Spoken: ${heard}`;


  try {
    const res = await fetch(`${AI_BASE}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: prompt,
        stream: true,
        reasoning: { effort: "low" },
        include: ["reasoning.encrypted_content"],
      }),
    });
    if (!res.ok) return cleanSpokenDestination(heard);

    const raw = await res.text();
    let text = "";
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (evt.type === "response.output_text.delta" && evt.delta) text += evt.delta;
        else if (evt.type === "response.completed" && evt.response?.output_text) {
          text = evt.response.output_text;
        }
      } catch {
        /* ignore partial frames */
      }
    }
    const cleaned = text
      .trim()
      .split("\n")[0]!
      .replace(/^["'„“]|["'”]$/g, "")
      .trim();
    const usable = cleaned.length > 0 && cleaned.length < 120 && !/https?:\/\//i.test(cleaned);
    return usable ? cleaned : cleanSpokenDestination(heard);

  } catch {
    return cleanSpokenDestination(heard);
  }
}

/**
 * Listen to a short recording and return the destination the driver asked for.
 * Gated by the same membership/pairing check as every other paid endpoint.
 */
export const transcribeDestination = createServerFn({ method: "POST" })
  .middleware([requireMapAccess])
  .inputValidator((data: { audio: string }) => {
    if (!data || typeof data.audio !== "string" || data.audio.length < 1000) {
      throw new Error("Nothing was recorded");
    }
    // ~6 MB of base64 is far more than a spoken command ever needs.
    if (data.audio.length > 6_000_000) throw new Error("That recording is too long");
    return data;
  })
  .handler(async ({ data }): Promise<SpokenDestination> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Voice service is not configured");

    const heard = await transcribe(key, decodeBase64(data.audio));
    if (!heard) throw new Error("Nothing was heard. Speak right after the button turns red.");

    const query = await extractDestination(key, heard);
    return { heard, query };
  });
