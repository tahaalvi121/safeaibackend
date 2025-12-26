// Tenant Model - Database operations for tenants
const { query } = require('../config/database');

class Tenant {
    // Create a new tenant
    static async create(tenantData) {
        const {
            tenant_id, name, email, tier = 'free', settings = {},
            enabled_languages = ['en', 'he'], default_language = 'en',
            billing_period = 'Monthly', seats_licensed = 5,
            billing_status = 'Active', next_billing_date = null
        } = tenantData;

        const result = await query(
            `INSERT INTO tenants (
                tenant_id, name, email, tier, settings, 
                enabled_languages, default_language,
                billing_period, seats_licensed, billing_status, next_billing_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                tenant_id, name, email, tier, JSON.stringify(settings),
                JSON.stringify(enabled_languages), default_language,
                billing_period, seats_licensed, billing_status, next_billing_date
            ]
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

    // Get all tenants with filters
    static async findAll(filters = {}) {
        const { plan, status, region, dormantDays } = filters;
        const query_parts = [];
        const params = [];
        let paramCount = 1;

        if (plan) {
            query_parts.push(`tier = $${paramCount++}`);
            params.push(plan.toLowerCase());
        }
        if (status) {
            query_parts.push(`billing_status = $${paramCount++}`);
            params.push(status);
        }
        if (region) {
            query_parts.push(`region = $${paramCount++}`);
            params.push(region);
        }
        if (dormantDays) {
            query_parts.push(`last_active_at < NOW() - INTERVAL '$${paramCount++} days'`);
            params.push(dormantDays);
        }

        const whereClause = query_parts.length > 0 ? `WHERE ${query_parts.join(' AND ')}` : '';
        const result = await query(
            `SELECT * FROM tenants ${whereClause} ORDER BY created_at DESC`,
            params
        );
        return result.rows;
    }

    // Update tenant activity
    static async updateActivity(tenant_id) {
        await query(
            'UPDATE tenants SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1',
            [tenant_id]
        );
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
        if (updates.enabled_languages) {
            fields.push(`enabled_languages = $${paramCount++}`);
            values.push(JSON.stringify(updates.enabled_languages));
        }
        if (updates.default_language) {
            fields.push(`default_language = $${paramCount++}`);
            values.push(updates.default_language);
        }
        if (updates.billing_period) {
            fields.push(`billing_period = $${paramCount++}`);
            values.push(updates.billing_period);
        }
        if (updates.seats_licensed !== undefined) {
            fields.push(`seats_licensed = $${paramCount++}`);
            values.push(updates.seats_licensed);
        }
        if (updates.billing_status) {
            fields.push(`billing_status = $${paramCount++}`);
            values.push(updates.billing_status);
        }
        if (updates.next_billing_date) {
            fields.push(`next_billing_date = $${paramCount++}`);
            values.push(updates.next_billing_date);
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

        return { allowed: true };
    }

    // Get full subscription and usage info
    static async getSubscriptionInfo(tenant_id) {
        const tenant = await this.findById(tenant_id);
        if (!tenant) return null;

        const usage = await this.getUsage(tenant_id);

        // Get active user count
        const userResult = await query(
            'SELECT COUNT(*) as active_users FROM users WHERE tenant_id = $1 AND active = true',
            [tenant_id]
        );
        const activeUsers = parseInt(userResult.rows[0]?.active_users || 0);

        return {
            planName: tenant.tier.charAt(0).toUpperCase() + tenant.tier.slice(1),
            billingPeriod: tenant.billing_period || 'Monthly',
            billingStatus: tenant.billing_status || 'Active',
            nextBillingDate: tenant.next_billing_date || 'N/A',
            seatsLicensed: tenant.seats_licensed || 5,
            activeUsers: activeUsers,
            usageHighlights: {
                promptsChecked: usage.requests_count || 0,
                documentsAnalyzed: usage.documents_count || 0
            }
        };
    }

    // Get global stats across all tenants
    static async getGlobalStats() {
        const totals = await query(`
            SELECT 
                COUNT(*) as total_tenants,
                COUNT(CASE WHEN tier = 'pro' THEN 1 END) as pro_tenants,
                COUNT(CASE WHEN tier = 'free' THEN 1 END) as free_tenants,
                COUNT(CASE WHEN tier = 'trial' THEN 1 END) as trial_tenants
            FROM tenants
        `);

        const activity = await query(`
            SELECT 
                COUNT(DISTINCT tenant_id) as active_tenants
            FROM usage_tracking
            WHERE month = $1
        `, [new Date().toISOString().slice(0, 7)]);

        const telemetry = await query(`
            SELECT 
                SUM(requests_count) as total_prompts,
                SUM(documents_count) as total_wizard_docs
            FROM usage_tracking
        `);

        return {
            ...totals.rows[0],
            ...activity.rows[0],
            ...telemetry.rows[0]
        };
    }

    // Internal update (for platform admins)
    static async updateInternal(tenant_id, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = $${paramCount++}`);
            values.push(value);
        }

        if (fields.length === 0) return null;

        values.push(tenant_id);
        const result = await query(
            `UPDATE tenants SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $${paramCount} RETURNING *`,
            values
        );
        return result.rows[0];
    }
}

module.exports = Tenant;
