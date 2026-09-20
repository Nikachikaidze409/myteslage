/**
 * Turn a spoken sentence into a bare destination, without any AI.
 *
 * Used as the instant fallback when the language model is unavailable:
 * "წამიყვანე სითი მოლში" -> "სითი მოლი".
 */

/** Leading words that only express the wish to drive somewhere. */
const LEADING = [
  "წამიყვანე",
  "მიმიყვანე",
  "წამიყვანეთ",
  "მიმიყვანეთ",
  "გამიყვანე",
  "მინდა წავიდე",
  "მინდა",
  "მიდი",
  "წავიდეთ",
  "navigate to",
  "take me to",
  "drive to",
  "go to",
  "let's go to",
];

/** Trailing words that add nothing to the address. */
const TRAILING = [
  "მინდა",
  "გთხოვ",
  "გთხოვთ",
  "ახლა",
  "please",
];

/** Grammatical endings Georgian speakers add to a place name. */
const SUFFIXES = ["-ში", "-თან", "-ზე", "ნომერში", "ნომერთან"];

function stripOnce(text: string, words: string[], where: "start" | "end"): string {
  const lower = text.toLowerCase();
  for (const w of words) {
    const word = w.toLowerCase();
    if (where === "start" && lower.startsWith(word)) {
      return text.slice(w.length).trim();
    }
    if (where === "end" && lower.endsWith(word)) {
      return text.slice(0, text.length - w.length).trim();
    }
  }
  return text;
}

export function cleanSpokenDestination(raw: string): string {
  let out = raw.trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim();
  for (let i = 0; i < 3; i++) {
    const before = out;
    out = stripOnce(out, LEADING, "start");
    out = stripOnce(out, TRAILING, "end");
    out = stripOnce(out, SUFFIXES, "end");
    if (out === before) break;
  }
  // "ბელიაშვილის 12 ნომერში" -> "ბელიაშვილის 12"
  out = out.replace(/\s+(ნომერში|ნომერთან|ნომერზე)$/u, "");
  return out.trim() || raw.trim();
}
