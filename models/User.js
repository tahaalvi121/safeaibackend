// User Model - Database operations for users
const { query } = require('../config/database');

class User {
    // Create or update user
    static async upsert(userData) {
        const { user_id, tenant_id, email, role = 'employee' } = userData;

        const result = await query(
            `INSERT INTO users (user_id, tenant_id, email, role, first_seen, last_seen, total_requests)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
       ON CONFLICT (user_id)
       DO UPDATE SET
         last_seen = CURRENT_TIMESTAMP,
         total_requests = users.total_requests + 1
       RETURNING *`,
            [user_id, tenant_id, email, role]
        );

        return result.rows[0];
    }

    // Get user by ID
    static async findById(user_id) {
        const result = await query(
            'SELECT * FROM users WHERE user_id = $1',
            [user_id]
        );
        return result.rows[0];
    }

    // Get all users for a tenant
    static async findByTenant(tenant_id) {
        const result = await query(
            `SELECT * FROM users
       WHERE tenant_id = $1
       ORDER BY last_seen DESC`,
            [tenant_id]
        );
        return result.rows;
    }

    // Update user activity
    static async updateActivity(user_id) {
        await query(
            `UPDATE users
       SET last_seen = CURRENT_TIMESTAMP,
           total_requests = total_requests + 1
       WHERE user_id = $1`,
            [user_id]
        );
    }
}

module.exports = User;
