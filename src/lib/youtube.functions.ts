import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type YtVideo = { id: string; title: string };

/** Searches YouTube's public results page and returns embeddable video ids. */
export const searchYoutube = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<YtVideo[]> => {
    try {
      const res = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(data.q)}&sp=EgIQAQ%253D%253D`,
        { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept-Language": "en" } },
      );
      const html = await res.text();
      const out: YtVideo[] = [];
      const seen = new Set<string>();
      const re = /"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && out.length < 12) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        let title = m[2];
        try { title = JSON.parse(`"${m[2]}"`); } catch { /* keep raw */ }
        out.push({ id: m[1], title });
      }
      return out;
    } catch {
      return [];
    }
  });
