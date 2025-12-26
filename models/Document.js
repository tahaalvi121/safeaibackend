// Document Model - Database operations for documents with in-memory fallback
const { query } = require('../config/database');

// In-memory storage fallback
const inMemoryDocuments = new Map();

// Check if database is available
let hasDatabase = false;
try {
    hasDatabase = !!process.env.DATABASE_URL;
} catch (error) {
    hasDatabase = false;
}

class Document {
    // Create document record
    static async create(documentData) {
        const {
            document_id,
            tenant_id,
            user_id,
            filename,
            file_type,
            file_size
        } = documentData;

        if (hasDatabase) {
            try {
                const result = await query(
                    `INSERT INTO documents
           (document_id, tenant_id, user_id, filename, file_type, file_size, status, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', CURRENT_TIMESTAMP)
           RETURNING *`,
                    [document_id, tenant_id, user_id, filename, file_type, file_size]
                );
                return result.rows[0];
            } catch (error) {
                console.log('Database error, using in-memory storage');
                // Fall through to in-memory
            }
        }

        // In-memory fallback
        const document = {
            document_id,
            tenant_id,
            user_id,
            filename,
            file_type,
            file_size,
            status: 'uploaded',
            uploaded_at: new Date().toISOString()
        };
        inMemoryDocuments.set(document_id, document);
        return document;
    }

    // Get document by ID with tenant isolation
    static async findById(document_id, tenant_id) {
        if (hasDatabase) {
            try {
                const queryStr = tenant_id
                    ? 'SELECT * FROM documents WHERE document_id = $1 AND tenant_id = $2'
                    : 'SELECT * FROM documents WHERE document_id = $1';
                const params = tenant_id ? [document_id, tenant_id] : [document_id];

                const result = await query(queryStr, params);
                return result.rows[0];
            } catch (error) {
                console.log('Database error, using in-memory storage');
            }
        }

        // In-memory fallback
        const doc = inMemoryDocuments.get(document_id);
        if (doc && tenant_id && doc.tenant_id !== tenant_id) {
            return null;
        }
        return doc;
    }

    // Update document after processing
    static async updateProcessed(document_id, findings) {
        if (hasDatabase) {
            try {
                const result = await query(
                    `UPDATE documents
           SET status = 'processed',
               pii_found = $2,
               findings = $3,
               processed_at = CURRENT_TIMESTAMP
           WHERE document_id = $1
           RETURNING *`,
                    [document_id, findings.length > 0, JSON.stringify(findings)]
                );
                return result.rows[0];
            } catch (error) {
                console.log('Database error, using in-memory storage');
            }
        }

        // In-memory fallback
        const document = inMemoryDocuments.get(document_id);
        if (document) {
            document.status = 'processed';
            document.pii_found = findings.length > 0;
            document.findings = JSON.stringify(findings);
            document.processed_at = new Date().toISOString();
            inMemoryDocuments.set(document_id, document);
            return document;
        }
        return null;
    }

    // Get documents for a tenant
    static async findByTenant(tenant_id, limit = 50) {
        if (hasDatabase) {
            try {
                const result = await query(
                    `SELECT * FROM documents
           WHERE tenant_id = $1
           ORDER BY uploaded_at DESC
           LIMIT $2`,
                    [tenant_id, limit]
                );
                return result.rows;
            } catch (error) {
                console.log('Database error, using in-memory storage');
            }
        }

        // In-memory fallback
        const documents = Array.from(inMemoryDocuments.values())
            .filter(doc => doc.tenant_id === tenant_id)
            .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
            .slice(0, limit);
        return documents;
    }

    // Delete document
    static async delete(document_id) {
        if (hasDatabase) {
            try {
                await query(
                    'DELETE FROM documents WHERE document_id = $1',
                    [document_id]
                );
                return;
            } catch (error) {
                console.log('Database error, using in-memory storage');
            }
        }

        // In-memory fallback
        inMemoryDocuments.delete(document_id);
    }
}

module.exports = Document;
