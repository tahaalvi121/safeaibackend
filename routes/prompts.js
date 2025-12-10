// Prompt Routes - API endpoints for prompt enhancement
const express = require('express');
const router = express.Router();
const promptEnhancer = require('../modules/promptEnhancer');

// Enhance prompt
router.post('/enhance', async (req, res) => {
    try {
        const { prompt, type, model } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const result = await promptEnhancer.enhance(prompt, { type, model });

        res.json(result);

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
