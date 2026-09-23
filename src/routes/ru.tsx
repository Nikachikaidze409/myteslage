import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/Landing";

export const Route = createFileRoute("/ru")({
  component: () => <Landing forcedLang="ru" />,
  head: () => ({
    meta: [
      { title: "TMap Georgia - Навигация для браузера Tesla" },
      {
        name: "description",
        content:
          "Живая навигация на экране вашей Tesla в Грузии. Связь с GPS телефона, пошаговый HUD, пробки и перестроение маршрута от 8 ₾ в месяц.",
      },
      { property: "og:title", content: "TMap Georgia - Навигация для браузера Tesla" },
      {
        property: "og:description",
        content: "Настоящий GPS. Настоящие маршруты. Настоящие грузинские улицы. От 8 ₾ в месяц.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: "https://tmap.ge/ru" },
      { rel: "alternate", hrefLang: "ka", href: "https://tmap.ge/" },
      { rel: "alternate", hrefLang: "en", href: "https://tmap.ge/en" },
      { rel: "alternate", hrefLang: "hy", href: "https://tmap.ge/hy" },
      { rel: "alternate", hrefLang: "ru", href: "https://tmap.ge/ru" },
      { rel: "alternate", hrefLang: "x-default", href: "https://tmap.ge/" },
    ],
  }),
});
