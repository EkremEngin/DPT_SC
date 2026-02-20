const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

(async () => {
    try {
        console.log('Connecting to', {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            db: process.env.DB_NAME,
            user: process.env.DB_USER
        });
        const res = await pool.query('SELECT NOW()');
        console.log('Success:', res.rows[0]);
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
})();
