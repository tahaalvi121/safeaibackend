// Prompt Routes - API endpoints for prompt enhancement
const express = require('express');
const router = express.Router();
const promptEnhancer = require('../modules/promptEnhancer'); // Keep for backward compat if needed, but prefer service
const EnhancementService = require('../services/EnhancementService');

// Enhance prompt
router.post('/enhance', async (req, res) => {
    try {
        const { prompt, type, model } = req.body;
        // Mock tenant ID for now, or extract from auth middleware
        const tenantId = req.headers['x-tenant-id'] || 'demo-tenant';

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const enhancedText = await EnhancementService.enhancePrompt(prompt, tenantId, 'STANDARD');

        res.json({
            success: true,
            originalPrompt: prompt,
            enhancedPrompt: enhancedText,
            promptType: type || 'auto'
        });

    } catch (error) {
        console.error('Prompt enhancement error:', error);
        res.status(500).json({ error: 'Enhancement failed', message: error.message });
    }
});

// Analyze prompt quality
router.post('/analyze', (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const analysis = promptEnhancer.analyzePrompt(prompt);

        res.json(analysis);

    } catch (error) {
        console.error('Prompt analysis error:', error);
        res.status(500).json({ error: 'Analysis failed', message: error.message });
    }
});

module.exports = router;
