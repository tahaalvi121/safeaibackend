// Admin Routes - Badge management and evidence tokens
const express = require('express');
const router = express.Router();
const BadgeService = require('../services/BadgeService');

// In-memory badge storage (use database in production)
const badges = new Map();

/**
 * Generate and assign a badge to a tenant
 */
router.post('/badges', async (req, res) => {
    try {
        const { tenantId, type, tenantName } = req.body;

        if (!tenantId || !type || !tenantName) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['tenantId', 'type', 'tenantName']
            });
        }

        // Generate badge
        const badge = await BadgeService.generateBadge(type, tenantName);

        // Store badge assignment
        const badgeRecord = {
            ...badge,
            tenantId,
            assignedAt: new Date().toISOString()
        };

        badges.set(badge.badgeId, badgeRecord);

        res.json(badgeRecord);

    } catch (error) {
        console.error('Badge generation error:', error);
        res.status(500).json({ error: 'Failed to generate badge' });
    }
});


/**
 * Update tenant policy mode
 */
router.put('/policy/mode', async (req, res) => {
    try {
        const { tenantId, mode } = req.body;

        if (!['RELAXED', 'STANDARD', 'STRICT'].includes(mode)) {
            return res.status(400).json({ error: 'Invalid mode' });
        }

        const TelemetryService = require('../services/TelemetryService');
        TelemetryService.track({
            tenantId,
            type: 'AUDIT_POLICY_CHANGE',
            details: { change: 'MODE', value: mode },
            timestamp: new Date().toISOString()
        });

        console.log(`[Admin] Tenant ${tenantId} set to mode ${mode}`);
        res.json({ success: true, mode });
    } catch (error) {
        console.error('Policy update error:', error);
        res.status(500).json({ error: 'Failed to update policy mode' });
    }
});

/**
 * Update specific policy rule
 */
router.put('/policy/rule', async (req, res) => {
    try {
        const { tenantId, category, decision } = req.body;

        if (!category || !['ALLOW', 'WARN', 'BLOCK'].includes(decision)) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }

        const TelemetryService = require('../services/TelemetryService');
        TelemetryService.track({
            tenantId,
            type: 'AUDIT_POLICY_CHANGE',
            details: { change: 'RULE', category, decision },
            timestamp: new Date().toISOString()
        });

        console.log(`[Admin] Tenant ${tenantId} rule updated: ${category} -> ${decision}`);
        res.json({ success: true, category, decision });
    } catch (error) {
        console.error('Rule update error:', error);
        res.status(500).json({ error: 'Failed to update rule' });
    }
});

/**
 * Get all badges for a tenant
 */
router.get('/badges/tenant/:tenantId', (req, res) => {
    try {
        const { tenantId } = req.params;

        const tenantBadges = Array.from(badges.values())
            .filter(b => b.tenantId === tenantId);

        res.json(tenantBadges);

    } catch (error) {
        console.error('Get badges error:', error);
        res.status(500).json({ error: 'Failed to get badges' });
    }
});

/**
 * Verify a badge
 */
router.get('/verify/:badgeId', (req, res) => {
    try {
        const { badgeId } = req.params;

        const badge = badges.get(badgeId);

        if (!badge) {
            return res.status(404).json({
                error: 'Badge not found',
                verified: false
            });
        }

        res.json({
            verified: true,
            badge: {
                type: badge.type,
                tenantId: badge.tenantId,
                assignedAt: badge.assignedAt
            }
        });

    } catch (error) {
        console.error('Verify badge error:', error);
        res.status(500).json({ error: 'Failed to verify badge' });
    }
});

/**
 * Get LLM metrics
 */
router.get('/metrics/llm', (req, res) => {
    try {
        const LLMClient = require('../services/LLMClient');
        const metrics = LLMClient.getMetrics(100);

        res.json(metrics);

    } catch (error) {
        console.error('Get metrics error:', error);
        res.status(500).json({ error: 'Failed to get metrics' });
    }
});

/**
 * Update tenant language settings
 */
router.put('/tenant/languages', async (req, res) => {
    try {
        const { tenantId, enabled_languages, default_language } = req.body;

        if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

        const Tenant = require('../models/Tenant');
        const updates = {};
        if (enabled_languages) updates.enabled_languages = enabled_languages;
        if (default_language) updates.default_language = default_language;

        await Tenant.update(tenantId, updates);

        const TelemetryService = require('../services/TelemetryService');
        TelemetryService.track({
            tenantId,
            type: 'AUDIT_TENANT_CHANGE',
            details: { change: 'LANGUAGES', enabled_languages, default_language },
            timestamp: new Date().toISOString()
        });

        res.json({ success: true, ...updates });
    } catch (error) {
        console.error('Tenant language update error:', error);
        res.status(500).json({ error: 'Failed to update tenant language settings' });
    }
});

/**
 * Purge all data for a tenant (GDPR compliance)
 */
router.delete('/tenant/:tenantId/purge', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { query } = require('../config/database');

        // Purge logs and usage tracking
        await query('DELETE FROM security_logs WHERE tenant_id = $1', [tenantId]);
        await query('DELETE FROM usage_tracking WHERE tenant_id = $1', [tenantId]);

        const TelemetryService = require('../services/TelemetryService');
        TelemetryService.track({
            tenantId,
            type: 'AUDIT_DATA_PURGE',
            details: { action: 'PURGE_ALL_DATA' },
            timestamp: new Date().toISOString()
        });

        console.log(`[Admin] Data purged for tenant ${tenantId}`);
        res.json({ success: true, message: 'All tenant data has been purged.' });
    } catch (error) {
        console.error('Purge error:', error);
        res.status(500).json({ error: 'Failed to purge data' });
    }
});

/**
 * Export all data for a tenant (GDPR compliance)
 */
router.get('/tenant/:tenantId/export', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { query } = require('../config/database');

        const logs = await query('SELECT * FROM security_logs WHERE tenant_id = $1', [tenantId]);
        const usage = await query('SELECT * FROM usage_tracking WHERE tenant_id = $1', [tenantId]);

        const exportData = {
            tenantId,
            exportDate: new Date().toISOString(),
            securityLogs: logs.rows,
            usageTracking: usage.rows
        };

        const TelemetryService = require('../services/TelemetryService');
        TelemetryService.track({
            tenantId,
            type: 'AUDIT_DATA_EXPORT',
            details: { action: 'EXPORT_ALL_DATA' },
            timestamp: new Date().toISOString()
        });

        res.json(exportData);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

module.exports = router;
