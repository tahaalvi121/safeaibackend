// Policy Model - Database operations for tenant policies
const { query } = require('../config/database');

class Policy {
    // Get policy for a tenant
    static async findByTenant(tenant_id) {
        const result = await query(
            'SELECT * FROM policies WHERE tenant_id = $1',
            [tenant_id]
        );

        if (result.rows.length === 0) {
            // Create default policy
            return await this.create(tenant_id);
        }

        return result.rows[0];
    }

    // Create default policy
    static async create(tenant_id) {
        const result = await query(
            `INSERT INTO policies (tenant_id)
       VALUES ($1)
       RETURNING *`,
            [tenant_id]
        );
        return result.rows[0];
    }

    // Update policy
    static async update(tenant_id, updates) {
        const {
            alert_color,
            block_enabled,
            explainability_enabled,
            fix_button_enabled,
            enhance_button_enabled,
            settings
        } = updates;

        const fields = [];
        const values = [];
        let paramCount = 1;

        if (alert_color) {
            fields.push(`alert_color = $${paramCount++}`);
            values.push(alert_color);
        }
        if (block_enabled !== undefined) {
            fields.push(`block_enabled = $${paramCount++}`);
            values.push(block_enabled);
        }
        if (explainability_enabled !== undefined) {
            fields.push(`explainability_enabled = $${paramCount++}`);
            values.push(explainability_enabled);
        }
        if (fix_button_enabled !== undefined) {
            fields.push(`fix_button_enabled = $${paramCount++}`);
            values.push(fix_button_enabled);
        }
        if (enhance_button_enabled !== undefined) {
            fields.push(`enhance_button_enabled = $${paramCount++}`);
            values.push(enhance_button_enabled);
        }
        if (settings) {
            fields.push(`settings = $${paramCount++}`);
            values.push(JSON.stringify(settings));
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(tenant_id);

        const result = await query(
            `UPDATE policies SET ${fields.join(', ')}
       WHERE tenant_id = $${paramCount}
       RETURNING *`,
            values
        );

        return result.rows[0];
    }
}

module.exports = Policy;
