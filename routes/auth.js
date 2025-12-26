// Authentication Routes
const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');
const { authenticate } = require('../middleware/auth');

// Register tenant admin
router.post('/register', async (req, res) => {
    try {
        const { firmName, email, password, region, language } = req.body;

        if (!firmName || !email || !password || !region) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await AuthService.registerTenantAdmin({
            firmName,
            email,
            password,
            region,
            language
        });

        res.json({
            success: true,
            userId: result.userId,
            tenantId: result.tenantId,
            message: 'Registration successful. Please log in.'
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Check auth mode (SSO vs Magic Code)
router.get('/mode', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email required' });

        const result = await AuthService.checkAuthMode(email);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Send magic code
router.post('/magic-code/send', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });

        const result = await AuthService.sendMagicCode(email);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Verify magic code
router.post('/magic-code/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

        const result = await AuthService.verifyMagicCode(email, code);
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await AuthService.login(email, password);

        res.json(result);

    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ error: error.message });
    }
});

// Get current user info
router.get('/me', authenticate, async (req, res) => {
    try {
        const info = await AuthService.getUserInfo(req.auth.userId);
        res.json(info);

    } catch (error) {
        console.error('Get user info error:', error);
        if (error.message === 'User not found') {
            return res.status(401).json({ error: 'Session expired or user not found' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Activate invited user
router.post('/activate', async (req, res) => {
    try {
        const { token, password, language, personaId } = req.body;

        if (!token || !password) {
            return res.status(400).json({ error: 'Token and password required' });
        }

        await AuthService.activateUser(token, password, language, personaId);

        res.json({ success: true, message: 'Account activated. Please log in.' });

    } catch (error) {
        console.error('Activation error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Update user language preference
router.post('/update-language', authenticate, async (req, res) => {
    try {
        const { language } = req.body;
        if (!language) return res.status(400).json({ error: 'Language required' });

        const User = require('../models/User');
        await User.update(req.auth.userId, { preferred_language: language });

        res.json({ success: true, language });
    } catch (error) {
        console.error('Update language error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
