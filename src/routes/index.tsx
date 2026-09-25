import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/Landing";
import { getMarket } from "@/lib/market.functions";
import type { Market } from "@/lib/market";

/**
 * "/" serves two markets from one route: tmap.ge is Georgian, tmap.am is
 * Armenian. The market is resolved from the request host on the server, so
 * each domain gets its own title, description and canonical URL.
 */
export const Route = createFileRoute("/")({
  loader: async () => ({ market: await getMarket() }),
  component: () => <Landing />,
  head: ({ loaderData }) => {
    const market: Market = loaderData?.market ?? "ge";
    if (market === "am") {
      const title = "TMap - նավիգացիա Tesla-ի համար Հայաստանում";
      const description =
        "Կենդանի նավիգացիա ուղիղ ձեր Tesla-ի էկրանին։ Սկսած 2,099 AMD-ից ամսական, տարեկան փաթեթով՝ 2 ամիս նվեր։";
      return {
        meta: [
          { title },
          { name: "description", content: description },
          { property: "og:title", content: title },
          { property: "og:description", content: description },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary_large_image" },
        ],
        links: [
          { rel: "canonical", href: "https://tmap.am/" },
          { rel: "alternate", hrefLang: "hy", href: "https://tmap.am/" },
          { rel: "alternate", hrefLang: "ka", href: "https://tmap.ge/" },
        ],
      };
    }
    return {
      meta: [
        { title: "TMap Georgia - ნავიგაცია Tesla-სთვის საქართველოში" },
        {
          name: "description",
          content:
            "დაივიწყე Tesla Premium Connectivity. ცოცხალი ნავიგაცია პირდაპირ Tesla-ს ეკრანზე - მხოლოდ 8 ₾ თვეში.",
        },
        { property: "og:title", content: "TMap Georgia - ნავიგაცია Tesla-სთვის საქართველოში" },
        {
          property: "og:description",
          content: "ნამდვილი GPS. ნამდვილი მარშრუტები. ნამდვილი ქართული ქუჩები. 8 ₾/თვე.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "canonical", href: "https://tmap.ge/" },
        { rel: "alternate", hrefLang: "ka", href: "https://tmap.ge/" },
        { rel: "alternate", hrefLang: "en", href: "https://tmap.ge/en" },
        { rel: "alternate", hrefLang: "hy", href: "https://tmap.ge/hy" },
        { rel: "alternate", hrefLang: "ru", href: "https://tmap.ge/ru" },
        { rel: "alternate", hrefLang: "x-default", href: "https://tmap.ge/" },
      ],
    };
  },
});
