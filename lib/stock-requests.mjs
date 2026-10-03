export const MAX_PENDING_REQUESTS = 10;
export const validResearchSymbol = value => typeof value === 'string' && /^[A-Z][A-Z0-9.-]{0,14}$/.test(value);
export const validRequestId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const requestUrl = id => validRequestId(id) ? `/?view=research&request=${id}` : '/?view=research';
export const researchReady = result => Boolean(result && ['available', 'no_recent_news'].includes(result.status) && result.fundamentals && result.latestReport);
export async function ensureRequestsTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS stock_research_requests (
    id UUID PRIMARY KEY, person TEXT NOT NULL, symbol TEXT NOT NULL, instrument_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ, attempts INTEGER NOT NULL DEFAULT 0,
    result JSONB, notification_status JSONB
  )`);
  await client.query("CREATE UNIQUE INDEX IF NOT EXISTS stock_request_pending_unique ON stock_research_requests(person, symbol) WHERE status = 'pending'");
}
