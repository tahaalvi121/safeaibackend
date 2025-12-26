const express = require('express');
const router = express.Router();
const path = require('path');
const { query } = require('../config/database');

/**
 * Public Verification Page for Tenants
 */
router.get('/tenant/:tenantId', async (req, res) => {
    res.sendFile(path.join(__dirname, '../../verify.html'));
});

/**
 * API to get public verification data for a tenant
 */
router.get('/api/verify/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;

        // Fetch tenant info
        const tenantResult = await query(
            'SELECT name, logo_url, created_at FROM tenants WHERE id = $1',
            [tenantId]
        );

        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Firm not found' });
        }

        const tenant = tenantResult.rows[0];

        // Fetch some high-level stats (optional, but requested)
        const statsResult = await query(
            'SELECT COUNT(*) as total_checks FROM security_logs WHERE tenant_id = $1',
            [tenantId]
        );

        res.json({
            firmName: tenant.name,
            firmLogo: tenant.logo_url,
            memberSince: tenant.created_at,
            totalChecks: statsResult.rows[0].total_checks,
            commitment: "SafeAI Commitment: No client content is used to train public AI models.",
            securityDisclaimer: "No AI or security solution can guarantee perfect protection, but this firm is actively investing in responsible use of AI to help protect your information."
        });

    } catch (error) {
        console.error('Verification API error:', error);
        res.status(500).json({ error: 'Failed to fetch verification data' });
    }
});

module.exports = router;
