# Rebrand production site to TMap Georgia

## Scope
- Replace every public-facing use of “Tesla Map Georgia” and “TeslaNavi” with “TMap Georgia” across navigation, homepage, pricing, checkout, authentication, account screens, legal pages, diagnostics, and customer-facing payment descriptions.
- Keep “Tesla” only where it describes compatible vehicles or Tesla in-car browsers; add the required independent-product disclaimer to the public footer and legal pages.
- Make `https://tmap.ge` the canonical public website in page metadata and new payment return/callback URLs.

## Compatibility safeguards
- Preserve existing internal plan/product IDs, storage keys, environment-variable names, database records, users, memberships, and all entitlement behavior.
- Preserve the existing `teslanavi.online` BOG callback, success, failure, and scheduled-renewal URLs as accepted legacy paths while adding `tmap.ge` as the default for newly created payment flows.
- Do not modify navigation, GPS, route calculation, rerouting, Google Maps behavior, BOG verification/renewal rules, Paddle subscription rules, credentials, pricing, or database behavior.

## Paddle review readiness
- Ensure the public site clearly shows the TMap Georgia name, browser-navigation purpose, current prices and features, Terms, Privacy Notice, Refund Policy, and the exact Tesla non-affiliation disclaimer.
- Add complete, unique page metadata and canonical links to public content pages.

## Verification and report
- Run the complete automated test suite, TypeScript check, and production build.
- Re-scan the repository and report every remaining old-name or legacy-domain occurrence with its compatibility reason.
- Report changed files and explicitly confirm that BOG recurring billing, Paddle subscriptions, users, memberships, prices, and navigation behavior are unchanged.
