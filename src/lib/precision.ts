export type PrecisionTier = "good" | "usable" | "weak" | "unusable";

export interface Precision {
  tier: PrecisionTier;
  label: string;
  description: string;
  color: string;
}

export function scorePrecision(accuracyMeters: number | null | undefined, ageMs: number): Precision {
  if (accuracyMeters == null || !isFinite(accuracyMeters)) {
    return { tier: "unusable", label: "გამოუყენებელი", description: "სიზუსტე უცნობია", color: "var(--bad)" };
  }
  if (ageMs > 60_000) {
    return { tier: "unusable", label: "დაგვიანებული", description: `მონაცემი ${Math.round(ageMs / 1000)} წმ-ისაა`, color: "var(--bad)" };
  }
  if (accuracyMeters > 500) {
    return { tier: "unusable", label: "გამოუყენებელი", description: "სავარაუდოდ IP-ით განსაზღვრული მდებარეობაა", color: "var(--bad)" };
  }
  if (accuracyMeters > 100) {
    return { tier: "weak", label: "სუსტი", description: "მოხვევების ნავიგაციისთვის არასაკმარისია", color: "var(--warn)" };
  }
  if (accuracyMeters > 30) {
    return { tier: "usable", label: "მისაღები", description: "ზოგადი მარშრუტისთვის საკმარისია", color: "var(--warn)" };
  }
  return { tier: "good", label: "კარგი", description: "ნავიგაციისთვის ზუსტი მდებარეობაა", color: "var(--good)" };
}

export function formatCoord(n: number): string {
  return n.toFixed(6);
}