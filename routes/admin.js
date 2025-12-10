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

module.exports = router;
