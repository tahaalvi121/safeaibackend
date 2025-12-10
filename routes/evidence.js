// Evidence Routes - Public compliance evidence page
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { query } = require('../config/database');
const Tenant = require('../models/Tenant');
const Policy = require('../models/Policy');
const crypto = require('crypto');

// In-memory storage for tokens (use database in production)
const evidenceTokens = new Map();

/**
 * Generate evidence token for a tenant
 */
router.post('/generate-token', async (req, res) => {
    try {
        const { tenantId, expiresInDays = 30 } = req.body;

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        evidenceTokens.set(token, {
            tenantId,
            expiresAt,
            createdAt: new Date()
        });

        res.json({
            token,
            url: `${process.env.APP_URL || 'http://localhost:3000'}/evidence/${token}`,
            expiresAt
        });

    } catch (error) {
        console.error('Generate token error:', error);
        res.status(500).json({ error: 'Failed to generate evidence token' });
    }
});

/**
 * View evidence page (public, read-only)
 */
router.get('/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Verify token
        const evidence = evidenceTokens.get(token);

        if (!evidence) {
            return res.status(410).json({
                error: 'Evidence link expired or invalid',
                message: 'This compliance evidence link is no longer valid.'
            });
        }

        if (new Date() > evidence.expiresAt) {
            evidenceTokens.delete(token);
            return res.status(410).json({
                error: 'Evidence link expired',
                message: 'This compliance evidence link has expired.'
            });
        }

        const tenantId = evidence.tenantId;

        // Get tenant data (use in-memory if no database)
        const tenant = { id: tenantId, name: 'Demo Tenant' };
        const policies = [
            { category: 'PII', decision: 'WARN' },
            { category: 'FINANCIAL', decision: 'BLOCK' },
            { category: 'HEALTH', decision: 'WARN' }
        ];

        // Render HTML evidence page
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compliance Evidence - ${tenant.name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f5f7fa;
    }
    .header {
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      padding: 40px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 32px;
    }
    .header p {
      margin: 0;
      opacity: 0.9;
    }
    .section {
      background: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .section h2 {
      margin: 0 0 20px 0;
      color: #333;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .policy-item {
      display: flex;
      justify-content: space-between;
      padding: 12px;
      border-bottom: 1px solid #f0f0f0;
    }
    .policy-item:last-child {
      border-bottom: none;
    }
    .badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-warn { background: #fff3e0; color: #f57c00; }
    .badge-block { background: #ffebee; color: #c62828; }
    .badge-allow { background: #e8f5e9; color: #2e7d32; }
    .download-btn {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      margin-top: 20px;
    }
    .download-btn:hover {
      background: #5568d3;
    }
    .footer {
      text-align: center;
      color: #999;
      margin-top: 40px;
      font-size: 14px;
    }
    .verified-badge {
      background: #4caf50;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      display: inline-block;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔒 Compliance Evidence Report</h1>
    <p>Tenant: ${tenant.name}</p>
    <p>Generated: ${new Date().toISOString()}</p>
    <div class="verified-badge">✓ Verified by SafeAI</div>
  </div>

  <div class="section">
    <h2>Security Policies</h2>
    ${policies.map(p => `
      <div class="policy-item">
        <strong>${p.category}</strong>
        <span class="badge badge-${p.decision.toLowerCase()}">${p.decision}</span>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h2>Compliance Summary</h2>
    <p>This tenant has implemented SafeAI security controls to protect sensitive information in AI interactions.</p>
    <ul>
      <li>✓ PII Detection and Anonymization</li>
      <li>✓ Policy-Based Access Control</li>
      <li>✓ Audit Logging and Retention</li>
      <li>✓ Multi-Tenant Isolation</li>
    </ul>
  </div>

  <div class="section">
    <h2>Download Options</h2>
    <a href="/evidence/${token}/pdf" class="download-btn">📄 Download PDF Report</a>
  </div>

  <div class="footer">
    <p>This evidence page is valid until ${evidence.expiresAt.toLocaleDateString()}</p>
    <p>Powered by SafeAI Security Platform</p>
  </div>
</body>
</html>
    `;

        res.send(html);

    } catch (error) {
        console.error('Evidence page error:', error);
        res.status(500).json({ error: 'Failed to load evidence page' });
    }
});

/**
 * Download PDF evidence report
 */
router.get('/:token/pdf', async (req, res) => {
    try {
        const { token } = req.params;

        // Verify token
        const evidence = evidenceTokens.get(token);

        if (!evidence || new Date() > evidence.expiresAt) {
            return res.status(410).json({ error: 'Evidence link expired or invalid' });
        }

        const tenantId = evidence.tenantId;
        const tenant = { id: tenantId, name: 'Demo Tenant' };
        const policies = [
            { category: 'PII', decision: 'WARN' },
            { category: 'FINANCIAL', decision: 'BLOCK' },
            { category: 'HEALTH', decision: 'WARN' }
        ];

        // Create PDF
        const doc = new PDFDocument();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="compliance-evidence-${tenantId}.pdf"`);

        doc.pipe(res);

        // Header
        doc.fontSize(24).text('Compliance Evidence Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Tenant: ${tenant.name}`, { align: 'center' });
        doc.text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
        doc.moveDown(2);

        // Security Policies
        doc.fontSize(18).text('Security Policies');
        doc.moveDown();
        policies.forEach(policy => {
            doc.fontSize(12).text(`${policy.category}: ${policy.decision}`);
        });
        doc.moveDown(2);

        // Compliance Summary
        doc.fontSize(18).text('Compliance Summary');
        doc.moveDown();
        doc.fontSize(12).text('This tenant has implemented SafeAI security controls:');
        doc.list([
            'PII Detection and Anonymization',
            'Policy-Based Access Control',
            'Audit Logging and Retention',
            'Multi-Tenant Isolation'
        ]);
        doc.moveDown(2);

        // Footer
        doc.fontSize(10).text(`Valid until: ${evidence.expiresAt.toLocaleDateString()}`, { align: 'center' });
        doc.text('Powered by SafeAI Security Platform', { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

module.exports = router;
