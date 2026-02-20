import pool from '../db/index';

async function checkBusinessAreas() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT name, business_areas 
            FROM companies 
            WHERE business_areas IS NOT NULL 
            AND array_length(business_areas, 1) > 0
            LIMIT 10
        `);
        
        console.log('Company Business Areas:');
        console.log('=======================');
        result.rows.forEach(row => {
            console.log(`Company: ${row.name}`);
            console.log(`  Business Areas: ${JSON.stringify(row.business_areas)}`);
            console.log('---');
        });

        // Count how many have business areas
        const countResult = await client.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(business_areas) as with_business_areas
            FROM companies
        `);
        
        console.log('\nSummary:');
        console.log('========');
        console.log(`Total companies: ${countResult.rows[0].total}`);
        console.log(`With business areas: ${countResult.rows[0].with_business_areas}`);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkBusinessAreas();
