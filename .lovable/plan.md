# Fix 404 on /admin

## Cause

The admin page (`/admin`) exists in the code and works in the live preview
(verified: preview returns 200), but the published site still serves the old
version — frontend changes only go live after publishing. The published site
returns 404 for `/admin`.

## Fix

1. Publish the project (Publish → Update) so the published site includes the
   new `/admin` page and all recent changes (device lock kick, search bar
   improvements, map rebuild, contact number, legal pages).
2. Verify `https://myteslage.lovable.app/admin` and
   `https://teslanavi.online/admin` return 200 after publishing.

No code changes needed.
