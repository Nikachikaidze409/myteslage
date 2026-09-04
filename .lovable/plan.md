# Admin panel to view registered users

## Goal
You (admin) want to see everyone who registered, their name, mobile number and email,
and whether they paid (plus which plan). You also want to search the list and export it
to a spreadsheet (CSV). Only your admin account can open it.

## What exists today
- Registration (`signupWithCode` in `src/lib/auth.functions.ts`) already saves
  `full_name` and `phone` into the `profiles` table for every signup, including people
  who never pay. Confirmed by a live database read: e.g. Valeri Datuashvili / 595265552,
  Giorgi Lobzhanidze / +995595858585, Nikoloz kurty / +995555668834 all registered but
  have no subscription.
- `profiles` RLS only lets each user read their own row, so there is no way to see others.
- There is no admin page in the app today.
- The `admin` role and `has_role` function already exist. Your account already has admin.
- Plans are keyed by price id: `tesla_map_georgia_monthly` (Monthly) and
  `tesla_map_georgia_quarterly` (3 months).

## What we will build

1. **Admin server function** (`src/lib/admin.functions.ts`)
   - Uses `requireSupabaseAuth` so the caller is signed in.
   - Verifies `has_role(context.userId, 'admin')`; throws "Forbidden" otherwise.
   - Loads `supabaseAdmin` inside the handler and reads all `profiles`
     (`id, email, full_name, phone, created_at`) joined to their latest
     `subscriptions` row (`status, environment, current_period_end, price_id`).
   - Returns a flat list: `{ id, email, fullName, phone, createdAt, status, plan, expiresAt }`.
   - Maps `price_id` to "Monthly" / "3 months", or "None" when no subscription.
   - This is the only path that reads other users' data; the function is the security
     boundary, not the route.

2. **Admin route** (`src/routes/admin.tsx`, top-level `/admin`)
   - `ssr: false` + a client `beforeLoad`/`AuthGate` style check: redirect non-signed-in
     users to `/auth`, and non-admins to `/` (homepage), matching the existing `AuthGate`
     pattern used by `/map`.
   - Calls `listRegistrations` from the component via `useServerFn` + `useQuery`.
   - Renders a searchable table: columns Name, Phone, Email, Payment status, Plan,
     Signup date. A text box filters by name / email / phone (case-insensitive, live).
   - "Export CSV" button writes the currently filtered list to a CSV downloaded to the
     admin's machine (name, phone, email, status, plan, signup date).
   - Styled to match the existing dark Tesla Map Georgia look (`#050708`, white text,
     same header/logo as pricing/checkout).

3. **Access control**
   - Only accounts with the `admin` role can open `/admin` and call the server function.
   - Non-admins are redirected away; the server function re-checks the role server-side
     so the endpoint cannot be reached by a non-admin even if they bypass the UI.

## What we will NOT change
- Login, device lock, pricing, checkout, payments, homepage, the map, and legal pages
  stay exactly as they are.
- No new database tables or migrations are needed. The `profiles` and `subscriptions`
  tables already hold everything; we only read them with the service role from the admin
  function.

## Verification
- `bunx tsgo --noEmit -p tsconfig.json` passes.
- `/admin` returns HTTP 200.
- Signed-in as admin: the table shows registered users with names, phones, payment
  status and plans; search filters the list; CSV export downloads.
- Signed-in as a non-admin: redirected away from `/admin`.

## Open note
The admin account's email/role is already set up. After this is built, you open
`/admin` while signed in as your admin account to see the list and export it.
