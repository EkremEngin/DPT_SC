import { query } from '../db';

async function applyIndexes() {
    console.log('Applying missing performance indexes...');
    try {
        await query(`
            -- Phase 5.3: Missing Targeted Partial Indexes for deleted_at IS NULL
            
            -- Companies
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_deleted_partial
            ON companies(id) WHERE deleted_at IS NULL;
            
            -- Units
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_deleted_partial
            ON units(id) WHERE deleted_at IS NULL;
            
            -- Blocks
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blocks_deleted_partial
            ON blocks(id) WHERE deleted_at IS NULL;
            
            -- Campuses
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campuses_deleted_partial
            ON campuses(id) WHERE deleted_at IS NULL;

            -- Leases
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leases_deleted_partial
            ON leases(id) WHERE deleted_at IS NULL;
            
            -- Sectors
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sectors_deleted_partial
            ON sectors(id) WHERE deleted_at IS NULL;
            
            -- Company Score Entries FK Index
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_score_entries_comp_fk
            ON company_score_entries(company_id) WHERE deleted_at IS NULL;

            -- Company Documents FK Index
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_comp_fk
            ON company_documents(company_id) WHERE deleted_at IS NULL;
        `);
        console.log('Successfully applied missing performance indexes.');
    } catch (err) {
        console.error('Error applying indexes:', err);
    } finally {
        process.exit(0);
    }
}

applyIndexes();
