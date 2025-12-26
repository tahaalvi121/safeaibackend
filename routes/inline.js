// Inline Check Routes - For extension inline text analysis
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { analyzeText } = require('../modules/analyzer');
const { anonymizeText } = require('../modules/anonymizer');
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const promptEnhancer = require('../modules/promptEnhancer');

// Inline check endpoint
router.post('/check', authenticate, async (req, res) => {
    try {
        const { rawText, personaId, sourceApp } = req.body;
        const { userId, tenantId } = req.auth;

        if (!rawText) {
            return res.status(400).json({ error: 'rawText is required' });
        }

        // Get user and tenant info
        const userResult = await query('SELECT preferred_language, selected_persona_id FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];

        const tenantResult = await query('SELECT default_language, allow_rehydration FROM tenants WHERE id = $1', [tenantId]);
        const tenant = tenantResult.rows[0];

        const effectiveLanguage = user.preferred_language || tenant.default_language || 'en';
        const effectivePersonaId = personaId || user.selected_persona_id || 'client_explainer';

        // Get persona
        const personaResult = await query(
            'SELECT * FROM personas WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2) AND enabled = true',
            [effectivePersonaId, tenantId]
        );

        if (personaResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid persona' });
        }

        const persona = personaResult.rows[0];

        // Analyze text
        const analysis = analyzeText(rawText, { tenantId, userId, platform: sourceApp });

        // Get policies for tenant
        const policiesResult = await query('SELECT category, decision FROM policies WHERE tenant_id = $1', [tenantId]);
        const policies = {};
        policiesResult.rows.forEach(p => {
            policies[p.category] = p.decision;
        });

        // Determine overall decision based on categories
        let decision = 'ALLOW';
        const detectedCategories = [...new Set(analysis.findings.map(f => f.category || 'PII_BASIC'))];

        for (const category of detectedCategories) {
            const policyDecision = policies[category] || 'WARN';
            if (policyDecision === 'BLOCK') {
                decision = 'BLOCK';
                break;
            } else if (policyDecision === 'WARN' && decision === 'ALLOW') {
                decision = 'WARN';
            }
        }

        // Anonymize if not blocked
        let sanitizedText = rawText;
        let explanation = '';

        if (decision !== 'BLOCK') {
            const anonymized = anonymizeText(rawText, analysis.findings);
            sanitizedText = anonymized.sanitizedText;
        }

        // Build explanation
        if (decision === 'BLOCK') {
            explanation = getLocalizedString(effectiveLanguage, 'policyBlocked');
        } else if (decision === 'WARN') {
            explanation = getLocalizedString(effectiveLanguage, 'decisionWarn');
        } else {
            explanation = getLocalizedString(effectiveLanguage, 'decisionAllow');
        }

        // Insert event
        const eventId = `evt_${uuidv4()}`;
        await query(
            `INSERT INTO events (id, tenant_id, user_id, timestamp, event_type, decision, risk_level, categories, tool)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'INLINE_CHECK', $4, $5, $6, 'EXTENSION')`,
            [eventId, tenantId, userId, decision, analysis.riskLevel, detectedCategories]
        );

        res.json({
            decision,
            riskLevel: analysis.riskLevel,
            categories: detectedCategories,
            findings: analysis.findings,
            sanitizedText,
            explanation,
            personaUsed: persona.name,
            language: effectiveLanguage
        });

    } catch (error) {
        console.error('Inline check error:', error);
        res.status(500).json({ error: 'Inline check failed', message: error.message });
    }
});

// Helper function to get localized strings
function getLocalizedString(language, key) {
    const locales = {
        en: require('../../locales/en.json'),
        he: require('../../locales/he.json')
    };

    return locales[language]?.[key] || locales['en'][key] || key;
}

module.exports = router;
