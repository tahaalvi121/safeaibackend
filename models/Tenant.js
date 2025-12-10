// Tenant Model - Database operations for tenants
const { query } = require('../config/database');

class Tenant {
    // Create a new tenant
    static async create(tenantData) {
        const { tenant_id, name, email, tier = 'free', settings = {} } = tenantData;

        const result = await query(
            `INSERT INTO tenants (tenant_id, name, email, tier, settings)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [tenant_id, name, email, tier, JSON.stringify(settings)]
        );

        // Create default policy for tenant
        await query(
            `INSERT INTO policies (tenant_id)
       VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
            [tenant_id]
        );

        return result.rows[0];
    }

    // Get tenant by ID
    static async findById(tenant_id) {
        const result = await query(
            'SELECT * FROM tenants WHERE tenant_id = $1',
            [tenant_id]
        );
        return result.rows[0];
    }

    // Update tenant
    static async update(tenant_id, updates) {
        const { name, email, tier, active, settings } = updates;
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (name) {
            fields.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (email) {
            fields.push(`email = $${paramCount++}`);
            values.push(email);
        }
        if (tier) {
            fields.push(`tier = $${paramCount++}`);
            values.push(tier);
        }
        if (active !== undefined) {
            fields.push(`active = $${paramCount++}`);
            values.push(active);
        }
        if (settings) {
            fields.push(`settings = $${paramCount++}`);
            values.push(JSON.stringify(settings));
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(tenant_id);

        const result = await query(
            `UPDATE tenants SET ${fields.join(', ')}
       WHERE tenant_id = $${paramCount}
       RETURNING *`,
            values
        );

        return result.rows[0];
    }

    // Get usage for current month
    static async getUsage(tenant_id) {
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

        const result = await query(
            `SELECT * FROM usage_tracking
       WHERE tenant_id = $1 AND month = $2`,
            [tenant_id, currentMonth]
        );

        if (result.rows.length === 0) {
            // Create initial usage record
            const newUsage = await query(
                `INSERT INTO usage_tracking (tenant_id, month)
         VALUES ($1, $2)
         RETURNING *`,
                [tenant_id, currentMonth]
            );
            return newUsage.rows[0];
        }

        return result.rows[0];
    }

    // Increment usage
    static async incrementUsage(tenant_id, type = 'requests') {
        const currentMonth = new Date().toISOString().slice(0, 7);

        const field = type === 'documents' ? 'documents_count' : 'requests_count';

        await query(
            `INSERT INTO usage_tracking (tenant_id, month, ${field})
       VALUES ($1, $2, 1)
       ON CONFLICT (tenant_id, month)
       DO UPDATE SET ${field} = usage_tracking.${field} + 1`,
            [tenant_id, currentMonth]
        );
    }

    // Check if tenant can make request
    static async canMakeRequest(tenant_id) {
        const tenant = await this.findById(tenant_id);
        if (!tenant || !tenant.active) {
            return { allowed: false, reason: 'Tenant not found or inactive' };
        }

        const usage = await this.getUsage(tenant_id);

        // Get tier limits
        const tiers = require('../config/tiers.json');
        const tierConfig = tiers[tenant.tier];

        if (!tierConfig) {
            return { allowed: false, reason: 'Invalid tier configuration' };
        }

        // Check request limit
        if (tierConfig.maxRequests !== -1 && usage.requests_count >= tierConfig.maxRequests) {
            return { allowed: false, reason: 'Monthly request limit exceeded' };
        }

        return { allowed: true };
    }
}

module.exports = Tenant;
