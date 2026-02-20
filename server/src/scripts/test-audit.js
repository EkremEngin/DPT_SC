const { Pool } = require('pg');

const pool = new Pool({
    user: 'app',
    host: 'localhost',
    database: 'appdb',
    password: 'NewPass123!',
    port: 5432
});

async function testAuditLogs() {
    try {
        console.log('Testing audit_logs table...\n');

        // Check table structure
        const columnsResult = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'audit_logs' 
            ORDER BY ordinal_position
        `);
        console.log('Table columns:');
        columnsResult.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });

        // Check if there's any data
        const countResult = await pool.query('SELECT COUNT(*) FROM audit_logs');
        console.log(`\nTotal records: ${countResult.rows[0].count}`);

        // Try to query some data
        const dataResult = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 5');
        console.log(`\nSample data (${dataResult.rows.length} rows):`);
        dataResult.rows.forEach(row => {
            console.log(`  - ID: ${row.id}, Action: ${row.action}, Entity: ${row.entity_type}, Time: ${row.timestamp}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
        console.error('Details:', error);
    } finally {
        await pool.end();
    }
}

testAuditLogs();
