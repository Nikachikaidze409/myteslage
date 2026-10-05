import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/Landing";

export const Route = createFileRoute("/az")({
  component: () => <Landing forcedLang="az" />,
  head: () => ({
    meta: [
      { title: "TMap Georgia - Tesla brauzeri üçün naviqasiya" },
      {
        name: "description",
        content:
          "Tesla ekranınızda canlı naviqasiya. Telefon GPS qoşulması, addım-addım HUD, tıxac məlumatı və avtomatik marşrut — ayda 8 ₼-dan.",
      },
      { property: "og:title", content: "TMap Georgia - Tesla brauzeri üçün naviqasiya" },
      {
        property: "og:description",
        content: "Real GPS. Real marşrutlar. Tesla-nızın ekranında canlı xəritə — ayda 8 ₼-dan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: "https://tmap.ge/az" },
      { rel: "alternate", hrefLang: "ka", href: "https://tmap.ge/" },
      { rel: "alternate", hrefLang: "en", href: "https://tmap.ge/en" },
      { rel: "alternate", hrefLang: "hy", href: "https://tmap.ge/hy" },
      { rel: "alternate", hrefLang: "ru", href: "https://tmap.ge/ru" },
      { rel: "alternate", hrefLang: "az", href: "https://tmap.ge/az" },
      { rel: "alternate", hrefLang: "x-default", href: "https://tmap.ge/" },
    ],
  }),
});
