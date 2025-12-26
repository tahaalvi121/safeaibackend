// TelemetryService.js
// Handles aggregation and storage of anonymous usage metrics

class TelemetryService {
    constructor() {
        this.buffer = [];
        this.FLUSH_INTERVAL = 60000; // 1 minute
        this.BATCH_SIZE = 50;

        // Start flush timer
        setInterval(() => this.flush(), this.FLUSH_INTERVAL);
    }

    /**
     * Track an event
     * @param {Object} event - { tenantId, type, riskLevel, tool, timestamp }
     */
    track(event) {
        const enrichedEvent = {
            ...event,
            timestamp: event.timestamp || new Date().toISOString()
        };

        this.buffer.push(enrichedEvent);

        if (this.buffer.length >= this.BATCH_SIZE) {
            this.flush();
        }
    }

    async flush() {
        if (this.buffer.length === 0) return;

        const batch = [...this.buffer];
        this.buffer = [];

        try {
            const { query } = require('../config/database');
            const { v4: uuidv4 } = require('uuid');

            for (const event of batch) {
                // Ensure Data Minimization: Remove any raw content fields
                const { text, documentContent, ...safeEvent } = event;

                // Handle structured events
                if (['PromptEvaluated', 'ANALYSIS', 'BLOCK', 'WARN'].includes(safeEvent.type)) {
                    await query(
                        `INSERT INTO security_logs (log_id, tenant_id, user_id, action_type, risk_level, decision, findings_count, findings, platform, latency_ms, timestamp)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                        [
                            uuidv4(),
                            safeEvent.tenantId || 'demo-tenant',
                            safeEvent.userId || 'anonymous',
                            safeEvent.type,
                            safeEvent.riskLevel || 'LOW',
                            safeEvent.decision || 'ALLOW',
                            safeEvent.findings ? safeEvent.findings.length : 0,
                            JSON.stringify(safeEvent.findings || []),
                            safeEvent.tool || 'UNKNOWN',
                            safeEvent.latencyMs || null,
                            safeEvent.timestamp || new Date()
                        ]
                    );
                } else if (safeEvent.type === 'PromptActionTaken') {
                    // Log user actions (Fix/Enhance/SendAnyway/Back)
                    await query(
                        `INSERT INTO security_logs (log_id, tenant_id, user_id, action_type, findings, platform, timestamp)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [
                            uuidv4(),
                            safeEvent.tenantId || 'demo-tenant',
                            safeEvent.userId || 'anonymous',
                            `ACTION_${safeEvent.actionType}`,
                            JSON.stringify(safeEvent.detectors || []),
                            safeEvent.tool || 'UNKNOWN',
                            safeEvent.timestamp || new Date()
                        ]
                    );
                } else if (safeEvent.type === 'WizardDocumentUploaded' || safeEvent.type === 'WizardQuestionAsked') {
                    // Log Wizard activity
                    await query(
                        `INSERT INTO security_logs (log_id, tenant_id, user_id, action_type, findings, platform, timestamp)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [
                            uuidv4(),
                            safeEvent.tenantId || 'demo-tenant',
                            safeEvent.userId || 'anonymous',
                            safeEvent.type,
                            JSON.stringify(safeEvent.detectors || safeEvent.classifierTags || []),
                            'WIZARD',
                            safeEvent.timestamp || new Date()
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
                    [safeEvent.tenantId || 'demo-tenant', month]
                );
            }

            console.log(`[Telemetry] Flushed ${batch.length} events (Privacy-Preserving).`);
        } catch (error) {
            console.error('[Telemetry] Failed to flush events:', error);
        }
    }
}

module.exports = new TelemetryService();
