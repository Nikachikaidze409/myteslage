import { createFileRoute, redirect } from "@tanstack/react-router";

/** Convenience alias: /am -> the Armenian page at /hy. */
export const Route = createFileRoute("/am")({
  beforeLoad: () => {
    throw redirect({ to: "/hy" });
  },
});
