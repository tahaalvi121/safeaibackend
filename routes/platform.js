// Platform Routes - API endpoints for SafeAI Platform Owners (Internal)
const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { authenticate, requirePlatformAdmin } = require('../middleware/auth');
const { query } = require('../config/database');

// All routes here require platform admin role
router.use(authenticate, requirePlatformAdmin);

/**
 * GET /platform/global-stats
 * Top-level overview for platform home
 */
router.get('/global-stats', async (req, res) => {
    try {
        const stats = await Tenant.getGlobalStats();
        res.json(stats);
    } catch (error) {
        console.error('Global stats error:', error);
        res.status(500).json({ error: 'Failed to fetch global stats' });
    }
});

/**
 * GET /platform/tenants
 * List all tenants with filters
 */
router.get('/tenants', async (req, res) => {
    try {
        const tenants = await Tenant.findAll(req.query);
        res.json(tenants);
    } catch (error) {
        console.error('Tenant list error:', error);
        res.status(500).json({ error: 'Failed to list tenants' });
    }
});

/**
 * GET /platform/tenants/:id
 * Detailed tenant view
 */
router.get('/tenants/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenant = await Tenant.findById(id);
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const subInfo = await Tenant.getSubscriptionInfo(id);
        const users = await User.findByTenant(id);

        // High-level aggregated logs (telemetry)
        const recentUsage = await query(`
            SELECT month, requests_count, documents_count
            FROM usage_tracking
            WHERE tenant_id = $1
            ORDER BY month DESC
            LIMIT 6
        `, [id]);

        res.json({
            tenant,
            subscription: subInfo,
            users: users.map(u => ({
                email: u.email, // In production, mask this based on policy
                role: u.role,
                last_seen: u.last_seen,
                status: u.status
            })),
            usageHistory: recentUsage.rows
        });
    } catch (error) {
        console.error('Tenant detail error:', error);
        res.status(500).json({ error: 'Failed to fetch tenant details' });
    }
});

/**
 * PUT /platform/tenants/:id
 * Update tenant status, plan, notes
 */
router.put('/tenants/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Valid fields only
        const allowed = ['tier', 'billing_status', 'billing_period', 'seats_licensed', 'next_billing_date', 'status', 'internal_notes', 'region', 'timezone'];
        const filtered = {};
        Object.keys(updates).forEach(key => {
            if (allowed.includes(key)) filtered[key] = updates[key];
        });

        const updated = await Tenant.updateInternal(id, filtered);

        // Audit Log
        await query(`
            INSERT INTO platform_audit_logs (admin_id, tenant_id, action_type, details)
            VALUES ($1, $2, $3, $4)
        `, [req.auth.userId, id, 'TENANT_UPDATE', JSON.stringify(filtered)]);

        res.json(updated);
    } catch (error) {
        console.error('Tenant update error:', error);
        res.status(500).json({ error: 'Failed to update tenant' });
    }
});

module.exports = router;
