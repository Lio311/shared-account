import { Client } from 'pg';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require',
  });

  const rawPerformedBy = req.headers['x-performed-by'] || 'מערכת';
  const performedBy = decodeURIComponent(rawPerformedBy);

  try {
    await client.connect();

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
      const person_name = formData.get('person_name');
      const amount = parseFloat(formData.get('amount'));
      const month = formData.get('month');
      const payslip = formData.get('payslip');

      let payslip_url = null;

      if (payslip && typeof payslip !== 'string' && payslip.size > 0) {
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

      return res.status(201).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id);
      if (!id) {
        return res.status(400).json({ error: 'Missing salary ID' });
      }

      const salaryRes = await client.query('SELECT * FROM salaries WHERE id = $1', [id]);
      if (salaryRes.rows.length === 0) {
        return res.status(404).json({ error: 'Salary not found' });
      }

      const { person_name, amount, month, payslip_url } = salaryRes.rows[0];

      if (payslip_url) {
        try {
          const parts = payslip_url.split('/');
          const filename = parts[parts.length - 1];
          await client.query('DELETE FROM payslips WHERE filename = $1', [filename]);
        } catch (blobErr) {
          console.error('Error deleting payslip from DB:', blobErr);
        }
      }

      await client.query('DELETE FROM salaries WHERE id = $1', [id]);

      await client.query(
        "DELETE FROM transactions WHERE description = $1 AND category = 'משכורת' AND type = 'income'",
        [`משכורת - ${person_name}`]
      );

      const auditDesc = `נמחק תלוש שכר ומשכורת עבור "${person_name}" על סך ₪${Number(amount).toLocaleString()} לחודש ${String(month).substring(0, 7)}`;
      await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
        [performedBy, 'מחיקה', 'משכורת', auditDesc]
      );

      return res.status(200).json({ success: true });
    }

    return res.status(405).send('Method Not Allowed');
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
