import { query } from './src/db';
import * as fs from 'fs';

async function check() {
    try {
        const companyRes = await query(`SELECT * FROM companies WHERE name = 'Eqo' LIMIT 1`);
        const company = companyRes.rows[0];
        let units = [];
        let leases = [];
        if (company) {
            const unitsRes = await query(`SELECT * FROM units WHERE company_id = $1`, [company.id]);
            units = unitsRes.rows;
            const leasesRes = await query(`SELECT * FROM leases WHERE company_id = $1`, [company.id]);
            leases = leasesRes.rows;
        }

        fs.writeFileSync('debugEqo.json', JSON.stringify({ company, units, leases }, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
