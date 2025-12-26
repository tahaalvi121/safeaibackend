// Billing Routes - API endpoints for subscription and billing management
const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const { authenticate } = require('../middleware/auth');

/**
 * GET /admin/subscription
 * Returns current plan, usage, and billing status for the tenant
 */
router.get('/subscription', authenticate, async (req, res) => {
    try {
        const { tenantId } = req.auth;
        const subInfo = await Tenant.getSubscriptionInfo(tenantId);

        if (!subInfo) {
            return res.status(404).json({ error: 'Subscription information not found' });
        }

        res.json(subInfo);
    } catch (error) {
        console.error('Subscription fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription details' });
    }
});

/**
 * POST /admin/subscription/upgrade
 * MVP: Upgrade or change the billing period
 */
router.post('/subscription/upgrade', authenticate, async (req, res) => {
    try {
        const { tenantId } = req.auth;
        const { plan, period } = req.body;

        if (!plan && !period) {
            return res.status(400).json({ error: 'Plan or period specified required' });
        }

        const updates = {};
        if (plan) updates.tier = plan.toLowerCase();
        if (period) updates.billing_period = period;

        // In MVP, we just update the tenant record
        const updatedTenant = await Tenant.update(tenantId, updates);

        const TelemetryService = require('../services/TelemetryService');
        TelemetryService.track({
            tenantId,
            type: 'AUDIT_PLAN_CHANGE',
            details: { plan: updatedTenant.tier, period: updatedTenant.billing_period },
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `Plan updated to ${updatedTenant.tier} (${updatedTenant.billing_period})`
        });
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({ error: 'Failed to update subscription' });
    }
});

/**
 * POST /admin/subscription/cancel
 * MVP: Soft cancellation
 */
router.post('/subscription/cancel', authenticate, async (req, res) => {
    try {
        const { tenantId } = req.auth;

        // Get current subscription to set expiration date
        const subInfo = await Tenant.getSubscriptionInfo(tenantId);

        const updates = {
            billing_status: 'Cancelled'
        };

        await Tenant.update(tenantId, updates);

        const TelemetryService = require('../services/TelemetryService');
        TelemetryService.track({
            tenantId,
            type: 'AUDIT_PLAN_CANCEL',
            details: { action: 'CANCEL_RENEWAL' },
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Your SafeAI protection renewal has been cancelled.'
        });
    } catch (error) {
        console.error('Cancellation error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

module.exports = router;
