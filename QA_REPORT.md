# Internal engineering QA record

Scope: shared-account application. Production changes deployed and live authentication/read-only checks completed on 2026-10-03; see deployment verification below. No portfolio trades or destructive live-data tests were performed.

## Portfolio frontend

Fixed null company-name search crashes, missing valuation handling, currency formatting, numeric/date/share validation, repeated transaction submissions, stale fetch responses, history failures, empty states, refresh/retry, modal labels and keyboard access to sold holdings. Active zero-valued holdings remain visible. Stored estimate prices are clearly distinguished. Retrieval time is shown separately from market quote time. Expired API authentication triggers the application's session-expiry event.

Focused checks: `node --test src/portfolioUtils.test.mjs` (4 tests); `npx eslint src/PortfolioView.jsx`.

## Authentication

`tests/auth.test.mjs` covers signed cookies, payload and signature forgery, expiration, unknown identities, unavailable signing configuration, configured PIN login, rate limiting, origin checks and fail-closed cron authentication. Tests use isolated synthetic values and never real credentials. Server owner removed fallback production PINs; at least one configured identity is required; both were configured for this deployment. Six tests pass, including missing identity configuration.

Residual considerations: rate limiting is per server instance; a distributed attacker can exceed that effective aggregate limit. Session signing currently falls back to a context-derived DATABASE_URL key if AUTH_SECRET is absent. Explicit separate signing secret and rotated PINs are preferred. Portfolios are shared between the two configured identities by design; this is not per-person tenant isolation.

## Research schedule

`.github/workflows/stock-research.yml` calls the existing HTTPS endpoint at 00:17, 08:17 and 16:17 UTC, with manual dispatch available. Uses repository CRON_SECRET, contents-read permission, no checkout, no financial response logging, request timeout, concurrency control, and explicit errors for missing secret, network/HTTP/JSON/API failure. Partial coverage and notification failures emit warnings. `tests/research-workflow.test.mjs` checks shell syntax and success/failure behavior using mocked requests (3 tests). External manual run succeeded: https://github.com/Lio311/shared-account/actions/runs/37110287062 (2026-10-03).

GitHub scheduled workflows run only on the default branch, can be delayed or dropped during high load, and public-repository schedules disable after 60 days without repository activity. Standard runners are free for public repositories; private repositories consume the account's included minutes and can incur charges beyond them. Verified against GitHub's primary documentation on 2026-10-03:

- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://docs.github.com/en/billing/concepts/product-billing/github-actions

## Source-data and credential exposure

Moved four public source workbooks into ignored `private-data/` without changing their contents. They must be excluded from the published static directory. Added `.env*` ignore with `.env.example` exception. `.env.deploy` was tracked and root owns removing it from the Git index; ignoring a tracked file alone does not remove it. A literal database connection was found in `check_db.mjs`; current source uses environment configuration and a local-development fallback. Secret scans report paths/line categories only, never credential values.

Previously committed credentials and public financial workbooks may remain recoverable from Git history and previous deployments. Rotate exposed production credentials, and review prior deployment access/retention. Current working-tree cleanup does not erase history or revoke credentials.

## Deployment state

Repository includes `vercel.json`. Standard Git credential helper `osxkeychain` is configured and installed; credential presence itself has not been requested or disclosed. Vercel CLI auth configuration exists on the host. No local gh/vercel executable was found on standard PATH. Root owns deployment configuration and authorization. No deployment/workflow run performed by this agent.

## Deployment verification (root)

Production authentication succeeds with the existing login. Read-only live checks returned 5 investments, 259 transactions, 4 salaries, and 0 projects. Fixed the screenshot's critical login/loading race: account requests now wait for server authentication and rerun after login; HTTP 401 returns to login, and partial server failures display an error/retry instead of a false empty account. Verified the populated transaction history visually on a 390 x 844 mobile viewport.

First authenticated research scan returned success: 33 distinct holdings covered, 2 unsupported/unavailable, one push subscription accepted and one rejected by the push service. Acceptance does not prove device receipt. The research report includes source coverage and notification status. No trading or financial writes were made. The report is saved separately.

37 regression checks, lint, production build, and whitespace checks pass. Current workbook/environment exports were removed from the Git index and deployment; local originals were preserved. Dedicated AUTH_SECRET and CRON_SECRET were configured on the existing Vercel project, and CRON_SECRET was encrypted in the existing GitHub repository. Owner confirmed the 15 ILS monthly fee; the old 0.5% monthly interest remains unverified and automatic monthly accounting remains disabled.

Remaining explicit gaps: exposed historical PIN/database credentials still require owner rotation; rate limiting is per instance; unsupported instruments lack verified news coverage; recommendations do not model portfolio allocation, tax, fees or fund overlap; schedule timing depends on GitHub availability; one existing push subscription failed and phone receipt needs owner confirmation. Legacy salaries/transactions lack a reliable foreign key. Live Bank of Israel provider format has not been independently verified.

Owner explicitly chose to keep the existing Vercel credentials on 2026-10-03. No rotation was performed; historical exposure remains a known accepted gap. Research report contained 190 eligible news links across 33 holdings; all suggestions were review/insufficient evidence in the first run, not buy/sell signals.

Follow-up requested by owner: recommendations now appear as compact buy/sell cards with expandable supporting sources, without a news feed or per-instrument insufficient-evidence cards. Corrected publisher counting for Yahoo-hosted news; regression test preserves failure when only one publisher is present. GET re-evaluates stored report evidence using the corrected rules without fetching new data or changing financial records. Transparent SVG logo published. Deprecated mobile metadata updated.

## Quarterly reports, discovery and annual charts (2026-10-03 follow-up)

54 regression tests pass, including latest-quarter periods/currencies, contradictory summary overrides, exclusion of active holdings, discovery source/deadline failures, P/E buy gates, historical TTM EPS continuity, negative/missing EPS, currency mismatches, split suppression, daily close preservation and history endpoint authentication/input guards. Lint and production build pass. Independent live Yahoo reads verified the Most Actives payload and AAPL valuation fields. Yahoo screener response schema currently differs from the installed library: only this call disables the library's result schema check; local discovery normalization still validates every consumed field. Historical chart values are reconstructed estimates with current quarterly reports, not information known at the historical date. No financial records are changed by these features.

## Personal stock requests

75 tests pass after adding the per-identity request queue, provider-resolved company search, ten-pending limit and duplicate prevention under transaction locks. Added checks for missing auth, input rejection before work, private request reads/404, private results excluded from shared reports, request scan priority/deduplication, complete-data readiness, failed-source retry, owner-only push subscriptions, exact UUID notification links, unsafe-link rejection, idempotent scan and atomic report/request rollback on persistence failure. Failed push keeps the analysis ready. Mobile push receipt still depends on a registered owner device and permission; unassigned legacy subscriptions are never sent a targeted request notification.

Live follow-up: company-name search, confirmation, queued state and ready analysis were verified through the production mobile UI. Manual request scan succeeded: https://github.com/Lio311/shared-account/actions/runs/37144433600 . A direct request URL survived authentication and opened its ready analysis. No phone receipt was asserted. Final mobile DOM checks showed dark ticker text, right-aligned request status, icons to the left of labels, no horizontal overflow, 16px form text, pan-x/pan-y touch policy and an explicit no-scale viewport. Owner explicitly requested mobile zoom prevention. Physical pinch gestures on an actual phone have not been independently exercised. Fixed global button hover styling overriding request-control contrast.
