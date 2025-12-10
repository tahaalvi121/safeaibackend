// Authentication Service - JWT-based authentication with in-memory fallback
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

// In-memory storage (fallback when no database)
const inMemoryUsers = new Map();
const inMemoryTenants = new Map();

// Check if database is available
let hasDatabase = false;
try {
    const { query } = require('../config/database');
    hasDatabase = !!process.env.DATABASE_URL;
} catch (error) {
    hasDatabase = false;
}

class AuthService {
    // Register new tenant admin
    static async registerTenantAdmin(data) {
        const { firmName, email, password, language = 'en' } = data;

        // Check if email already exists
        if (hasDatabase) {
            const { query } = require('../config/database');
            const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
            if (existing.rows.length > 0) {
                throw new Error('Email already registered');
            }
        } else {
            // In-memory check
            for (const [, user] of inMemoryUsers) {
                if (user.email === email) {
                    throw new Error('Email already registered');
                }
            }
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        const tenantId = `t_${uuidv4()}`;
        const userId = `u_${uuidv4()}`;

        if (hasDatabase) {
            const { query } = require('../config/database');

            // Create tenant
            await query(
                `INSERT INTO tenants (id, name, default_language, retention_days, status)
         VALUES ($1, $2, $3, 30, 'ACTIVE')`,
                [tenantId, firmName, language]
            );

            // Create default policies
            const categories = ['PII_BASIC', 'FINANCIAL', 'HEALTH', 'CONTRACT', 'INTERNAL'];
            const defaultDecisions = {
                'PII_BASIC': 'WARN',
                'FINANCIAL': 'WARN',
                'HEALTH': 'BLOCK',
                'CONTRACT': 'ALLOW',
                'INTERNAL': 'WARN'
            };

            for (const category of categories) {
                await query(
                    'INSERT INTO policies (tenant_id, category, decision) VALUES ($1, $2, $3)',
                    [tenantId, category, defaultDecisions[category]]
                );
            }

            // Create admin user
            await query(
                `INSERT INTO users (id, tenant_id, email, password_hash, role, preferred_language, status)
         VALUES ($1, $2, $3, $4, 'TenantAdmin', $5, 'ACTIVE')`,
                [userId, tenantId, email, passwordHash, language]
            );
        } else {
            // In-memory storage
            inMemoryTenants.set(tenantId, {
                id: tenantId,
                name: firmName,
                default_language: language,
                retention_days: 30,
                status: 'ACTIVE'
            });

            inMemoryUsers.set(userId, {
                id: userId,
                tenant_id: tenantId,
                email,
                password_hash: passwordHash,
                role: 'TenantAdmin',
                preferred_language: language,
                status: 'ACTIVE'
            });
        }

        return { userId, tenantId };
    }

    // Login
    static async login(email, password) {
        let user;

        if (hasDatabase) {
            const { query } = require('../config/database');
            const result = await query(
                'SELECT id, tenant_id, email, password_hash, role, preferred_language, selected_persona_id, status FROM users WHERE email = $1',
                [email]
            );

            if (result.rows.length === 0) {
                throw new Error('Invalid credentials');
            }

            user = result.rows[0];
        } else {
            // In-memory lookup
            let found = null;
            for (const [, u] of inMemoryUsers) {
                if (u.email === email) {
                    found = u;
                    break;
                }
            }

            if (!found) {
                throw new Error('Invalid credentials');
            }

            user = found;
        }

        if (user.status !== 'ACTIVE') {
            throw new Error('Account is disabled');
        }

        // Verify password
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            throw new Error('Invalid credentials');
        }

        // Generate JWT
        const token = jwt.sign(
            {
                userId: user.id,
                tenantId: user.tenant_id,
                role: user.role
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        return {
            token,
            user: {
                id: user.id,
                tenantId: user.tenant_id,
                email: user.email,
                role: user.role,
                preferredLanguage: user.preferred_language,
                selectedPersonaId: user.selected_persona_id
            }
        };
    }

    // Verify JWT token
    static verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            throw new Error('Invalid token');
        }
    }

    // Get user info
    static async getUserInfo(userId) {
        let user, tenant;

        if (hasDatabase) {
            const { query } = require('../config/database');

            const userResult = await query(
                'SELECT id, tenant_id, email, role, preferred_language, selected_persona_id, status FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            user = userResult.rows[0];

            const tenantResult = await query(
                'SELECT id, name, default_language, retention_days, status, allow_rehydration FROM tenants WHERE id = $1',
                [user.tenant_id]
            );

            tenant = tenantResult.rows[0];
        } else {
            // In-memory lookup
            user = inMemoryUsers.get(userId);
            if (!user) {
                throw new Error('User not found');
            }

            tenant = inMemoryTenants.get(user.tenant_id);
        }

        const effectiveLanguage = user.preferred_language || tenant.default_language || 'en';

        return {
            user: {
                id: user.id,
                tenantId: user.tenant_id,
                email: user.email,
                role: user.role,
                preferredLanguage: user.preferred_language,
                selectedPersonaId: user.selected_persona_id,
                status: user.status
            },
            tenant: {
                id: tenant.id,
                name: tenant.name,
                defaultLanguage: tenant.default_language,
                retentionDays: tenant.retention_days,
                status: tenant.status,
                allowRehydration: tenant.allow_rehydration || false
            },
            effectiveLanguage
        };
    }
}

module.exports = AuthService;
