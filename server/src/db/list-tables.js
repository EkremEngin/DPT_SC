const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Connected to:', process.env.DB_NAME, 'at', process.env.DB_HOST);
        const res = await client.query(`
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
            AND table_schema NOT IN ('pg_catalog', 'information_schema');
        `);
        console.log('Tables found:');
        res.rows.forEach(row => {
            console.log(`${row.table_schema}.${row.table_name}`);
        });
    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

run();
