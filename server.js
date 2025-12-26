const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();

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

// Use permissive CORS for all environments to fix the immediate issue
app.use(cors({
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));

// Serve static files
app.use('/wizard', express.static(path.join(__dirname, '../document-wizard/public')));
app.use('/admin-dashboard', express.static(path.join(__dirname, '../admin-dashboard')));
app.use('/platform-admin', express.static(path.join(__dirname, '../platform-admin')));
app.use(express.static(path.join(__dirname, '..'))); // Serve parent directory for login.html

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoints for Render
app.get('/', (req, res) => {
  res.json({
    service: 'SafeAI Backend',
    status: 'OK',
    version: '2.0.0-complete',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    version: '2.0.0-complete',
    timestamp: new Date().toISOString(),
    database: !!process.env.DATABASE_URL
  });
});

app.get('/ready', (req, res) => {
  res.status(200).json({
    status: 'READY',
    service: 'safeai-backend',
    timestamp: new Date().toISOString()
  });
});

app.get('/live', (req, res) => {
  res.status(200).json({
    status: 'ALIVE',
    service: 'safeai-backend',
    timestamp: new Date().toISOString()
  });
});

// Main analysis and protection logic is handled in /inline and /api/documents

// Mount routes
app.use('/inline', require('./routes/inline'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/wizard', require('./routes/documents')); // Alias for wizard
app.use('/personas', require('./routes/personas'));
app.use('/prompts', require('./routes/prompts'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/admin/dashboard', require('./routes/dashboard'));
app.use('/admin/billing', require('./routes/billing'));
app.use('/platform', require('./routes/platform'));
app.use('/verify', require('./routes/public'));

// Telemetry Action Tracking
app.post('/telemetry/action', (req, res) => {
  const TelemetryService = require('./services/TelemetryService');
  const { actionType, detectors, tool, userId, tenantId } = req.body;

  TelemetryService.track({
    type: 'PromptActionTaken',
    actionType,
    detectors,
    tool,
    userId,
    tenantId
  });

  res.json({ success: true });
});

// Telemetry Endpoint
app.post('/telemetry/event', (req, res) => {
  const { type, count, details } = req.body;
  const TelemetryService = require('./services/TelemetryService');

  TelemetryService.track({
    tenantId: req.headers['x-tenant-id'] || 'demo-tenant',
    type: type || 'EXTENSION_EVENT',
    details,
    timestamp: new Date().toISOString()
  });

  res.status(200).send('OK');
});

// Serve static badge files
app.use('/badges', express.static(path.join(__dirname, 'public/badges')));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Database check
if (!process.env.DATABASE_URL) {
  console.warn('\nWARNING: No DATABASE_URL. Running without persistence.\n');
}

// Start retention job
const retentionJob = require('./jobs/retentionJob');
retentionJob.start();

// Start server
// Use Railway's PORT or default to 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n============================================================`);
  console.log(`SafeAI Security Backend v2.0.0 (Complete)`);
  console.log(`============================================================`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Wizard: http://localhost:${PORT}/wizard`);
  console.log(`Admin: http://localhost:${PORT}/admin-dashboard/`);
  console.log(`Login: http://localhost:${PORT}/login.html`);
  console.log(`============================================================\n`);
});

module.exports = app;