# Enable Google Cloud billing so the map renders on teslanavi.online

## What the live check found

After you added `https://teslanavi.online/*` and `https://www.teslanavi.online/*` to the key's HTTP referrers, the map key is now accepted on the custom domain (the old `RefererNotAllowedMapError` is gone). But the map is still dimmed with the "For development purposes only" watermark and the "Do you own this website?" dialog.

The browser console now reports the real remaining cause:

```
Google Maps JavaScript API error: BillingNotEnabledMapError
https://developers.google.com/maps/documentation/javascript/error-messages#billing-not-enabled-map-error
```

This means the Google Cloud project that owns your `GOOGLE_API_KEY` has **no active billing account** attached. Google Maps APIs will not render map tiles without billing, even when the key and referrers are correct.

## What to do (Google Cloud Console — no app code change)

1. Open https://console.cloud.google.com/billing and either link an existing billing account or create a new one (a credit/debit card is required; you get a $200 monthly free credit and won't be charged for normal prototype usage).
2. Make sure that billing account is linked to the **same project** that owns your Maps API key.
3. Confirm these APIs are enabled on that project: Maps JavaScript API, Places API (New), Routes API, Roads API, Geocoding API.
4. Reload `https://teslanavi.online/map` — the watermark/dialog should disappear and the map should render cleanly.

## Verification I will run after you confirm billing is on

Re open `https://teslanavi.online/map` with the admin session, confirm:
- No `BillingNotEnabledMapError` in the console.
- No "For development purposes only" watermark or "Do you own this website?" dialog.
- The map surface renders with visible tiles.

## Notes

- No code, database, auth, payment, or pricing changes are needed. The app already serves your key correctly on the custom domain; the only missing piece is Google Cloud billing.
- The Lovable managed key on `myteslage.lovable.app` is unaffected and works there.
