// Authentication Routes
const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');
const { authenticate } = require('../middleware/auth');

// Register tenant admin
router.post('/register', async (req, res) => {
    try {
        const { firmName, email, password, language } = req.body;

        if (!firmName || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await AuthService.registerTenantAdmin({
            firmName,
            email,
            password,
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

module.exports = router;
