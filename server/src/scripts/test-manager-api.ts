import pool from '../db/index';

async function testManagerAPI() {
    const client = await pool.connect();
    try {
        // Simulate the exact query from the API
        const text = `
            SELECT 
                c.id as company_id, c.*,
                l.id as lease_id, l.start_date, l.end_date, l.monthly_rent, l.operating_fee, l.contract_url, l.documents as lease_documents,
                u.id as unit_id, u.number, u.floor, u.area_sqm, u.status,
                b.id as block_id, b.name as block_name, b.campus_id,
                cp.id as campus_id, cp.name as campus_name
            FROM companies c
            LEFT JOIN leases l ON l.company_id = c.id
            LEFT JOIN units u ON u.company_id = c.id
            LEFT JOIN blocks b ON u.block_id = b.id
            LEFT JOIN campuses cp ON b.campus_id = cp.id
            LIMIT 5
        `;

        const result = await client.query(text);

        console.log('Raw Database Query Results (First 5 rows):');
        console.log('===========================================');
        
        result.rows.forEach((row, index) => {
            console.log(`\nRow ${index + 1}:`);
            console.log(`  Company: ${row.name}`);
            console.log(`  manager_name: ${row.manager_name || 'NULL'}`);
            console.log(`  manager_phone: ${row.manager_phone || 'NULL'}`);
            console.log(`  manager_email: ${row.manager_email || 'NULL'}`);
        });

        // Now simulate the API mapping
        console.log('\n\nAPI Response Mapping (First 5 companies):');
        console.log('===========================================');
        
        const extendedData = result.rows.map(row => {
            const company = {
                id: row.company_id,
                name: row.name,
                registrationNumber: row.registration_number,
                sector: row.sector,
                businessAreas: row.business_areas || [],
                workArea: row.work_area,
                managerName: row.manager_name,
                managerPhone: row.manager_phone,
                managerEmail: row.manager_email,
                employeeCount: row.employee_count,
                score: parseFloat(row.score || 0),
                contractTemplate: row.contract_template,
                scoreEntries: [],
                documents: []
            };
            return company;
        });

        extendedData.forEach((company, index) => {
            console.log(`\nCompany ${index + 1}:`);
            console.log(`  Name: ${company.name}`);
            console.log(`  managerName: ${company.managerName || 'NULL'}`);
            console.log(`  managerPhone: ${company.managerPhone || 'NULL'}`);
            console.log(`  managerEmail: ${company.managerEmail || 'NULL'}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

testManagerAPI();
