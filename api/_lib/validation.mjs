export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function bodyObject(raw) {
  let body = raw;
  if (typeof raw === 'string') {
    try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON body'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Expected an object body');
  return body;
}

export function finiteNumber(value, field, { min = 0, exclusive = false, fallback } = {}) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) throw new HttpError(400, `Invalid ${field}`);
  const number = Number(value);
  if (!Number.isFinite(number) || (exclusive ? number <= min : number < min)) throw new HttpError(400, `Invalid ${field}`);
  return number;
}

export function positiveId(value, field = 'id') {
  const id = finiteNumber(value, field, { exclusive: true });
  if (!Number.isSafeInteger(id)) throw new HttpError(400, `Invalid ${field}`);
  return id;
}

export function requiredText(value, field, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `Invalid ${field}`);
  return value.trim();
}

export function validDate(value, field = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) throw new HttpError(400, `Invalid ${field}`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new HttpError(400, `Invalid ${field}`);
  return date.toISOString();
}

export function performedBy(req) {
  if (req.auth?.person) return req.auth.person;
  const raw = req.headers?.['x-performed-by'] || 'מערכת';
  try { return decodeURIComponent(raw); } catch { return String(raw).slice(0, 100); }
}

export async function closeClient(client) {
  try { await client.end(); } catch { /* Cleanup must not replace the API response. */ }
}

// Header-based SDMX parsing avoids depending on the provider's column order.
export function historicalExchangeRate(csv, currency, latestDate) {
  const rows = String(csv).replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => {
    const columns = []; let current = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i++; } else quoted = !quoted; }
      else if (char === ',' && !quoted) { columns.push(current); current = ''; }
      else current += char;
    }
    columns.push(current); return columns;
  });
  const headers = rows.shift()?.map(header => header.toUpperCase());
  const valueIndex = headers?.indexOf('OBS_VALUE');
  const dateIndex = headers?.indexOf('TIME_PERIOD');
  if (valueIndex === undefined || valueIndex < 0 || dateIndex < 0) throw new HttpError(503, 'Historical exchange rate data format unavailable');
  const matches = rows.filter(row => row.some(value => value === `RER_${currency}_ILS`) && /^\d{4}-\d{2}-\d{2}$/.test(row[dateIndex]) && row[dateIndex] <= latestDate && Number.isFinite(Number(row[valueIndex])) && Number(row[valueIndex]) > 0);
  matches.sort((a, b) => b[dateIndex].localeCompare(a[dateIndex]));
  if (!matches.length) throw new HttpError(503, `Historical exchange rate unavailable for ${currency}`);
  return Number(matches[0][valueIndex]);
}
