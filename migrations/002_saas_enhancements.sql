-- Milestone 3: SaaS Enhancements
-- Add policy_mode and settings to tenants table

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS policy_mode VARCHAR(20) DEFAULT 'STANDARD';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Add override columns to policies if needed, but JSONB rules in policies table is better.
-- For now, we stick to the existing policies table structure but rely on tenant.policy_mode for high-level defaults.

-- Ensure tenants table has an index on id if not primary key (it is PK).
