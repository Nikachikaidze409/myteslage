import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/drive")({
  head: () => ({
    meta: [
      { title: "Navigation | TMap Georgia" },
      { name: "description", content: "Open TMap Georgia live navigation." },
      { property: "og:title", content: "Navigation | TMap Georgia" },
      { property: "og:description", content: "Open TMap Georgia live navigation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/map" });
  },
  component: () => null,
});
