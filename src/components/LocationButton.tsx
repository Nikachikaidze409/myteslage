import type { LocationStatus } from "@/hooks/useLiveLocation";
import { tr } from "@/lib/map-lang";

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
      ? tr("მდებარეობა ჩართულია", "Դիրքը միացված է")
      : status === "starting"
        ? tr("GPS სიგნალი იძებნება…", "GPS ազդանշանը որոնվում է…")
        : status === "denied"
          ? tr("მდებარეობა დაბლოკილია — ჩართეთ ბრაუზერის პარამეტრებში", "Դիրքը արգելափակված է — միացրեք բրաուզերի կարգավորումներում")
          : status === "unavailable"
            ? tr("მდებარეობა მიუწვდომელია — ხელახლა სცადეთ", "Դիրքն անհասանելի է — կրկին փորձեք")
            : tr("მდებარეობის ჩართვა", "Միացնել դիրքը");

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
