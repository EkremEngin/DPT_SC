import { query } from './src/db';

async function check() {
    try {
        const leasesRes = await query(`SELECT * FROM leases WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 3`);
        console.log("LEASES:", leasesRes.rows);

        const companiesRes = await query(`SELECT id, contract_template FROM companies WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 3`);
        console.log("COMPANIES:", companiesRes.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
