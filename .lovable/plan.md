# Add a sidebar minimize "X" button on the map screen

## Goal
Let drivers collapse the left sidebar (browser navigation, location fix, places, route options, etc.) so the map fills the full screen, then bring it back when needed.

## What changes
Only the map route, `src/routes/map.tsx`. No auth, payment, database, or pricing changes.

## Implementation

1. **New state**: `const [sidebarOpen, setSidebarOpen] = useState(true)` in the `Index` component.

2. **Minimize "X" button**: At the top of the existing `<aside>` (next to the "Browser navigation" heading / "Sign out" button), add a clear "X" button. Tapping it sets `sidebarOpen` to `false`.

3. **Collapse behavior**: Wrap the existing `!hudMode &&` sidebar block so it only renders when `sidebarOpen` is true. When `sidebarOpen` is false:
   - The `<aside>` is removed and the `<main>` map area expands to fill the full width (it already uses `flex-1`, so the layout adjusts automatically).
   - The outer container keeps its `p-3` padding, so the map still has a small margin; the map's `rounded-3xl border` stays for a clean look.

4. **Restore button**: When the sidebar is collapsed, show a small floating "Panel" button (top-left of the map, `absolute left-4 top-4 z-40`) so the driver can bring the sidebar back. This mirrors how Google Maps keeps a control to re-open panels.

5. **HUD mode interaction**: HUD mode already hides the sidebar independently. The new minimize control only appears in non-HUD mode (same condition as the sidebar itself), so the two behaviors don't conflict.

## Files
- `src/routes/map.tsx` — add `sidebarOpen` state, "X" minimize button in the sidebar header, conditional sidebar render, floating restore button.

## Verification
- `bunx tsgo --noEmit -p tsconfig.json` passes.
- `curl -sf -o /dev/null http://localhost:8080/map` returns 200.
- Optional Playwright check: open `/map`, tap "X", confirm sidebar is gone and map fills the width; tap the restore button, confirm sidebar returns.
