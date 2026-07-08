export function FeasibilityNote() {
  return (
    <details className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
      <summary className="cursor-pointer text-foreground">
        Is this feasible? Read before trusting the fix.
      </summary>
      <div className="mt-3 space-y-2 leading-relaxed">
        <p>
          <strong className="text-foreground">Feasible in principle, unreliable in practice on Tesla.</strong>{" "}
          The Tesla browser is a stripped Chromium; <code>navigator.geolocation</code> support has
          varied by firmware and often falls back to IP-based lookup — hundreds of meters to
          kilometers of error, not navigation-grade.
        </p>
        <p>
          <strong className="text-foreground">Real:</strong> permission prompt, high-accuracy
          request, live <code>watchPosition</code> updates, precision scoring, map + search + route
          rendering, HTTPS/secure-context detection, graceful failure UI.
        </p>
        <p>
          <strong className="text-foreground">Unreliable:</strong> the actual accuracy. Browsers
          cannot access the car's GPS chip, cannot read a nearby phone's raw GPS without that
          phone explicitly serving location over the network, and Wi-Fi/cell positioning coverage
          in Georgia is sparse. Expect frequent 500 m–5 km errors or <code>POSITION_UNAVAILABLE</code>.
        </p>
        <p>
          <strong className="text-foreground">Production path:</strong> a companion mobile app that
          reads real GPS via native APIs and pushes coordinates to a small backend endpoint the
          Tesla browser polls. That is the only way to get true GPS precision into the in-car
          browser without OEM integration.
        </p>
        <p>
          <strong className="text-foreground">After reverse:</strong> Tesla firmware suspends the
          browser whenever you shift into R (the reverse camera takes the screen). No web app can
          relaunch itself — but this app auto-resumes your active trip when you reopen the
          browser. For truly seamless reverse, use Tesla's split-screen so the browser stays
          alive alongside the map.
        </p>
      </div>
    </details>
  );
}