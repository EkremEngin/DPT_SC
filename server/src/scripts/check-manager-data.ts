import pool from '../db/index';

async function checkManagerData() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT name, manager_name, manager_phone, manager_email 
            FROM companies 
            LIMIT 10
        `);
        
        console.log('Company Manager Data:');
        console.log('======================');
        result.rows.forEach(row => {
            console.log(`Company: ${row.name}`);
            console.log(`  Manager: ${row.manager_name || 'NULL'}`);
            console.log(`  Phone: ${row.manager_phone || 'NULL'}`);
            console.log(`  Email: ${row.manager_email || 'NULL'}`);
            console.log('---');
        });
        
        // Count how many have manager data
        const countResult = await client.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(manager_name) as with_manager,
                COUNT(manager_phone) as with_phone,
                COUNT(manager_email) as with_email
            FROM companies
        `);
        
        console.log('\nSummary:');
        console.log('========');
        console.log(`Total companies: ${countResult.rows[0].total}`);
        console.log(`With manager name: ${countResult.rows[0].with_manager}`);
        console.log(`With phone: ${countResult.rows[0].with_phone}`);
        console.log(`With email: ${countResult.rows[0].with_email}`);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkManagerData();
