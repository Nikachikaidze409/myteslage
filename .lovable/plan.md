# Fix: phone shows the receiver page instead of the sender page

## What is happening

The QR code points to the sender page at `/mirror-test/send`, but that address is currently treated as a sub-page *inside* the test page. The test page has no place to show a sub-page, so the car/phone just renders the receiver again — which is why both devices show "Waiting for the sender to join" on a black screen.

Nothing is wrong with the pairing, the room code, or the video connection itself. The sender screen simply never opens.

## The fix

1. Make the sender page a standalone page rather than a sub-page of the test page, so opening the QR link actually shows "Send screen to Tesla" with the **Start screen sharing** button.
2. Keep the same web address (`/mirror-test/send`) so the QR code and any link you already opened keep working.
3. Add a plain text link on the receiver page under the QR code, so you can also just type/tap through to the sender page if a scan misbehaves.

## Also worth knowing for the test

Your phone cannot share its screen from the browser at all — iPhone Safari has no screen sharing, and Android Chrome can only share a browser tab. For this first test use a **laptop** as the sender and the Tesla (or a second device) as the receiver. That still answers the only question this test exists to answer: can the car play a live stream smoothly.

## Technical detail

- Rename `src/routes/mirror-test.send.tsx` to `src/routes/mirror-test_.send.tsx`. The trailing underscore opts the route out of nesting under `/mirror-test`, making it a flat route at the same URL. The generated route tree updates itself.
- No change to `src/lib/mirror-signal.ts`, the receiver logic, or any navigation code.
- Verify by loading `/mirror-test/send?room=TEST12` and confirming the sender UI renders, then run typecheck and build.
