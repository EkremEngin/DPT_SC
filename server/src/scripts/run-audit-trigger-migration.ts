import { query } from '../db';

async function runMigration() {
    console.log('🔒 Starting Append-Only Audit Protection Migration...');

    try {
        // Function to prevent UPDATE on audit_logs
        await query(`
            CREATE OR REPLACE FUNCTION prevent_audit_update()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Audit logs are append-only. UPDATE operation is not allowed on audit_logs table.';
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log('✅ Created prevent_audit_update function');

        // Function to prevent DELETE on audit_logs
        await query(`
            CREATE OR REPLACE FUNCTION prevent_audit_delete()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Audit logs are append-only. DELETE operation is not allowed on audit_logs table. Use soft delete if needed.';
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log('✅ Created prevent_audit_delete function');

        // Drop existing triggers if any
        await query(`DROP TRIGGER IF EXISTS trigger_prevent_audit_update ON audit_logs`);
        await query(`DROP TRIGGER IF EXISTS trigger_prevent_audit_delete ON audit_logs`);
        console.log('✅ Dropped existing triggers (if any)');

        // Create triggers
        await query(`
            CREATE TRIGGER trigger_prevent_audit_update
            BEFORE UPDATE ON audit_logs
            FOR EACH ROW
            EXECUTE FUNCTION prevent_audit_update();
        `);
        console.log('✅ Created trigger_prevent_audit_update');

        await query(`
            CREATE TRIGGER trigger_prevent_audit_delete
            BEFORE DELETE ON audit_logs
            FOR EACH ROW
            EXECUTE FUNCTION prevent_audit_delete();
        `);
        console.log('✅ Created trigger_prevent_audit_delete');

        // Add comment
        await query(`
            COMMENT ON TABLE audit_logs IS 'Append-only audit log table. UPDATE and DELETE operations are blocked by triggers for security and compliance.';
        `);
        console.log('✅ Added table comment');

        console.log('\n🎉 Migration completed successfully!');
        console.log('📝 Audit logs are now protected against UPDATE and DELETE operations.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration().then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
});
