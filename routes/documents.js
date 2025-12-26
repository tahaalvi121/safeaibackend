// Document Routes - API endpoints for document processing
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const DocumentProcessor = require('../modules/documentProcessor');
const Document = require('../models/Document');
const Tenant = require('../models/Tenant');
const { authenticate, optionalAuth } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        // Accept PDF, DOCX, DOC, TXT, and common office formats
        const allowedExtensions = /pdf|docx|doc|xlsx|xls|csv|txt/;
        const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());

        // Also accept common MIME types and octet-stream (for files without proper MIME)
        const allowedMimeTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/plain',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
            'application/octet-stream'
        ];
        const mimetype = allowedMimeTypes.includes(file.mimetype);

        if (extname || mimetype) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, DOC, TXT, XLSX, XLS, CSV`));
        }
    }
});

// Upload document
router.post('/upload', optionalAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const tenantId = req.auth?.tenantId || 'demo-tenant';
        const userId = req.auth?.userId || 'demo-user';
        const TelemetryService = require('../services/TelemetryService');

        // Track Document Upload Telemetry
        TelemetryService.track({
            type: 'WizardDocumentUploaded',
            tenantId,
            userId,
            fileType: path.extname(req.file.originalname).slice(1),
            detectors: [], // To be populated during analysis
            timestamp: new Date().toISOString()
        });

        // Create document record
        const documentId = uuidv4();
        const document = await Document.create({
            document_id: documentId,
            tenant_id: tenantId,
            user_id: userId,
            filename: req.file.originalname,
            file_type: path.extname(req.file.originalname).slice(1),
            file_size: req.file.size
        });

        // Store file path in memory for processing
        global.documentPaths = global.documentPaths || {};
        global.documentPaths[documentId] = req.file.path;

        res.json({
            documentId,
            filename: req.file.originalname,
            size: req.file.size,
            status: 'uploaded'
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed', message: error.message });
    }
});

// Analyze document
router.post('/:documentId/analyze', optionalAuth, async (req, res) => {
    try {
        const { documentId } = req.params;

        const filePath = global.documentPaths?.[documentId];
        if (!filePath) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const document = await Document.findById(documentId);
        if (!document) {
            return res.status(404).json({ error: 'Document record not found' });
        }

        // Analyze document
        const result = await DocumentProcessor.analyzeDocument(
            filePath,
            document.file_type,
            { tenantId: document.tenant_id, userId: document.user_id }
        );

        // Update document with findings
        await Document.updateProcessed(documentId, result.analysis.findings);

        res.json({
            documentId,
            analysis: result.analysis,
            summary: result.summary
        });

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: 'Analysis failed', message: error.message });
    }
});

// Anonymize document
router.post('/:documentId/anonymize', optionalAuth, async (req, res) => {
    try {
        const { documentId } = req.params;

        const filePath = global.documentPaths?.[documentId];
        if (!filePath) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const document = await Document.findById(documentId);
        if (!document) {
            return res.status(404).json({ error: 'Document record not found' });
        }

        // Extract text
        const DocumentProcessor = require('../modules/documentProcessor');
        const extraction = await DocumentProcessor.extractText(filePath, document.file_type);

        // Re-analyze text to get proper findings with offset information
        const { analyzeText } = require('../modules/analyzer');
        const analysis = analyzeText(extraction.text);
        const findings = analysis.findings;

        // Anonymize
        const anonymized = DocumentProcessor.anonymizeDocumentText(extraction.text, findings);

        // Store anonymized text with proper filename
        const path = require('path');
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const anonymizedPath = path.join(dir, `${baseName}_anonymized.txt`);

        await fs.writeFile(anonymizedPath, anonymized.sanitizedText);

        global.documentPaths[`${documentId}_anonymized`] = anonymizedPath;

        res.json({
            documentId,
            anonymized: true,
            summary: anonymized.summary
        });

    } catch (error) {
        console.error('Anonymization error:', error);
        res.status(500).json({ error: 'Anonymization failed', message: error.message });
    }
});

// Download anonymized document
router.get('/:documentId/download', optionalAuth, async (req, res) => {
    try {
        const { documentId } = req.params;

        const tenantId = req.auth?.tenantId || 'demo-tenant';

        const filePath = global.documentPaths?.[`${documentId}_anonymized`];
        if (!filePath) {
            return res.status(404).json({ error: 'Anonymized document not found' });
        }

        const document = await Document.findById(documentId, tenantId);
        // Create a safe filename for download
        const path = require('path');
        const originalFileName = document.filename || 'document.txt';
        const ext = path.extname(originalFileName);
        const baseName = path.basename(originalFileName, ext);
        const downloadFileName = `${baseName}_anonymized.txt`;

        res.download(filePath, downloadFileName);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed', message: error.message });
    }
});

// Get document details
router.get('/:documentId', optionalAuth, async (req, res) => {
    try {
        const { documentId } = req.params;
        const tenantId = req.auth?.tenantId || 'demo-tenant';
        const document = await Document.findById(documentId, tenantId);

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json(document);

    } catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({ error: 'Failed to get document', message: error.message });
    }
});

// Wizard question endpoint
router.post('/:documentId/question', optionalAuth, async (req, res) => {
    try {
        const { documentId } = req.params;
        const { question, llmProvider = 'openai' } = req.body;
        const tenantId = req.auth?.tenantId || 'demo-tenant';
        const userId = req.auth?.userId || 'demo-user';
        const TelemetryService = require('../services/TelemetryService');
        const { analyzeText } = require('../modules/analyzer');

        // Track Wizard Question Telemetry (Data Minimization: No raw question text)
        const analysis = analyzeText(question || '');
        TelemetryService.track({
            type: 'WizardQuestionAsked',
            tenantId,
            userId,
            detectors: analysis.findings.map(f => f.type),
            timestamp: new Date().toISOString()
        });

        // Validate input
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        // Get document
        const document = await Document.findById(documentId, tenantId);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Get file path
        const filePath = global.documentPaths?.[documentId];
        if (!filePath) {
            return res.status(404).json({ error: 'Document file not found' });
        }

        // For demo purposes without database, we'll use the WizardService
        // In a production environment with database, we would retrieve the session from DB
        const WizardService = require('../services/WizardService');

        // Extract text
        const DocumentProcessor = require('../modules/documentProcessor');
        const extraction = await DocumentProcessor.extractText(filePath, document.file_type);

        // Get sanitized text (anonymized)
        const findings = JSON.parse(document.findings || '[]');
        const anonymized = DocumentProcessor.anonymizeDocumentText(extraction.text, findings);

        // Create a temporary session object for the demo
        const tempSession = {
            id: documentId,
            doc_type: document.file_type,
            doc_summary: `Document type: ${document.file_type}. Content length: ${extraction.text.length} characters.`,
            sanitized_doc_text: anonymized.sanitizedText
        };

        // Use a default persona for demo purposes
        const defaultPersona = {
            id: 'default',
            name: 'General Assistant',
            system_template: 'You are a helpful assistant that answers questions about documents.',
            description: 'General purpose document assistant'
        };

        // Build prompt for Q&A
        const systemPrompt = WizardService.buildWizardPrompt(defaultPersona, tempSession, question);

        let answer = '';

        // Try Google Gemini first if requested and API key is available
        if (llmProvider === 'gemini' && process.env.GEMINI_API_KEY) {
            try {
                const { GoogleGenerativeAI } = require('@google/generative-ai');
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                // Use the correct model name for free tier
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

                const chat = model.startChat({
                    history: [
                        {
                            role: "user",
                            parts: [{ text: systemPrompt }]
                        },
                        {
                            role: "model",
                            parts: [{ text: "Understood. I'm ready to answer questions about the document." }]
                        }
                    ]
                });

                const result = await chat.sendMessage(question);
                const response = await result.response;
                answer = response.text().trim();
            } catch (geminiError) {
                console.error('Gemini Q&A error:', geminiError);
                // Fall back to simple response if Gemini fails
                answer = `Based on the document content, here is what I can tell you about your question "${question}":

