import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

const MapView = lazy(() =>
  import("@/components/MapView").then((m) => ({ default: m.MapView })),
);

export const Route = createFileRoute("/mapdiag")({
  component: MapDiag,
});

function MapDiag() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ClientOnly fallback={<div>loading</div>}>
        <Suspense fallback={<div>suspense</div>}>
          <MapView fix={null} destination={null} encodedPolyline={null} />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
