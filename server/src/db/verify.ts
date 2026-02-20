
import pool from './index';

async function verify() {
    console.log('🔍 Verifying database...');
    const client = await pool.connect();

    try {
        const tables = ['campuses', 'blocks', 'companies', 'units', 'leases'];
        for (const table of tables) {
            const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
            console.log(`Table ${table}: ${res.rows[0].count} rows`);
        }
    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

verify();
