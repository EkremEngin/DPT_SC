/**
 * System Reset Script
 * 
 * This script resets the system by:
 * 1. Clearing audit logs
 * 2. Restoring soft-deleted records
 * 3. Reporting system state
 */

import { query } from '../db';

async function resetSystem() {
    console.log('🔄 Starting system reset...\n');

    try {
        // Step 1: Clear audit logs
        console.log('1️⃣ Clearing audit logs...');
        const auditResult = await query('DELETE FROM audit_logs');
        console.log(`✓ Cleared ${auditResult.rowCount} audit log entries\n`);

        // Step 2: Restore all soft-deleted records
        console.log('2️⃣ Restoring soft-deleted records...');
        
        const tables = [
            { name: 'campuses', sql: 'UPDATE campuses SET deleted_at = NULL WHERE deleted_at IS NOT NULL' },
            { name: 'blocks', sql: 'UPDATE blocks SET deleted_at = NULL WHERE deleted_at IS NOT NULL' },
            { name: 'units', sql: 'UPDATE units SET deleted_at = NULL WHERE deleted_at IS NOT NULL' },
            { name: 'companies', sql: 'UPDATE companies SET deleted_at = NULL WHERE deleted_at IS NOT NULL' },
            { name: 'leases', sql: 'UPDATE leases SET deleted_at = NULL WHERE deleted_at IS NOT NULL' },
            { name: 'company_documents', sql: 'UPDATE company_documents SET deleted_at = NULL WHERE deleted_at IS NOT NULL' },
            { name: 'company_score_entries', sql: 'UPDATE company_score_entries SET deleted_at = NULL WHERE deleted_at IS NOT NULL' }
        ];

        let totalRestored = 0;
        for (const table of tables) {
            const result = await query(table.sql);
            const count = result.rowCount || 0;
            totalRestored += count;
            if (count > 0) {
                console.log(`  ✓ Restored ${count} records from ${table.name}`);
            }
        }
        
        if (totalRestored === 0) {
            console.log('  ✓ No deleted records found (system already clean)');
        }
        console.log(`✓ Total restored: ${totalRestored} records\n`);

        // Step 3: Verify the reset
        console.log('3️⃣ Verifying system state...');
        
        const [auditCount, campusCount, blockCount, unitCount, companyCount, leaseCount] = await Promise.all([
            query('SELECT COUNT(*) as count FROM audit_logs'),
            query('SELECT COUNT(*) as count FROM campuses WHERE deleted_at IS NULL'),
            query('SELECT COUNT(*) as count FROM blocks WHERE deleted_at IS NULL'),
            query('SELECT COUNT(*) as count FROM units WHERE deleted_at IS NULL'),
            query('SELECT COUNT(*) as count FROM companies WHERE deleted_at IS NULL'),
            query('SELECT COUNT(*) as count FROM leases WHERE deleted_at IS NULL')
        ]);

        console.log('  📊 System State:');
        console.log('    • Audit logs:', auditCount.rows[0].count);
        console.log('    • Active campuses:', campusCount.rows[0].count);
        console.log('    • Active blocks:', blockCount.rows[0].count);
        console.log('    • Active units:', unitCount.rows[0].count);
        console.log('    • Active companies:', companyCount.rows[0].count);
        console.log('    • Active leases:', leaseCount.rows[0].count);
        console.log('');

        console.log('✅ System reset complete!\n');
        console.log('📝 Next steps:');
        console.log('  1. Restart the backend server (Ctrl+C and npm run dev)');
        console.log('  2. Refresh the frontend in your browser');
        console.log('');
        
    } catch (error) {
        console.error('❌ Error during system reset:', error);
        throw error;
    }
}

// Run the reset
resetSystem().then(() => {
    console.log('Done!');
    process.exit(0);
}).catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
});
