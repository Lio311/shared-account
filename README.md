# Shared Account

Hebrew RTL mobile-first finance dashboard with shared household records, investments, portfolios, payslips and a stock research feed. React/Vite frontend and Vercel Node API, backed by PostgreSQL.

## Development and checks

- `npm install`
- `npm run dev` runs the frontend. Vite alone does not serve the database API.
- `npm run lint`, `npm test`, `npm run build`

Configure server environments from `.env.example`. Never use a `VITE_` variable for a private credential. Authentication uses a signed HttpOnly cookie; configure a random `AUTH_SECRET` and distinct server-only login PINs. API requests require the cookie. The shared application grants both configured identities access to the joint records.

The regression suite mocks the database, authentication and network. It never executes the historical database utility scripts. Source workbook backups live in ignored `private-data/`. Environment files and financial source workbooks must stay outside both Git and the static deployment.

## Stock research

`GET /api/stock-research` reads the latest report for an authenticated user. `POST` requires `Authorization: Bearer <CRON_SECRET>` and scans active holdings from the database. It writes only a separate `stock_research_reports` table, never trades or changes holdings. Reports retain 30 days; a PostgreSQL advisory lock and unique versioned eight-hour run key prevent duplicate scans and pushes.

Yahoo Finance provides free news and analyst/fundamental summaries. Articles require explicit ticker attribution, HTTPS links and publication within seven days. Every holding appears in the coverage report, including unsupported Israeli instruments and failed sources. Each scan has a time budget; omitted requests are explicitly reported as failures. No paid model or data API is used.

Suggestions are transparent rules for review, with source links and limitations, rather than trading orders or validated return predictions. A buy/sell candidate requires at least five analyst opinions, consistent positive/negative revenue growth and operating margin, and news from at least two named publishers. Multiple publishers can syndicate the same story; they do not establish independent confirmation. Unknown analyst rating dates and allocation/tax/cost gaps remain visible. A negative holding is flagged for short review. Leveraged securities, including NVDL, are permitted under the owner's clarified policy; borrowing/margin/short positions are prohibited. Policy: at least five years, moderate risk, no planned withdrawal and no cap on leveraged securities currently.

Buy candidates additionally require positive provider trailing EPS and trailing P/E. A P/E of 50 or more requires a positive provider PEG of at most 2; missing PEG is never manufactured from quarterly revenue/earnings growth. Forward P/E is shown as forecast-based context. These thresholds are explicit screening heuristics, not industry-normalized fair value. A high P/E alone never triggers selling. Financial ratio interpretation: https://www.finra.org/investors/investing/investment-products/stocks/evaluating-stocks .

Latest-report metrics come from Yahoo fundamentalsTimeSeries quarterly (3M) observations. Period end is shown explicitly, publication date stays unknown, reporting currency is taken from financialCurrency and is never inferred from the share trading currency. Revenue, net income, operating income and diluted EPS retain zero values; prior-year growth requires the matching quarter, and operating margin uses that same quarter. Missing values are omitted. Latest quarter growth/margin take precedence over provider summary values where available.

The outside-portfolio discovery tab samples Yahoo Most Actives US-listed USD equities with market cap at least $2B and a positive latest-session move. It excludes all active holdings, ranks relative volume and session price change, researches up to eight candidates, and displays up to four meeting the same buy-review evidence rules. This is a bounded discovery sample rather than a whole-market ranking. Quote timestamps and methodology are kept with each report. Both discovery and quarterly-source failures preserve the rest of the holdings scan.

Each action card centers the ticker/company and its metrics, shows available latest-quarter figures, and lazily loads authenticated one-year charts when expanded. Seven metrics are selectable: daily share price, estimated quarter-end trailing P/E, operating margin, revenue, diluted EPS, net income and free cash flow. Financial metrics remain quarterly, missing points remain gaps. Historical P/E requires four consecutive quarters of positive aggregate EPS, matching currencies, a recent quarter-end close and no observed split over the source window; it is reconstructed with currently available reports, not the valuation known at that historical date.

The GitHub workflow runs at 00:17, 08:17 and 16:17 UTC with `CRON_SECRET` in repository secrets. It reports failure without logging financial payloads. Scheduling can be delayed or disabled after prolonged public-repository inactivity. Standard public-repository runners use the free tier. Mobile push uses existing browser subscriptions and requires device permission; lock-screen research notifications contain no financial details.

## Requested stock research

Authenticated users can search a company name or ticker, select a provider-confirmed equity/ETF, and queue research for the next scheduled scan. `GET /api/stock-requests?q=...` resolves matches; POST accepts a confirmed symbol. Each identity has up to ten pending requests; a transaction/person lock and partial unique index prevent duplicate pending requests and concurrent limit races. Reads and direct UUID links are scoped to the authenticated identity.

The existing scan prioritizes up to ten queued symbols, deduplicates overlaps with holdings, and keeps private requested results out of the shared report. Completion requires successful source coverage, fundamentals and a quarterly report; incomplete sources stay queued for a retry. Report storage and request completion commit together before notifications. Personal results persist separately in stock_research_requests. The UI polls while visible and shows pending/ready states, with the existing seven annual charts and valuation context.

Device subscriptions are assigned to the identity registering them. A queued request can bind its current browser's existing legacy subscription if unassigned, and never overwrites another identity's ownership. Completion pushes target only that identity's subscriptions and use a safe `/?view=research&request=<UUID>` direct link; notification text does not reveal a stock name or personal position. Unassigned legacy devices need registration or a request from that device. Failed/unavailable push attempts retain the ready analysis and retry in a later scan. Receiving mobile push requires permission and a supported browser; on iPhone open the installed home-screen app. Provider gaps can delay research beyond a single eight-hour cycle.

## Monthly accounting

The previous code used a monthly rate of 0.005 and a 15 ILS fee. The owner confirmed the fee, but not the interest rate. Automatic accounting therefore stays disabled until the actual broker terms are confirmed and `MONTHLY_ACCOUNTING_ENABLED=true` plus explicit rate/fee values are configured. The historical number in the code is not evidence of a contractual rate.

See `QA_REPORT.md` for verification scope and remaining limitations. Historical credential exposure must be addressed by rotation; removing files from the current revision does not revoke old credentials or erase previous deployments.
