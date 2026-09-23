import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/Landing";

export const Route = createFileRoute("/")({
  component: () => <Landing />,
  head: () => ({
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
        content:
          "ნამდვილი GPS. ნამდვილი მარშრუტები. ნამდვილი ქართული ქუჩები. 8 ₾/თვე.",
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
  }),
});
