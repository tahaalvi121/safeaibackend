// Authentication Middleware
const AuthService = require('../services/AuthService');

// Verify JWT and attach auth context to request
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = AuthService.verifyToken(token);

        // Attach auth context to request
        req.auth = {
            userId: decoded.userId,
            tenantId: decoded.tenantId,
            role: decoded.role
        };

        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Require tenant admin role
function requireTenantAdmin(req, res, next) {
    if (req.auth.role !== 'TenantAdmin') {
        return res.status(403).json({ error: 'Tenant admin access required' });
    }
    next();
}

// Optional authentication (for public endpoints that can work with or without auth)
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = AuthService.verifyToken(token);

            req.auth = {
                userId: decoded.userId,
                tenantId: decoded.tenantId,
                role: decoded.role
            };
        }
    } catch (error) {
        // Ignore auth errors for optional auth
    }

    next();
}

// Require platform admin role
function requirePlatformAdmin(req, res, next) {
    if (req.auth.role !== 'PLATFORM_ADMIN') {
        return res.status(403).json({ error: 'Platform admin access required' });
    }
    next();
}

module.exports = {
    authenticate,
    requireTenantAdmin,
    requirePlatformAdmin,
    optionalAuth
};
