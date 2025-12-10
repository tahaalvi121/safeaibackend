// Document Processor Module - Extract text and analyze documents
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const fs = require('fs').promises;
const { analyzeText } = require('./analyzer');

class DocumentProcessor {
    // Extract text from PDF
    static async extractFromPDF(filePath) {
        try {
            const dataBuffer = await fs.readFile(filePath);
            const data = await pdfParse(dataBuffer);
            return {
                text: data.text,
                pages: data.numpages,
                info: data.info
            };
        } catch (error) {
            console.error('PDF extraction error:', error);
            throw new Error('Failed to extract text from PDF');
        }
    }

    // Extract text from DOCX
    static async extractFromDOCX(filePath) {
        try {
            const result = await mammoth.extractRawText({ path: filePath });
            return {
                text: result.value,
                messages: result.messages
            };
        } catch (error) {
            console.error('DOCX extraction error:', error);
            throw new Error('Failed to extract text from DOCX');
        }
    }

    // Extract text from Excel/CSV
    static async extractFromExcel(filePath) {
        try {
            const workbook = XLSX.readFile(filePath);
            let allText = '';

            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const csvData = XLSX.utils.sheet_to_csv(sheet);
                allText += `\n=== Sheet: ${sheetName} ===\n${csvData}\n`;
            });

            return {
                text: allText,
                sheets: workbook.SheetNames.length
            };
        } catch (error) {
            console.error('Excel extraction error:', error);
            throw new Error('Failed to extract text from Excel');
        }
    }

    // Extract text from TXT
    static async extractFromTXT(filePath) {
        try {
            const text = await fs.readFile(filePath, 'utf-8');
            return { text };
        } catch (error) {
            console.error('TXT extraction error:', error);
            throw new Error('Failed to read text file');
        }
    }

    // Main extraction method
    static async extractText(filePath, fileType) {
        const type = fileType.toLowerCase();

        switch (type) {
            case 'pdf':
            case 'application/pdf':
                return await this.extractFromPDF(filePath);

            case 'docx':
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                return await this.extractFromDOCX(filePath);

            case 'xlsx':
            case 'xls':
            case 'csv':
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
            case 'application/vnd.ms-excel':
            case 'text/csv':
                return await this.extractFromExcel(filePath);

            case 'txt':
            case 'text/plain':
                return await this.extractFromTXT(filePath);

            default:
                throw new Error(`Unsupported file type: ${type}`);
        }
    }

    // Analyze document for PII
    static async analyzeDocument(filePath, fileType, context = {}) {
        try {
            // Extract text
            const extraction = await this.extractText(filePath, fileType);
            const text = extraction.text;

            // Analyze for PII
            const analysis = analyzeText(text, context);

            return {
                extraction,
                analysis,
                summary: {
                    textLength: text.length,
                    findingsCount: analysis.findings.length,
                    riskLevel: analysis.riskLevel,
                    anomalyScore: analysis.anomalyScore
                }
            };
        } catch (error) {
            console.error('Document analysis error:', error);
            throw error;
        }
    }

    // Anonymize document text
    static anonymizeDocumentText(text, findings) {
        const { anonymizeText } = require('./anonymizer');
        return anonymizeText(text, findings);
    }

    // Summarize document (basic version)
    static summarizeDocument(text, maxLength = 500) {
        // Simple summarization - take first paragraph and key sentences
        const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);

        if (paragraphs.length === 0) return '';

        let summary = paragraphs[0];

        if (summary.length > maxLength) {
            summary = summary.substring(0, maxLength) + '...';
        }

        return summary;
    }
}

module.exports = DocumentProcessor;
