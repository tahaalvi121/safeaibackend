-- Migration 004: Platform Admin Enhancements
-- Add metadata columns for internal management
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS region VARCHAR(50); -- Ensure consistency

-- Log table for internal platform admin actions
CREATE TABLE IF NOT EXISTS platform_audit_logs (
    id SERIAL PRIMARY KEY,
    admin_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    details JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure a demo platform admin user exists (hardcoded for now in this migration for testing)
-- In production, this would be managed via internal IdP
INSERT INTO users (id, tenant_id, email, password_hash, role, status)
VALUES ('platform-admin-1', 'safeai-internal', 'admin@safeai.internal', '$2a$10$rYhX/l0mX/uK7n9tN9e9O.9nN0nN0nN0nN0nN0nN0nN0nN0nN0n', 'PLATFORM_ADMIN', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
