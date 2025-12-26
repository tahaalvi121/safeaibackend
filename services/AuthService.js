// Authentication Service - JWT-based authentication with in-memory fallback
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

// In-memory storage (fallback when no database)
const inMemoryUsers = new Map();
const inMemoryTenants = new Map();
const inMemoryMagicCodes = new Map();

// Check if database is available
let hasDatabase = false;
try {
    const { pool } = require('../config/database');
    hasDatabase = !!process.env.DATABASE_URL; // Only use database if explicitly configured
} catch (error) {
    hasDatabase = false;
}

class AuthService {
    // Register new tenant admin
    static async registerTenantAdmin(data) {
        const { firmName, email, password, region, language = 'en' } = data;

        // Check if email already exists
        if (hasDatabase) {
            const { query } = require('../config/database');
            const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
            if (existing.rows.length > 0) {
                throw new Error('Email already registered');
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
                `INSERT INTO tenants (id, name, default_language, enabled_languages, retention_days, status, region)
         VALUES ($1, $2, $3, $4, 30, 'ACTIVE', $5)`,
                [tenantId, firmName, language, JSON.stringify(['en', 'he']), region]
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
         VALUES ($1, $2, $3, $4, 'TENANT_ADMIN', $5, 'ACTIVE')`,
                [userId, tenantId, email, passwordHash, language]
            );
        } else {
            // In-memory storage (fallback)
            inMemoryTenants.set(tenantId, {
                id: tenantId,
                name: firmName,
                default_language: language,
                retention_days: 30,
                status: 'ACTIVE',
                region
            });

            inMemoryUsers.set(userId, {
                id: userId,
                tenant_id: tenantId,
                email,
                password_hash: passwordHash,
                role: 'TENANT_ADMIN',
                preferred_language: language,
                status: 'ACTIVE'
            });
        }

        return { userId, tenantId };
    }

    // Check auth mode for a given email (SSO or Magic Code)
    static async checkAuthMode(email) {
        const domain = email.split('@')[1];
        if (!domain) throw new Error('Invalid email');

        const user = await this.getUserByEmail(email);

        if (hasDatabase) {
            const { query } = require('../config/database');
            // Look for tenant with this domain enabled for SSO in auth_settings
            const result = await query(
                "SELECT id, name, auth_settings FROM tenants WHERE auth_settings->'sso_domains' @> $1::jsonb",
                [JSON.stringify([domain])]
            );

            if (result.rows.length > 0) {
                const tenant = result.rows[0];
                return {
                    mode: 'SSO',
                    tenantId: tenant.id,
                    tenantName: tenant.name,
                    ssoType: tenant.auth_settings.sso_type || 'GOOGLE',
                    userExists: !!user
                };
            }
        } else {
            // Check in-memory tenants
            for (const [, tenant] of inMemoryTenants) {
                if (tenant.auth_settings?.sso_domains?.includes(domain)) {
                    return {
                        mode: 'SSO',
                        tenantId: tenant.id,
                        tenantName: tenant.name,
                        ssoType: tenant.auth_settings.sso_type || 'GOOGLE',
                        userExists: !!user
                    };
                }
            }
        }

        // Default to Magic Code, but flag if it's a completely new user/domain
        return {
            mode: 'MAGIC_CODE',
            userExists: !!user,
            isNewUser: !user
        };
    }

    // Generate and "send" magic code
    static async sendMagicCode(email) {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        if (hasDatabase) {
            const { query } = require('../config/database');
            await query(
                `INSERT INTO magic_codes (email, code, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET code = $2, expires_at = $3`,
                [email, code, expiresAt]
            );
        } else {
            inMemoryMagicCodes.set(email, { code, expiresAt });
        }

        // In a real app, send actual email. For now, log it.
        console.log(`\n============================================================`);
        console.log(`[MAGIC_CODE] To: ${email}, Code: ${code}`);
        console.log(`============================================================\n`);
        return { success: true, message: 'Code sent to your email.' };
    }

    // Proxy for getting user by email (in-memory or DB)
    static async getUserByEmail(email) {
        if (hasDatabase) {
            const { query } = require('../config/database');
            const result = await query(
                'SELECT id, tenant_id, role FROM users WHERE email = $1',
                [email]
            );
            return result.rows[0];
        } else {
            for (const [, user] of inMemoryUsers) {
                if (user.email === email) return user;
            }
            return null;
        }
    }

    // Verify magic code and return token
    static async verifyMagicCode(email, code) {
        let isValid = false;

        if (hasDatabase) {
            const { query } = require('../config/database');
            const result = await query(
                'SELECT * FROM magic_codes WHERE email = $1 AND code = $2 AND expires_at > CURRENT_TIMESTAMP',
                [email, code]
            );
            if (result.rows.length > 0) {
                isValid = true;
                await query('DELETE FROM magic_codes WHERE email = $1', [email]);
            }
        } else {
            const record = inMemoryMagicCodes.get(email);
            if (record && record.code === code && record.expiresAt > new Date()) {
                isValid = true;
                inMemoryMagicCodes.delete(email);
            }
        }

        if (!isValid) {
            throw new Error('Invalid or expired code');
        }

        // Get user
        const user = await this.getUserByEmail(email);

        if (!user) {
            throw new Error('User not found. Please contact your admin.');
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, tenantId: user.tenant_id, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        return { token, user };
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
                'SELECT id, name, default_language, enabled_languages, retention_days, status, allow_rehydration FROM tenants WHERE id = $1',
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
                enabledLanguages: tenant.enabled_languages || ['en', 'he'],
                retentionDays: tenant.retention_days,
                status: tenant.status,
                allowRehydration: tenant.allow_rehydration || false
            },
            effectiveLanguage
        };
    }
}

module.exports = AuthService;
