const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('CONNECTION ERROR:', err.message);
        console.error('FULL ERROR:', err);
        process.exit(1);
    }
    console.log('SUCCESSFULLY CONNECTED TO DATABASE');
    client.query('SELECT current_database(), current_user', (err, result) => {
        release();
        if (err) {
            console.error('QUERY ERROR:', err.message);
            process.exit(1);
        }
        console.log('QUERY RESULT:', result.rows[0]);
        process.exit(0);
    });
});
