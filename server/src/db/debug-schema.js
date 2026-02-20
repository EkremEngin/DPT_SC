const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const queries = schema.split(';').filter(q => q.trim().length > 0);

async function run() {
    const client = await pool.connect();
    try {
        for (let q of queries) {
            console.log('EXECUTING:', q.trim().substring(0, 50) + '...');
            try {
                await client.query(q);
                console.log('SUCCESS');
            } catch (err) {
                console.error('FAILURE on query:', q.trim());
                console.error('ERROR MESSAGE:', err.message);
                console.error('ERROR CODE:', err.code);
                // process.exit(1); // Don't exit yet, see if others fail
            }
        }
    } finally {
        client.release();
        process.exit(0);
    }
}

run();
