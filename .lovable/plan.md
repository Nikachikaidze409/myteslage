# Get your Google APIs actually enabled (search, routes, geocoding, roads)

Google still rejects search calls with: "Places API (New) has not been used in project **246860175116** before or it is disabled." That tells us exactly which project your API key lives in — so we enable the APIs there, not anywhere else.

## Step 1 — confirm you're in the right project (you do this, 1 minute)

1. Open: https://console.cloud.google.com/apis/credentials?project=246860175116
2. Check your API key is listed on that page.
   - If the key is there: this is the correct project, continue to Step 2.
   - If it's NOT there: your key belongs to a different project — tell me and I'll walk you through fixing that instead.

## Step 2 — enable the 4 APIs in project 246860175116

Open each link (it has the project pre-selected) and click **Enable**:

1. Places API (New): https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=246860175116
2. Routes API: https://console.developers.google.com/apis/api/routes.googleapis.com/overview?project=246860175116
3. Geocoding API: https://console.developers.google.com/apis/api/geocoding-backend.googleapis.com/overview?project=246860175116
4. Roads API: https://console.developers.google.com/apis/api/roads.googleapis.com/overview?project=246860175116

Wait 2–5 minutes after enabling (Google needs a moment to apply it).

## Step 3 — I verify everything works

Once you confirm, I will test all four APIs live through the app:

- Search autocomplete (typing a street name)
- Route calculation (directions)
- Reverse geocoding (tap on map → address)
- Roads (location snapping)

## No code changes needed

The app code is already correct — this is purely a Google Cloud project setting. If after Step 2 it still fails, the stored key likely belongs to another project, and the fix is to paste me the key from the project where the APIs are enabled.
