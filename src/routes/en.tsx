import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/Landing";

export const Route = createFileRoute("/en")({
  component: () => <Landing forcedLang="en" />,
  head: () => ({
    meta: [
      { title: "TMap Georgia - Navigation for Tesla in-car browsers" },
      {
        name: "description",
        content:
          "Live navigation on your Tesla's screen in Georgia. Phone GPS pairing, turn-by-turn HUD, traffic and rerouting from 8 ₾ a month.",
      },
      { property: "og:title", content: "TMap Georgia - Navigation for Tesla in-car browsers" },
      {
        property: "og:description",
        content: "Real GPS. Real routes. Real Georgian streets. From 8 ₾ a month.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: "https://tmap.ge/en" },
      { rel: "alternate", hrefLang: "ka", href: "https://tmap.ge/" },
      { rel: "alternate", hrefLang: "en", href: "https://tmap.ge/en" },
      { rel: "alternate", hrefLang: "hy", href: "https://tmap.ge/hy" },
      { rel: "alternate", hrefLang: "ru", href: "https://tmap.ge/ru" },
      { rel: "alternate", hrefLang: "x-default", href: "https://tmap.ge/" },
    ],
  }),
});
