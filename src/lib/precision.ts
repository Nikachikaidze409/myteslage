export type PrecisionTier = "good" | "usable" | "weak" | "unusable";
import { tr } from "@/lib/map-lang";

export interface Precision {
  tier: PrecisionTier;
  label: string;
  description: string;
  color: string;
}

export function scorePrecision(accuracyMeters: number | null | undefined, ageMs: number): Precision {
  if (accuracyMeters == null || !isFinite(accuracyMeters)) {
    return { tier: "unusable", label: tr("გამოუყენებელი", "Անօգտագործելի"), description: tr("სიზუსტე უცნობია", "Ճշգրտությունն անհայտ է"), color: "var(--bad)" };
  }
  if (ageMs > 60_000) {
    return { tier: "unusable", label: tr("დაგვიანებული", "Ուշացած"), description: tr(`მონაცემი ${Math.round(ageMs / 1000)} წმ-ისაა`, `Տվյալը ${Math.round(ageMs / 1000)} վ առաջվա է`), color: "var(--bad)" };
  }
  if (accuracyMeters > 500) {
    return { tier: "unusable", label: tr("გამოუყენებელი", "Անօգտագործելի"), description: tr("სავარაუდოდ IP-ით განსაზღვრული მდებარეობაა", "Հավանաբար IP-ով որոշված դիրք է"), color: "var(--bad)" };
  }
  if (accuracyMeters > 100) {
    return { tier: "weak", label: tr("სუსტი", "Թույլ"), description: tr("მოხვევების ნავიგაციისთვის არასაკმარისია", "Բավարար չէ շրջադարձային նավիգացիայի համար"), color: "var(--warn)" };
  }
  if (accuracyMeters > 30) {
    return { tier: "usable", label: tr("მისაღები", "Ընդունելի"), description: tr("ზოგადი მარშრუტისთვის საკმარისია", "Բավարար է ընդհանուր երթուղու համար"), color: "var(--warn)" };
  }
  return { tier: "good", label: tr("კარგი", "Լավ"), description: tr("ნავიგაციისთვის ზუსტი მდებარეობაა", "Ճշգրիտ դիրք նավիգացիայի համար"), color: "var(--good)" };
}

export function formatCoord(n: number): string {
  return n.toFixed(6);
}