// Database configuration and connection
const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/safeai',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  console.log('Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

// Query helper function
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Transaction helper
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Initialize database schema
async function initializeSchema() {
  const client = await pool.connect();
  try {
    // Create tenants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        tier VARCHAR(50) DEFAULT 'free',
        active BOOLEAN DEFAULT true,
        settings JSONB DEFAULT '{}',
        enabled_languages JSONB DEFAULT '["en", "he"]',
        default_language VARCHAR(5) DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        tenant_id VARCHAR(255) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
        email VARCHAR(255),
        role VARCHAR(50) DEFAULT 'employee',
        user_alias VARCHAR(100),
        preferred_language VARCHAR(5) DEFAULT 'en',
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_requests INTEGER DEFAULT 0
      )
    `);

    // Create security_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id SERIAL PRIMARY KEY,
        log_id VARCHAR(255) UNIQUE NOT NULL,
        tenant_id VARCHAR(255) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
        user_id VARCHAR(255),
        action_type VARCHAR(100) NOT NULL,
        risk_level VARCHAR(50),
        decision VARCHAR(50),
        findings_count INTEGER DEFAULT 0,
        findings JSONB DEFAULT '[]',
        anomaly_score INTEGER DEFAULT 0,
        platform VARCHAR(100),
        latency_ms INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(255) UNIQUE NOT NULL,
        tenant_id VARCHAR(255) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
        user_id VARCHAR(255),
        filename VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER,
        status VARCHAR(50) DEFAULT 'uploaded',
        pii_found BOOLEAN DEFAULT false,
        findings JSONB DEFAULT '[]',
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);

    // Create policies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS policies (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) UNIQUE REFERENCES tenants(tenant_id) ON DELETE CASCADE,
        alert_color VARCHAR(50) DEFAULT 'red',
        block_enabled BOOLEAN DEFAULT false,
        explainability_enabled BOOLEAN DEFAULT true,
        fix_button_enabled BOOLEAN DEFAULT false,
        enhance_button_enabled BOOLEAN DEFAULT false,
        settings JSONB DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create api_keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        key_id VARCHAR(255) UNIQUE NOT NULL,
        tenant_id VARCHAR(255) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
        key_name VARCHAR(255) NOT NULL,
        encrypted_value TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used TIMESTAMP,
        usage_count INTEGER DEFAULT 0
      )
    `);

    // Create usage_tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS usage_tracking (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL,
        requests_count INTEGER DEFAULT 0,
        users_count INTEGER DEFAULT 0,
        documents_count INTEGER DEFAULT 0,
        UNIQUE(tenant_id, month)
      )
    `);

    // Create indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_security_logs_tenant ON security_logs(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)');

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  transaction,
  initializeSchema
};
