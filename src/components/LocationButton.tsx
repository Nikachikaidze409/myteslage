import type { LocationStatus } from "@/hooks/useLiveLocation";

interface Props {
  status: LocationStatus;
  onStart: () => void;
  onStop: () => void;
}

/**
 * Presentational only. GPS tracking itself lives in `useLiveLocation`, mounted
 * once per screen, so this button can never start, stop or duplicate a watcher
 * by being hidden, remounted or re-rendered.
 */
export function LocationButton({ status, onStart, onStop }: Props) {
  const label =
    status === "live"
      ? "მდებარეობა ჩართულია"
      : status === "starting"
        ? "GPS სიგნალი იძებნება…"
        : status === "denied"
          ? "მდებარეობა დაბლოკილია — ჩართეთ ბრაუზერის პარამეტრებში"
          : status === "unavailable"
            ? "მდებარეობა მიუწვდომელია — ხელახლა სცადეთ"
            : "მდებარეობის ჩართვა";

  const live = status === "live" || status === "starting";

  return (
    <button
      onClick={live ? onStop : onStart}
      className="font-display h-14 w-full rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 active:scale-[0.98]"
    >
      {label}
    </button>
  );
}
