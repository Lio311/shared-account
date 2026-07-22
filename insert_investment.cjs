const { Client } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        // Check if exists
        const check = await client.query("SELECT id FROM investments WHERE owner_name = 'ליאור הבן' AND type = 'חשבון מסחר'");
        if (check.rows.length === 0) {
            const res = await client.query(`
                INSERT INTO investments (owner_name, name, type, current_value, initial_value, monthly_addition, last_value_update) 
                VALUES ('ליאור הבן', 'תיק מניות', 'חשבון מסחר', 0, 0, 0, NOW()) RETURNING *
            `);
            console.log('Inserted:', res.rows[0]);
        } else {
            console.log('Already exists');
        }
    } catch (err) {
        console.error(err.stack);
    } finally {
        await client.end();
    }
}

main();
