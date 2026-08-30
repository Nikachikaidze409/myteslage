import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/drive")({
  beforeLoad: () => {
    throw redirect({ to: "/map" });
  },
  component: () => null,
});
