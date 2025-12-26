-- Migration 003: Auth Refactor
-- Add region and auth_settings to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS region VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auth_settings JSONB DEFAULT '{}';

-- Create magic_codes table for passwordless login
CREATE TABLE IF NOT EXISTS magic_codes (
    email VARCHAR(255) PRIMARY KEY,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure TENANT_ADMIN role exists in users table (it's a string, so just making sure it's used consistently)
-- No changes needed to users table schema for now, as role is already VARCHAR(20)
