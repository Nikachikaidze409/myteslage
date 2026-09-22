import { Link } from "@tanstack/react-router";

export function LegalFooter() {
  return (
    <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-white/50">
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2" aria-label="Legal">
        <Link to="/terms" className="text-white/70 transition hover:text-white">
          Terms & Conditions
        </Link>
        <Link to="/privacy" className="text-white/70 transition hover:text-white">
          Privacy Notice
        </Link>
        <Link to="/refund" className="text-white/70 transition hover:text-white">
          Refund Policy
        </Link>
      </nav>
      <p className="mx-auto mt-4 max-w-2xl">
        TMap Georgia is an independent product and is not affiliated with or endorsed by Tesla, Inc.
      </p>
      <p className="mt-2">© {new Date().getFullYear()} TMap Georgia</p>
    </footer>
  );
}