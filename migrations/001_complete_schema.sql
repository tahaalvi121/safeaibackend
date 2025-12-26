-- Complete Milestone 2 Database Schema
-- Drop existing tables if needed (for clean setup)
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS wizard_sessions CASCADE;
DROP TABLE IF EXISTS badges CASCADE;
DROP TABLE IF EXISTS policies CASCADE;
DROP TABLE IF EXISTS personas CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Tenants table (enhanced)
CREATE TABLE tenants (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  default_language VARCHAR(5) DEFAULT 'en',
  retention_days INTEGER DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  allow_rehydration BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table (enhanced)
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'User',
  preferred_language VARCHAR(5) NULL,
  selected_persona_id VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  last_login TIMESTAMP NULL
);

-- Policies table (per tenant, per category)
CREATE TABLE policies (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  decision VARCHAR(10) NOT NULL CHECK (decision IN ('ALLOW', 'WARN', 'BLOCK')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, category)
);

-- Events table (telemetry)
CREATE TABLE events (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id) ON DELETE CASCADE,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  event_type VARCHAR(50) NOT NULL,
  decision VARCHAR(10) NULL,
  risk_level VARCHAR(10) NULL,
  categories TEXT[] NULL,
  tool VARCHAR(20) NOT NULL
);

-- Wizard Sessions table
CREATE TABLE wizard_sessions (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id) ON DELETE CASCADE,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  original_doc_text TEXT NOT NULL,
  sanitized_doc_text TEXT NOT NULL,
  doc_summary TEXT NULL,
  doc_type VARCHAR(100) NULL,
  title VARCHAR(255) NULL,
  entity_map JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- Personas table
CREATE TABLE personas (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  system_template TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  tenant_id VARCHAR(255) NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Badges table
CREATE TABLE badges (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  public_url VARCHAR(500) NULL,
  verification_token VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_events_tenant ON events(tenant_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_wizard_sessions_tenant ON wizard_sessions(tenant_id);
CREATE INDEX idx_wizard_sessions_expires ON wizard_sessions(expires_at);
CREATE INDEX idx_policies_tenant ON policies(tenant_id);
CREATE INDEX idx_personas_tenant ON personas(tenant_id);
CREATE INDEX idx_badges_tenant ON badges(tenant_id);

-- Insert default personas
INSERT INTO personas (id, name, description, system_template, enabled, tenant_id) VALUES
('tax_advisor', 'Tax Advisor', 'Helps with clarifying tax-related questions in clear, practical language.', 
 'You are an experienced tax advisor. You explain tax topics in a clear and practical way, using simple language and concrete examples. When you are not sure, you say so explicitly and suggest what additional information would be needed.', 
 true, NULL),
('legal_assistant', 'Legal Assistant', 'Assists with legal document analysis and contract review.',
 'You are a legal assistant with expertise in contract analysis and legal documentation. You provide clear, structured analysis of legal documents, highlighting key terms, obligations, and potential risks. You always clarify when something requires professional legal review.',
 true, NULL),
('client_explainer', 'Client Explainer', 'Simplifies complex topics for client communication.',
 'You are a communication specialist who excels at explaining complex professional topics in simple, client-friendly language. You avoid jargon, use analogies when helpful, and structure information clearly. Your goal is to make technical or complex information accessible to non-experts.',
 true, NULL);

-- Insert default policy categories for demo tenant
INSERT INTO tenants (id, name, default_language, retention_days, status) VALUES
('demo-tenant', 'Demo Firm', 'en', 30, 'ACTIVE');

INSERT INTO policies (tenant_id, category, decision) VALUES
('demo-tenant', 'PII_BASIC', 'WARN'),
('demo-tenant', 'FINANCIAL', 'WARN'),
('demo-tenant', 'HEALTH', 'BLOCK'),
('demo-tenant', 'CONTRACT', 'ALLOW'),
('demo-tenant', 'INTERNAL', 'WARN');
