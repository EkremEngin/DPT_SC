import { query } from '../db';

async function runSoftDeleteMigration() {
    console.log('Starting Soft Delete Migration...');

    try {
        // Add deleted_at column to campuses
        await query(`ALTER TABLE campuses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL`);
        console.log('✓ campuses.deleted_at column added');

        // Add deleted_at column to blocks
        await query(`ALTER TABLE blocks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL`);
        console.log('✓ blocks.deleted_at column added');

        // Add deleted_at column to units
        await query(`ALTER TABLE units ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL`);
        console.log('✓ units.deleted_at column added');

        // Add deleted_at column to companies
        await query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL`);
        console.log('✓ companies.deleted_at column added');

        // Add deleted_at column to leases
        await query(`ALTER TABLE leases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL`);
        console.log('✓ leases.deleted_at column added');

        // Add deleted_at column to company_score_entries
        await query(`ALTER TABLE company_score_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL`);
        console.log('✓ company_score_entries.deleted_at column added');

        // Add deleted_at column to company_documents
        await query(`ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL`);
        console.log('✓ company_documents.deleted_at column added');

        // Create indexes for deleted_at columns
        await query(`CREATE INDEX IF NOT EXISTS idx_campuses_deleted_at ON campuses(deleted_at) WHERE deleted_at IS NOT NULL`);
        console.log('✓ idx_campuses_deleted_at index created');

        await query(`CREATE INDEX IF NOT EXISTS idx_blocks_deleted_at ON blocks(deleted_at) WHERE deleted_at IS NOT NULL`);
        console.log('✓ idx_blocks_deleted_at index created');

        await query(`CREATE INDEX IF NOT EXISTS idx_units_deleted_at ON units(deleted_at) WHERE deleted_at IS NOT NULL`);
        console.log('✓ idx_units_deleted_at index created');

        await query(`CREATE INDEX IF NOT EXISTS idx_companies_deleted_at ON companies(deleted_at) WHERE deleted_at IS NOT NULL`);
        console.log('✓ idx_companies_deleted_at index created');

        await query(`CREATE INDEX IF NOT EXISTS idx_leases_deleted_at ON leases(deleted_at) WHERE deleted_at IS NOT NULL`);
        console.log('✓ idx_leases_deleted_at index created');

        await query(`CREATE INDEX IF NOT EXISTS idx_company_score_entries_deleted_at ON company_score_entries(deleted_at) WHERE deleted_at IS NOT NULL`);
        console.log('✓ idx_company_score_entries_deleted_at index created');

        await query(`CREATE INDEX IF NOT EXISTS idx_company_documents_deleted_at ON company_documents(deleted_at) WHERE deleted_at IS NOT NULL`);
        console.log('✓ idx_company_documents_deleted_at index created');

        console.log('\n✅ Soft Delete Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runSoftDeleteMigration().then(() => {
    console.log('\nMigration script finished.');
    process.exit(0);
}).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
