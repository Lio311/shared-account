# Shared Account

Hebrew RTL mobile-first finance dashboard with shared household records, investments, portfolios, payslips and a stock research feed. React/Vite frontend and Vercel Node API, backed by PostgreSQL.

## Development and checks

- `npm install`
- `npm run dev` runs the frontend. Vite alone does not serve the database API.
- `npm run lint`, `npm test`, `npm run build`

Configure server environments from `.env.example`. Never use a `VITE_` variable for a private credential. Authentication uses a signed HttpOnly cookie; configure a random `AUTH_SECRET` and distinct server-only login PINs. API requests require the cookie. The shared application grants both configured identities access to the joint records.

The regression suite mocks the database, authentication and network. It never executes the historical database utility scripts. Source workbook backups live in ignored `private-data/`. Environment files and financial source workbooks must stay outside both Git and the static deployment.

## Stock research

`GET /api/stock-research` reads the latest report for an authenticated user. `POST` requires `Authorization: Bearer <CRON_SECRET>` and scans active holdings from the database. It writes only a separate `stock_research_reports` table, never trades or changes holdings. Reports retain 30 days; a PostgreSQL advisory lock and unique eight-hour run key prevent duplicate scans and pushes.

Yahoo Finance provides free news and analyst/fundamental summaries. Articles require explicit ticker attribution, HTTPS links and publication within seven days. Every holding appears in the coverage report, including unsupported Israeli instruments and failed sources. Each scan has a time budget; omitted requests are explicitly reported as failures. No paid model or data API is used.

Suggestions are transparent rules for review, with source links and limitations, rather than trading orders or validated return predictions. A buy/sell candidate requires at least five analyst opinions, consistent positive/negative revenue growth and operating margin, and news from at least two named publishers. Multiple publishers can syndicate the same story; they do not establish independent confirmation. Unknown analyst rating dates and allocation/tax/cost gaps remain visible. A negative holding is flagged for short review. Leveraged securities, including NVDL, are permitted under the owner's clarified policy; borrowing/margin/short positions are prohibited. Policy: at least five years, moderate risk, no planned withdrawal and no cap on leveraged securities currently.

The GitHub workflow runs at 00:17, 08:17 and 16:17 UTC with `CRON_SECRET` in repository secrets. It reports failure without logging financial payloads. Scheduling can be delayed or disabled after prolonged public-repository inactivity. Standard public-repository runners use the free tier. Mobile push uses existing browser subscriptions and requires device permission; lock-screen research notifications contain no financial details.

## Monthly accounting

The previous code used a monthly rate of 0.005 and a 15 ILS fee. The owner confirmed the fee, but not the interest rate. Automatic accounting therefore stays disabled until the actual broker terms are confirmed and `MONTHLY_ACCOUNTING_ENABLED=true` plus explicit rate/fee values are configured. The historical number in the code is not evidence of a contractual rate.

See `QA_REPORT.md` for verification scope and remaining limitations. Historical credential exposure must be addressed by rotation; removing files from the current revision does not revoke old credentials or erase previous deployments.
