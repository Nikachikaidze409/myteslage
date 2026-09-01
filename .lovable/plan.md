# Fix the "map can't open on this domain" error on first login

## What's happening

On `myteslage.lovable.app/map` the map key **is** allowed, yet the domain error still shows on the first load and disappears after tapping "Try again". Looking at the loader code, the error banner is not proof that the domain was rejected:

- The auth-failure flag is stored globally and is never cleared. Once it is set in a browser tab (for example after an earlier visit to the custom domain, or a load that Google briefly rejected), every later subscriber is told immediately that the domain is blocked, even when the map itself initialises perfectly.
- The banner is shown as soon as Google calls its failure hook, without first checking whether the map surface actually came up. A transient rejection (cold key, momentarily slow script, quota blip) therefore looks permanent to the driver.
- The quiet retry path can finish successfully while the error banner is still on screen, so the two states fight each other.

## The fix

1. **Clear the failure state on success.** When a Google map object is successfully created and rendered, reset the global auth-failure flag and clear any error banner. A working map wins over a stale error.
2. **Don't show the banner instantly.** Hold the domain/key error briefly (about 2 seconds) and only surface it if the map still has not initialised. During that window keep showing "Loading map…".
3. **Retry once automatically on an auth failure**, not just on network errors, by re-requesting the script fresh (new script tag, cache-busted). This is what tapping "Try again" already does manually, so it should happen for the driver automatically.
4. **Reset loader state properly between attempts** so a retry never reuses a poisoned promise or a stale global callback.
5. **Distinguish the messages**: a genuine, repeated domain rejection keeps the "add this domain to the key" wording; anything else says "Map is taking longer than usual" with a retry button.

## Note on the custom domain

This makes the Lovable domain load reliably on the first try. On `teslanavi.online` the managed key is still only authorised for `*.lovable.app`, so real domain rejections there will keep showing the explanatory message until your own Google Cloud key (with `https://teslanavi.online/*` and `https://*.teslanavi.online/*` allowed, Maps JavaScript + Places + Routes + Roads + Geocoding enabled) is connected.

## Files touched

- `src/lib/maps-loader.ts` — clearable auth-failure state, fresh retry, better error typing.
- `src/components/MapView.tsx` — deferred error display, auto-retry on auth failure, clear error on successful init.
