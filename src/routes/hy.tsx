import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/Landing";

export const Route = createFileRoute("/hy")({
  component: () => <Landing forcedLang="hy" />,
  head: () => ({
    meta: [
      { title: "TMap Georgia - Նավիգացիա Tesla-ի բրաուզերի համար" },
      {
        name: "description",
        content:
          "Կենդանի նավիգացիա ձեր Tesla-ի էկրանին Վրաստանում։ Հեռախոսի GPS զուգակցում, քայլ առ քայլ HUD, երթևեկություն և վերաերթուղում՝ 8 ₾/ամիս-ից։",
      },
      { property: "og:title", content: "TMap Georgia - Նավիգացիա Tesla-ի բրաուզերի համար" },
      {
        property: "og:description",
        content: "Իրական GPS։ Իրական երթուղիներ։ Իրական վրացական փողոցներ։ 8 ₾/ամիս-ից։",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: "https://tmap.ge/hy" },
      { rel: "alternate", hrefLang: "ka", href: "https://tmap.ge/" },
      { rel: "alternate", hrefLang: "en", href: "https://tmap.ge/en" },
      { rel: "alternate", hrefLang: "hy", href: "https://tmap.ge/hy" },
      { rel: "alternate", hrefLang: "ru", href: "https://tmap.ge/ru" },
      { rel: "alternate", hrefLang: "x-default", href: "https://tmap.ge/" },
    ],
  }),
});
