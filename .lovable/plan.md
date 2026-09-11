# Add "@" quick-insert button to the login email field

## Goal
Make it easier for users on keyboards without an easy "@" key (e.g. Tesla's on-screen keyboard) by adding a tappable "@" button next to the email input on `/auth`.

## Scope
- Only `src/routes/auth.tsx` changes.
- No changes to password field, submit button, validation, autofill, navigation, or any other file.

## Implementation

1. Add an `emailRef` (`useRef<HTMLInputElement>`) to the email input so we can read/set the caret position.

2. Add an `insertAt()` helper:
   - Reads `emailRef.current.selectionStart` / `selectionEnd`.
   - Inserts `"@"` at the caret, preserving text before/after.
   - Restores caret to just after the inserted `"@"`.
   - Calls `setEmail(updatedValue)` so React state stays in sync.
   - Keeps focus on the input (does not blur).
   - If the input has no selection data (e.g. some touch keyboards), appends `"@"` to the end as a fallback.

3. Restructure the email `<label>` so the input and button sit in a relative row:
   - Wrap the `<input>` in a `relative` container.
   - Place the `"@"` button absolutely on the right (`absolute right-2 top-1/2 -translate-y-1/2`) with existing form styling tokens (`rounded-lg border border-input bg-background px-2 text-sm font-bold text-muted-foreground hover:bg-muted`), sized so it doesn't overlap text.
   - Add right padding to the input (`pr-12`) so typed text never hides behind the button.
   - Button type is `"button"` so it never submits the form.

4. Keep everything else byte-identical: the `required`, `autoComplete="email"`, `type="email"`, error/info banners, mode toggles, and signup-only fields.

## Verification
- Typecheck (`tsgo`) and production build.
- Playwright smoke: open `/auth`, tap the "@" button, confirm "@" appears in the field and focus stays in the input; confirm normal sign-in form still works.
