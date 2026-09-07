import { createMiddleware } from "@tanstack/react-start";

/**
 * The paired phone page (/phone/CODE) has no account session of its own.
 * It presents its short-lived pairing code so the server can check that the
 * code belongs to a car owner with an active membership.
 */
export function currentPairCode(): string | null {
  if (typeof window === "undefined") return null;
  const m = /^\/phone\/([A-Za-z0-9]{6,12})/.exec(window.location.pathname);
  return m?.[1] ? m[1].toUpperCase() : null;
}

export const attachPairCode = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const code = currentPairCode();
    return code ? next({ headers: { "x-pair-code": code } }) : next();
  },
);