Document Summary:
${extraction.text.substring(0, 500)}...

Note: To get more detailed answers, please ensure your Google Gemini API key is properly configured.`;
            }
        }
        // Fall back to OpenAI if requested and API key is available
        else if (llmProvider === 'openai' && process.env.OPENAI_API_KEY) {
            try {
                const OpenAI = require('openai');
                const openai = new OpenAI({
                    apiKey: process.env.OPENAI_API_KEY
                });

                const response = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: question }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7
                });

                answer = response.choices[0].message.content.trim();
            } catch (openaiError) {
                console.error('OpenAI Q&A error:', openaiError);
                // Fall back to simple response if OpenAI fails
                answer = `Based on the document content, here is what I can tell you about your question "${question}":

Document Summary:
${extraction.text.substring(0, 500)}...

Note: To get more detailed answers, please ensure your OpenAI API key is properly configured.`;
            }
        }
        // If no API keys are available, return a default message
        else {
            answer = `Based on the document content, here is what I can tell you about your question "${question}":

Document Summary:
${extraction.text.substring(0, 500)}...

To get more detailed answers, please configure an API key for either:
1. OpenAI (OPENAI_API_KEY environment variable)
2. Google Gemini (GEMINI_API_KEY environment variable)`;
        }

        res.json({
            answer,
            documentId
        });

    } catch (error) {
        console.error('Wizard question error:', error);
        res.status(500).json({ error: 'Failed to process question', message: error.message });
    }
});

module.exports = router;
