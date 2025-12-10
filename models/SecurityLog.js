// SecurityLog Model - Database operations for security logs
const { query } = require('../config/database');

class SecurityLog {
    // Create security log entry
    static async create(logData) {
        const {
            log_id,
            tenant_id,
            user_id,
            action_type,
            risk_level,
            decision,
            findings_count = 0,
            anomaly_score = 0,
            platform = 'unknown'
        } = logData;

        const result = await query(
            `INSERT INTO security_logs
       (log_id, tenant_id, user_id, action_type, risk_level, decision,
        findings_count, anomaly_score, platform, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
       RETURNING *`,
            [log_id, tenant_id, user_id, action_type, risk_level, decision,
                findings_count, anomaly_score, platform]
        );

        return result.rows[0];
    }

    // Get logs for a tenant
    static async findByTenant(tenant_id, options = {}) {
        const { limit = 100, user_id, action_type, startDate, endDate } = options;

        let queryText = 'SELECT * FROM security_logs WHERE tenant_id = $1';
        const params = [tenant_id];
        let paramCount = 2;

        if (user_id) {
            queryText += ` AND user_id = $${paramCount++}`;
            params.push(user_id);
        }

        if (action_type) {
            queryText += ` AND action_type = $${paramCount++}`;
            params.push(action_type);
        }

        if (startDate) {
            queryText += ` AND timestamp >= $${paramCount++}`;
            params.push(startDate);
        }

        if (endDate) {
            queryText += ` AND timestamp <= $${paramCount++}`;
            params.push(endDate);
        }

        queryText += ` ORDER BY timestamp DESC LIMIT $${paramCount}`;
        params.push(limit);

        const result = await query(queryText, params);
        return result.rows;
    }

    // Get statistics for a tenant
    static async getStats(tenant_id) {
        const result = await query(
            `SELECT
         COUNT(*) as total_events,
         COUNT(DISTINCT user_id) as unique_users,
         COUNT(CASE WHEN risk_level = 'HIGH' THEN 1 END) as high_risk_count,
         COUNT(CASE WHEN risk_level = 'MEDIUM' THEN 1 END) as medium_risk_count,
         COUNT(CASE WHEN risk_level = 'LOW' THEN 1 END) as low_risk_count,
         COUNT(CASE WHEN decision = 'BLOCK' THEN 1 END) as blocked_count,
         AVG(anomaly_score) as avg_anomaly_score
       FROM security_logs
       WHERE tenant_id = $1`,
            [tenant_id]
        );

        return result.rows[0];
    }
}

module.exports = SecurityLog;
