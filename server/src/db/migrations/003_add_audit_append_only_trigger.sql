-- Migration 003: Append-Only Audit Protection
-- This migration adds a trigger to prevent UPDATE and DELETE operations on audit_logs table
-- Audit logs should be append-only for security and compliance

-- Function to prevent UPDATE on audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are append-only. UPDATE operation is not allowed on audit_logs table.';
END;
$$ LANGUAGE plpgsql;

-- Function to prevent DELETE on audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are append-only. DELETE operation is not allowed on audit_logs table. Use soft delete if needed.';
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_prevent_audit_update ON audit_logs;
DROP TRIGGER IF EXISTS trigger_prevent_audit_delete ON audit_logs;

CREATE TRIGGER trigger_prevent_audit_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_update();

CREATE TRIGGER trigger_prevent_audit_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_delete();

-- Comment to document the protection
COMMENT ON TABLE audit_logs IS 'Append-only audit log table. UPDATE and DELETE operations are blocked by triggers for security and compliance.';
