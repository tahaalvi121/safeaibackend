// Self-contained API handler for all routes in a single Vercel function

// JWT implementation for authentication
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Database connection
const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

// Create a single pool instance to be reused across invocations
let pool;

if (process.env.NODE_ENV === 'production') {
  // Production database configuration for Vercel
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 1, // Use only 1 connection in serverless environment
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
} else {
  // Development configuration
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/safeai',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

// Query helper function
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// CORS configuration
const cors = require('cors');

// Configure CORS to be more permissive for local development
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://chat.openai.com,https://claude.ai,https://gemini.google.com')
  .split(',')
  .map(origin => origin.trim());

// Add wildcards for various deployment platforms
allowedOrigins.push('https://*.onrender.com');
allowedOrigins.push('https://*.railway.app');
allowedOrigins.push('https://*.vercel.app');
allowedOrigins.push('chrome-extension://*');

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Always allow chrome extensions
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        // Handle wildcard origins
        const regex = new RegExp(`^${allowedOrigin.replace(/\*/g, '.*')}$`);
        return regex.test(origin);
      }
      return origin.startsWith(allowedOrigin);
    })) {
      callback(null, true);
    } else {
      // For development, allow all origins but log the blocked one
      console.log(`CORS: Allowing origin ${origin} (development mode)`);
      callback(null, true);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS to the response
function applyCors(req, res) {
  const corsHandler = cors(corsOptions);
  return new Promise((resolve, reject) => {
    corsHandler(req, res, (result) => {
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    });
  });
}

// Main request handler
async function handleRequest(req, res, handlers) {
  try {
    // Apply CORS
    await applyCors(req, res);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Get the handler for the method
    const methodHandler = handlers[req.method];
    
    if (!methodHandler) {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Execute the method handler
    const result = await methodHandler(req, res);
    
    // If result is already a response object, return it
    if (result && result.status && result.body) {
      return res.status(result.status).json(result.body);
    }
    
    // Otherwise, return the result as JSON
    return res.status(200).json(result);
  } catch (error) {
    console.error('Request handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Authentication utility
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function authenticate(req) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Authorization header missing or invalid');
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user still exists in the database
    if (process.env.DATABASE_URL) {
      const result = await query('SELECT id FROM users WHERE id = $1', [decoded.userId]);
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
    }

    return {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role
    };
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

// Simplified TelemetryService
class TelemetryService {
    constructor() {
        this.buffer = [];
    }

    /**
     * Track an event
     * @param {Object} event - { tenantId, type, riskLevel, tool, timestamp }
     */
    async track(event) {
        const enrichedEvent = {
            ...event,
            timestamp: event.timestamp || new Date().toISOString()
        };

        try {
            // Handle structured events
            if (['PromptEvaluated', 'ANALYSIS', 'BLOCK', 'WARN'].includes(enrichedEvent.type)) {
                await query(
                    `INSERT INTO security_logs (log_id, tenant_id, user_id, action_type, risk_level, decision, findings_count, findings, platform, latency_ms, timestamp)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [
                        uuidv4(),
                        enrichedEvent.tenantId || 'demo-tenant',
                        enrichedEvent.userId || 'anonymous',
                        enrichedEvent.type,
                        enrichedEvent.riskLevel || 'LOW',
                        enrichedEvent.decision || 'ALLOW',
                        enrichedEvent.findings ? enrichedEvent.findings.length : 0,
                        JSON.stringify(enrichedEvent.findings || []),
                        enrichedEvent.tool || 'UNKNOWN',
                        enrichedEvent.latencyMs || null,
                        enrichedEvent.timestamp || new Date()
                    ]
                );
            } else if (enrichedEvent.type === 'PromptActionTaken') {
                // Log user actions (Fix/Enhance/SendAnyway/Back)
                await query(
                    `INSERT INTO security_logs (log_id, tenant_id, user_id, action_type, findings, platform, timestamp)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        uuidv4(),
                        enrichedEvent.tenantId || 'demo-tenant',
                        enrichedEvent.userId || 'anonymous',
                        `ACTION_${enrichedEvent.actionType}`,
                        JSON.stringify(enrichedEvent.detectors || []),
                        enrichedEvent.tool || 'UNKNOWN',
                        enrichedEvent.timestamp || new Date()
                    ]
                );
            } else if (enrichedEvent.type === 'WizardDocumentUploaded' || enrichedEvent.type === 'WizardQuestionAsked') {
                // Log Wizard activity
                await query(
                    `INSERT INTO security_logs (log_id, tenant_id, user_id, action_type, findings, platform, timestamp)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        uuidv4(),
                        enrichedEvent.tenantId || 'demo-tenant',
                        enrichedEvent.userId || 'anonymous',
                        enrichedEvent.type,
                        JSON.stringify(enrichedEvent.detectors || enrichedEvent.classifierTags || []),
                        'WIZARD',
                        enrichedEvent.timestamp || new Date()
                    ]
                );
            }

            // Track usage in usage_tracking
            const month = new Date().toISOString().substring(0, 7);
            await query(
                `INSERT INTO usage_tracking (tenant_id, month, requests_count)
                 VALUES ($1, $2, 1)
                 ON CONFLICT (tenant_id, month) 
                 DO UPDATE SET requests_count = usage_tracking.requests_count + 1`,
                [enrichedEvent.tenantId || 'demo-tenant', month]
            );

            console.log(`[Telemetry] Tracked event: ${enrichedEvent.type}`);
        } catch (error) {
            console.error('[Telemetry] Failed to track event:', error);
        }
    }
}

const telemetryService = new TelemetryService();

// Simple text analysis (simplified version)
function analyzeText(text, context) {
  // This is a simplified version - in the real app, this would use AI services
  const findings = [];
  const riskLevel = 'LOW'; // Simplified
  
  // Basic PII detection
  if (text.match(/\b\d{3}-\d{2}-\d{4}\b/)) { // SSN pattern
    findings.push({ category: 'PII_BASIC', type: 'SSN', detected: true });
  }
  if (text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)) { // Email
    findings.push({ category: 'PII_BASIC', type: 'EMAIL', detected: true });
  }
  
  return {
    findings,
    riskLevel,
    text
  };
}

// Simple text anonymization (simplified version)
function anonymizeText(text, findings) {
  let sanitizedText = text;
  
  // Replace detected PII with placeholders
  sanitizedText = sanitizedText.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  sanitizedText = sanitizedText.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  
  return {
    sanitizedText,
    originalText: text
  };
}

// AuthService functions (simplified)
async function checkAuthMode(email) {
  // In a real implementation, this would check the user's authentication mode
  return { mode: 'MAGIC_CODE', email };
}

async function sendMagicCode(email) {
  // In a real implementation, this would send an actual email
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  // Store the code temporarily (in a real app, use Redis or database)
  console.log(`Magic code ${code} sent to ${email}`);
  return { success: true, email };
}

async function verifyMagicCode(email, code) {
  // In a real implementation, this would verify the code from storage
  if (code.length === 6 && /^\d+$/.test(code)) {
    // Generate a JWT token
    const token = jwt.sign({
      userId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId: 'demo-tenant',
      role: 'TENANT_USER',
      email
    }, JWT_SECRET, { expiresIn: '7d' });
    
    return { 
      success: true, 
      token,
      user: { 
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email,
        tenantId: 'demo-tenant'
      }
    };
  } else {
    throw new Error('Invalid code');
  }
}

async function login(email, password) {
  // In a real implementation, this would verify credentials
  if (email && password) {
    const token = jwt.sign({
      userId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId: 'demo-tenant',
      role: 'TENANT_USER',
      email
    }, JWT_SECRET, { expiresIn: '7d' });
    
    return { 
      success: true, 
      token,
      user: { 
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email,
        tenantId: 'demo-tenant'
      }
    };
  } else {
    throw new Error('Invalid credentials');
  }
}

// Helper function to get localized strings
const enLocale = {
  "policyBlocked": "Content blocked by policy",
  "decisionWarn": "Content detected, review before sending",
  "decisionAllow": "Content appears safe to send"
};

const heLocale = {};

function getLocalizedString(language, key) {
  const locales = {
    en: enLocale,
    he: heLocale
  };

  return locales[language]?.[key] || locales['en'][key] || key;
}

module.exports = async function handler(req, res) {
  // Extract the path from the URL
  const url = req.url || req.headers['x-forwarded-url'] || '';
  const pathParts = url.split('/');
  const path = pathParts.slice(1).join('/'); // Remove the leading empty string

  // Route based on the path
  if (path === '' || path === 'index') {
    // Root endpoint
    return handleRequest(req, res, {
      GET: () => {
        return {
          service: 'SafeAI Backend (Vercel)',
          status: 'Running',
          version: '2.0.0-vercel',
          timestamp: new Date().toISOString(),
          message: 'SafeAI backend successfully deployed to Vercel',
          endpoints: {
            health: '/health',
            ready: '/ready',
            live: '/live',
            inline: '/inline/check',
            telemetry: '/telemetry/event or /telemetry/action',
            auth: '/auth/login, /auth/check, /auth/send, /auth/verify'
          }
        };
      }
    });
  } else if (path === 'health') {
    // Health check endpoint
    return handleRequest(req, res, {
      GET: () => {
        return {
          status: 'OK',
          version: '2.0.0-complete',
          timestamp: new Date().toISOString(),
          database: !!process.env.DATABASE_URL
        };
      }
    });
  } else if (path === 'ready') {
    // Ready check endpoint
    return handleRequest(req, res, {
      GET: () => {
        return {
          status: 'READY',
          service: 'safeai-backend',
          timestamp: new Date().toISOString()
        };
      }
    });
  } else if (path === 'live') {
    // Live check endpoint
    return handleRequest(req, res, {
      GET: () => {
        return {
          status: 'ALIVE',
          service: 'safeai-backend',
          timestamp: new Date().toISOString()
        };
      }
    });
  } else if (path.startsWith('inline')) {
    // Inline check endpoint
    if (path === 'inline/check') {
      // Apply authentication
      let auth;
      try {
        auth = await authenticate(req);
        req.auth = auth;
      } catch (authError) {
        return { status: 401, body: { error: 'Authentication failed' } };
      }

      return handleRequest(req, res, {
        POST: async (req, res) => {
          try {
            const { rawText, personaId, sourceApp } = req.body;
            const { userId, tenantId } = req.auth;

            if (!rawText) {
              return { status: 400, body: { error: 'rawText is required' } };
            }

            // Get user and tenant info (simplified - would normally query database)
            const user = { preferred_language: 'en', selected_persona_id: 'client_explainer' };
            const tenant = { default_language: 'en', allow_rehydration: true };

            const effectiveLanguage = user.preferred_language || tenant.default_language || 'en';
            const effectivePersonaId = personaId || user.selected_persona_id || 'client_explainer';

            // Get persona (simplified)
            const persona = { name: 'Client Explainer', id: effectivePersonaId };

            // Analyze text
            const analysis = analyzeText(rawText, { tenantId, userId, platform: sourceApp });

            // Get policies for tenant (simplified)
            const policies = { 'PII_BASIC': 'WARN' }; // Default policy

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

            return {
              decision,
              riskLevel: analysis.riskLevel,
              categories: detectedCategories,
              findings: analysis.findings,
              sanitizedText,
              explanation,
              personaUsed: persona.name,
              language: effectiveLanguage
            };

          } catch (error) {
            console.error('Inline check error:', error);
            return { status: 500, body: { error: 'Inline check failed', message: error.message } };
          }
        }
      });
    } else {
      return { status: 404, body: { error: 'Endpoint not found' } };
    }
  } else if (path.startsWith('telemetry')) {
    // Telemetry endpoints
    if (path === 'telemetry/action') {
      return handleRequest(req, res, {
        POST: async (req, res) => {
          try {
            const { actionType, detectors, tool, userId, tenantId } = req.body;

            await telemetryService.track({
              type: 'PromptActionTaken',
              actionType,
              detectors,
              tool,
              userId,
              tenantId
            });

            return { success: true };
          } catch (error) {
            console.error('Telemetry action error:', error);
            return { status: 500, body: { error: 'Telemetry action tracking failed', message: error.message } };
          }
        }
      });
    } else {
      return handleRequest(req, res, {
        POST: async (req, res) => {
          try {
            const { type, count, details } = req.body;

            await telemetryService.track({
              tenantId: req.headers['x-tenant-id'] || 'demo-tenant',
              type: type || 'EXTENSION_EVENT',
              details,
              timestamp: new Date().toISOString()
            });

            return { status: 200, body: 'OK' };
          } catch (error) {
            console.error('Telemetry event error:', error);
            return { status: 500, body: { error: 'Telemetry event tracking failed', message: error.message } };
          }
        }
      });
    }
  } else if (path.startsWith('auth')) {
    // Auth endpoints
    if (path === 'auth/check') {
      return handleRequest(req, res, {
        POST: async (req, res) => {
          try {
            const { email } = req.body;
            if (!email) return { status: 400, body: { error: 'Email required' } };

            const result = await checkAuthMode(email);
            return result;
          } catch (error) {
            return { status: 400, body: { error: error.message } };
          }
        }
      });
    } else if (path === 'auth/send') {
      return handleRequest(req, res, {
        POST: async (req, res) => {
          try {
            const { email } = req.body;
            if (!email) return { status: 400, body: { error: 'Email required' } };

            const result = await sendMagicCode(email);
            return result;
          } catch (error) {
            return { status: 400, body: { error: error.message } };
          }
        }
      });
    } else if (path === 'auth/verify') {
      return handleRequest(req, res, {
        POST: async (req, res) => {
          try {
            const { email, code } = req.body;
            if (!email || !code) return { status: 400, body: { error: 'Email and code required' } };

            const result = await verifyMagicCode(email, code);
            return result;
          } catch (error) {
            return { status: 401, body: { error: error.message } };
          }
        }
      });
    } else if (path === 'auth/login') {
      return handleRequest(req, res, {
        POST: async (req, res) => {
          try {
            const { email, password } = req.body;

            if (!email || !password) {
              return { status: 400, body: { error: 'Email and password required' } };
            }

            const result = await login(email, password);
            return result;
          } catch (error) {
            return { status: 400, body: { error: error.message } };
          }
        }
      });
    } else {
      return { status: 404, body: { message: 'Auth endpoint - use /auth/login, /auth/check, /auth/send, or /auth/verify', status: 'info' } };
    }
  } else {
    // Default 404 for any other path
    return handleRequest(req, res, {
      GET: () => {
        return { status: 404, body: { error: 'Endpoint not found' } };
      },
      POST: () => {
        return { status: 404, body: { error: 'Endpoint not found' } };
      }
    });
  }
};

// Export config for Vercel
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};