import { requireAuth } from './_lib/auth.mjs';
import { Client } from 'pg';
import { HttpError, finiteNumber, positiveId, requiredText, validDate, performedBy as getPerformedBy, closeClient } from './_lib/validation.mjs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  const performedBy = getPerformedBy(req);

  let inTransaction = false;
  try {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).send('Method Not Allowed');
    await client.connect();
    if (req.method !== 'GET') { await client.query('BEGIN'); inTransaction = true; }

    if (req.method === 'GET') {
      const result = await client.query('SELECT * FROM salaries ORDER BY month DESC');
      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['host'] || 'localhost';
      const url = `${protocol}://${host}${req.url}`;
      
      const webReq = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
        duplex: 'half'
      });

      const formData = await webReq.formData();
      const person_name = requiredText(formData.get('person_name'), 'person_name');
      const amount = finiteNumber(formData.get('amount'), 'amount', { exclusive: true });
      const monthInput = formData.get('month');
      const month = validDate(/^\d{4}-\d{2}$/.test(monthInput) ? `${monthInput}-01` : monthInput, 'month').slice(0, 10);
      const payslip = formData.get('payslip');

      let payslip_url = null;

      if (payslip && typeof payslip !== 'string' && payslip.size > 0) {
        if (payslip.size > 5 * 1024 * 1024) throw new HttpError(400, 'Payslip exceeds 5 MB');
        if (payslip.type !== 'application/pdf') throw new HttpError(400, 'Payslip must be a PDF');
        const arrayBuffer = await payslip.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Data = buffer.toString('base64');
        const contentType = payslip.type || 'application/pdf';
        const filename = `${Date.now()}_${payslip.name}`;

        await client.query(
          'INSERT INTO payslips (filename, content_type, data) VALUES ($1, $2, $3)',
          [filename, contentType, base64Data]
        );
        payslip_url = `/api/payslips/${filename}`;
      }

      const result = await client.query(
        'INSERT INTO salaries (person_name, amount, month, payslip_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [person_name, amount, month, payslip_url]
      );

      await client.query(
        'INSERT INTO transactions (date, amount, description, category, type) VALUES ($1, $2, $3, $4, $5)',
        [new Date(month).toISOString(), amount, `משכורת - ${person_name}`, 'משכורת', 'income']
      );

      const auditDesc = `הועלה תלוש שכר ומשכורת עבור "${person_name}" על סך ₪${Number(amount).toLocaleString()} לחודש ${String(month).substring(0, 7)}`;
      await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
        [performedBy, 'הוספה', 'משכורת', auditDesc]
      );

      await client.query('COMMIT'); inTransaction = false;
      return res.status(201).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = positiveId(req.query?.id);
      if (!id) {
        return res.status(400).json({ error: 'Missing salary ID' });
      }

      const salaryRes = await client.query('SELECT * FROM salaries WHERE id = $1', [id]);
      if (salaryRes.rows.length === 0) {
        return res.status(404).json({ error: 'Salary not found' });
      }

      const { person_name, amount, month, payslip_url } = salaryRes.rows[0];

      if (payslip_url) {
        {
          const parts = payslip_url.split('/');
          const filename = parts[parts.length - 1];
          await client.query('DELETE FROM payslips WHERE filename = $1', [filename]);
        }
      }

      await client.query('DELETE FROM salaries WHERE id = $1', [id]);

      await client.query(
        "DELETE FROM transactions WHERE id = (SELECT id FROM transactions WHERE description = $1 AND category = 'משכורת' AND type = 'income' AND amount = $2 AND date::date = $3::date ORDER BY id ASC LIMIT 1)",
        [`משכורת - ${person_name}`, amount, month]
      );

      const auditDesc = `נמחק תלוש שכר ומשכורת עבור "${person_name}" על סך ₪${Number(amount).toLocaleString()} לחודש ${String(month).substring(0, 7)}`;
      await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
        [performedBy, 'מחיקה', 'משכורת', auditDesc]
      );

      await client.query('COMMIT'); inTransaction = false;
      return res.status(200).json({ success: true });
    }

    return res.status(405).send('Method Not Allowed');
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Operation failed' });
  } finally {
    if (inTransaction) { try { await client.query('ROLLBACK'); } catch { /* Connection may already be closed. */ } }
    await closeClient(client);
  }
}
