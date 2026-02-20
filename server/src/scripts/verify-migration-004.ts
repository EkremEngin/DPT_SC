import { query } from '../db/index';

async function verifyIndexes() {
    try {
        const result = await query(`
            SELECT indexname, tablename, indexdef
            FROM pg_indexes 
            WHERE schemaname = 'public' 
              AND indexname LIKE 'idx_%'
            ORDER BY indexname;
        `);
        
        console.log('All indexes in database:');
        console.table(result.rows);
        
        // Check for Phase 5.2 indexes specifically
        const phase5Indexes = [
            'idx_dashboard_revenue',
            'idx_dashboard_occupancy',
            'idx_campus_breakdown',
            'idx_leases_details_companies',
            'idx_leases_details_units',
            'idx_units_block_floor_number',
            'idx_units_vacant',
            'idx_units_occupied',
            'idx_companies_search',
            'idx_leases_expiring',
            'idx_audit_logs_user_timestamp'
        ];
        
        const existingIndexes = result.rows.map((r: any) => r.indexname);
        const missingIndexes = phase5Indexes.filter(name => !existingIndexes.includes(name));
        const createdIndexes = phase5Indexes.filter(name => existingIndexes.includes(name));
        
        console.log('\n=== Phase 5.2 Index Verification ===');
        console.log(`Created: ${createdIndexes.length}/${phase5Indexes.length}`);
        if (createdIndexes.length > 0) {
            console.log('✓ Created indexes:', createdIndexes.join(', '));
        }
        if (missingIndexes.length > 0) {
            console.log('✗ Missing indexes:', missingIndexes.join(', '));
        }
        
        process.exit(missingIndexes.length > 0 ? 1 : 0);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verifyIndexes();
