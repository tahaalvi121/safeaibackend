const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

/**
 * GET /admin/dashboard/stats
 * Dashboard overview metrics
 */
router.get('/stats', async (req, res) => {
    try {
        const { tenantId, range } = req.query; // range: 7d, 30d, custom
        const tenant = tenantId || 'demo-tenant';

        let interval = '7 days';
        if (range === '30d') interval = '30 days';

        const stats = await query(`
            SELECT 
                COUNT(*) as total_checks,
                COUNT(CASE WHEN decision = 'WARN' THEN 1 END) as warnings_shown,
                COUNT(CASE WHEN decision = 'BLOCK' THEN 1 END) as messages_blocked,
                COUNT(CASE WHEN action_type = 'ANALYSIS' AND findings_count > 0 THEN 1 END) as fixed_with_safeai,
                COUNT(DISTINCT user_id) as users_protected
            FROM security_logs
            WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '${interval}'
        `, [tenant]);

        res.json(stats.rows[0]);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

/**
 * GET /admin/dashboard/logs
 * Detailed pseudonymized logs
 */
router.get('/logs', async (req, res) => {
    try {
        const { tenantId, limit = 50, offset = 0 } = req.query;
        const tenant = tenantId || 'demo-tenant';

        const logs = await query(`
            SELECT 
                l.timestamp,
                COALESCE(u.user_alias, 'User-' || substr(l.user_id, 1, 8)) as user_alias,
                l.platform as tool,
                l.decision as action,
                l.findings as data_types
            FROM security_logs l
            LEFT JOIN users u ON l.user_id = u.user_id
            WHERE l.tenant_id = $1
            ORDER BY l.timestamp DESC
            LIMIT $2 OFFSET $3
        `, [tenant, limit, offset]);

        res.json(logs.rows);
    } catch (error) {
        console.error('Logs error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

/**
 * GET /admin/dashboard/charts
 * Timeline and distribution data
 */
router.get('/charts', async (req, res) => {
    try {
        const { tenantId } = req.query;
        const tenant = tenantId || 'demo-tenant';

        // Timeline: Warnings and Blocks per day
        const timeline = await query(`
            SELECT 
                DATE(timestamp) as date,
                COUNT(CASE WHEN decision = 'WARN' THEN 1 END) as warnings,
                COUNT(CASE WHEN decision = 'BLOCK' THEN 1 END) as blocks
            FROM security_logs
            WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '30 days'
            GROUP BY DATE(timestamp)
            ORDER BY date ASC
        `, [tenant]);

        // Data Types: Top detected types
        // We need to unnest the findings JSONB array
        const topTypes = await query(`
            SELECT f->>'type' as type, COUNT(*) as count
            FROM security_logs, jsonb_array_elements(findings) f
            WHERE tenant_id = $1
            GROUP BY type
            ORDER BY count DESC
            LIMIT 5
        `, [tenant]);

        res.json({
            timeline: timeline.rows,
            topTypes: topTypes.rows
        });
    } catch (error) {
        console.error('Charts error:', error);
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
});

module.exports = router;
