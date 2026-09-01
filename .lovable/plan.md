# Admin (owner) access to the map without paying

## Goal
Let you (the app owner) open `/map` without an active subscription, while every other user still needs a paid membership.

## Current state (verified)
- Payments go-live: all steps completed (readiness check, publish, verification, Paddle review) — live checkout is ready, and sandbox checkout already works end to end.
- Access control lives in `src/components/AuthGate.tsx`: it queries the `subscriptions` table and redirects to `/pricing` when there is no active subscription.
- There is currently no roles table in the database.

## Changes

### 1. Create a roles table (migration)
- `app_role` enum with `'admin'` and `'user'`.
- `public.user_roles` table (`user_id`, `role`, unique per pair) with RLS enabled, GRANTs for `authenticated` (select own) and `service_role`.
- `has_role(user_id, role)` security-definer function (standard pattern, avoids recursive RLS).
- Insert an `admin` role row for your account (`hatipetviashviliii@gmail.com`, user id `c470fa8b-b61a-48c0-849a-53562770ae43`).

### 2. Grant admins access in AuthGate
- In `src/components/AuthGate.tsx`, before the subscription check, query whether the signed-in user has the `admin` role (via the `user_roles` table / `has_role`).
- If admin → skip the subscription gate entirely and go straight to device claiming and the map.
- Non-admins keep the exact current behavior (subscription required).

### 3. Verify
- Sign in as your account in the preview and confirm `/map` loads without a subscription.
- Confirm a non-admin test flow still redirects to `/pricing`.

## Technical notes
- Roles are stored in a separate table (never on profiles) and checked server-side through a security-definer function — this is the secure pattern and prevents privilege escalation.
- No changes to checkout, Paddle, or pricing logic.
