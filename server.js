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

// Simple analyze endpoint (no auth required for demo)
app.post('/analyze', async (req, res) => {
  const { text, platform, personaId } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const analyzer = require('./modules/analyzer');
  const anonymizer = require('./modules/anonymizer');
  
  // Get persona if specified
  let persona = null;
  if (personaId) {
    try {
      // Check if we have a database
      if (process.env.DATABASE_URL) {
        // Import personas route functions
        const { query } = require('./config/database');
        const result = await query(
          'SELECT * FROM personas WHERE id = $1 AND enabled = true',
          [personaId]
        );
        
        if (result.rows.length > 0) {
          persona = result.rows[0];
        }
      } else {
        // Use default personas when no database is available
        const defaultPersonas = {
          'tax-advisor': {
            id: 'tax-advisor',
            name: 'Tax Advisor',
            description: 'Expert in tax compliance and financial regulations',
            system_template: 'You are a tax advisor specializing in identifying and protecting sensitive financial information. Focus on detecting tax identification numbers, financial account numbers, and income details.'
          },
          'legal-assistant': {
            id: 'legal-assistant',
            name: 'Legal Assistant',
            description: 'Specialist in legal document confidentiality',
            system_template: 'You are a legal assistant trained to identify privileged and confidential information in legal documents. Focus on detecting client names, case details, legal strategies, and court information.'
          },
          'client-explainer': {
            id: 'client-explainer',
            name: 'Client Explainer',
            description: 'Helps explain complex topics to clients',
            system_template: 'You are a client explainer who simplifies complex information while protecting sensitive details. Focus on making content understandable while preserving confidentiality.'
          }
        };
        
        if (defaultPersonas[personaId]) {
          persona = defaultPersonas[personaId];
        }
      }
    } catch (error) {
      console.warn('Failed to load persona:', error.message);
    }
  }

  const analysis = analyzer.analyzeText(text, { platform });
  const anonymized = anonymizer.anonymizeText(text, analysis.findings);
  
  // If persona is available, we can use it for enhanced analysis
  let enhancedResponse = {};
  if (persona) {
    enhancedResponse.persona = {
      id: persona.id,
      name: persona.name,
      description: persona.description
    };
  }

  res.json({
    riskLevel: analysis.riskLevel,
    findings: analysis.findings,
    anonymized: anonymized.sanitizedText,
    ...enhancedResponse
  });
});

// Mount routes
app.use('/inline', require('./routes/inline'));
app.use('/documents', require('./routes/documents'));
app.use('/wizard', require('./routes/documents')); // Alias for wizard
app.use('/personas', require('./routes/personas'));
app.use('/prompts', require('./routes/prompts'));
app.use('/evidence', require('./routes/evidence'));
app.use('/admin', require('./routes/admin'));

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
  console.log(`Analyze: http://localhost:${PORT}/analyze (no auth)`);
  console.log(`Wizard: http://localhost:${PORT}/wizard`);
  console.log(`Evidence: http://localhost:${PORT}/evidence/:token`);
  console.log(`Admin: http://localhost:${PORT}/admin-dashboard/`);
  console.log(`Login: http://localhost:${PORT}/login.html`);
  console.log(`============================================================\n`);
});

module.exports = app;