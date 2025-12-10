// Output Filter - Scan LLM responses for sensitive data
const analyzer = require('./analyzer');

class OutputFilter {
    /**
     * Scan LLM output for sensitive patterns and reversal attempts
     */
    static async scanOutput(text, originalEntityMap = {}) {
        const findings = [];

        // 1. Scan for new sensitive patterns in output
        const analysis = analyzer.analyzeText(text);
        if (analysis.findings.length > 0) {
            findings.push({
                type: 'SENSITIVE_IN_OUTPUT',
                severity: 'HIGH',
                patterns: analysis.findings,
                message: 'LLM response contains sensitive information'
            });
        }

        // 2. Check for placeholder reversal attempts
        const reversalAttempts = this.detectReversalAttempts(text, originalEntityMap);
        if (reversalAttempts.length > 0) {
            findings.push({
                type: 'REVERSAL_ATTEMPT',
                severity: 'CRITICAL',
                attempts: reversalAttempts,
                message: 'LLM attempted to reveal original sensitive values'
            });
        }

        // 3. Check for suspicious patterns
        const suspicious = this.detectSuspiciousPatterns(text);
        if (suspicious.length > 0) {
            findings.push({
                type: 'SUSPICIOUS_PATTERN',
                severity: 'MEDIUM',
                patterns: suspicious,
                message: 'Suspicious patterns detected in response'
            });
        }

        // 4. Mask if needed
        if (findings.length > 0) {
            return {
                safe: false,
                findings,
                originalText: text,
                maskedText: this.maskSensitiveContent(text, findings)
            };
        }

        return {
            safe: true,
            text,
            findings: []
        };
    }

    /**
     * Detect if LLM tried to reveal original values
     */
    static detectReversalAttempts(text, entityMap) {
        const attempts = [];

        for (const [placeholder, original] of Object.entries(entityMap)) {
            // Check if original value appears in text
            if (text.toLowerCase().includes(original.toLowerCase())) {
                attempts.push({
                    placeholder,
                    original,
                    context: this.getContext(text, original, 50)
                });
            }

            // Check for partial matches (e.g., revealing part of email)
            const partialMatch = this.findPartialMatch(text, original);
            if (partialMatch) {
                attempts.push({
                    placeholder,
                    original,
                    partial: partialMatch,
                    context: this.getContext(text, partialMatch, 50)
                });
            }
        }

        return attempts;
    }

    /**
     * Detect suspicious patterns that might leak info
     */
    static detectSuspiciousPatterns(text) {
        const patterns = [];

        // Check for attempts to describe anonymization
        const anonymizationKeywords = [
            'anonymized', 'placeholder', 'redacted', 'masked',
            'EMAIL_1', 'PHONE_1', 'SSN_1', 'CLIENT_1'
        ];

        for (const keyword of anonymizationKeywords) {
            if (text.toLowerCase().includes(keyword.toLowerCase())) {
                patterns.push({
                    keyword,
                    context: this.getContext(text, keyword, 30),
                    reason: 'LLM discussing anonymization process'
                });
            }
        }

        return patterns;
    }

    /**
     * Mask sensitive content in text
     */
    static maskSensitiveContent(text, findings) {
        let masked = text;

        findings.forEach(finding => {
            if (finding.type === 'SENSITIVE_IN_OUTPUT') {
                finding.patterns.forEach(pattern => {
                    if (pattern.value) {
                        masked = masked.replace(
                            new RegExp(this.escapeRegex(pattern.value), 'gi'),
                            '[REDACTED]'
                        );
                    }
                });
            }

            if (finding.type === 'REVERSAL_ATTEMPT') {
                finding.attempts.forEach(attempt => {
                    masked = masked.replace(
                        new RegExp(this.escapeRegex(attempt.original), 'gi'),
                        attempt.placeholder
                    );
                    if (attempt.partial) {
                        masked = masked.replace(
                            new RegExp(this.escapeRegex(attempt.partial), 'gi'),
                            '[REDACTED]'
                        );
                    }
                });
            }
        });

        return masked;
    }

    /**
     * Get context around a match
     */
    static getContext(text, match, radius = 50) {
        const index = text.toLowerCase().indexOf(match.toLowerCase());
        if (index === -1) return '';

        const start = Math.max(0, index - radius);
        const end = Math.min(text.length, index + match.length + radius);

        return '...' + text.substring(start, end) + '...';
    }

    /**
     * Find partial matches (e.g., "john" from "john@example.com")
     */
    static findPartialMatch(text, original) {
        // Split by common delimiters
        const parts = original.split(/[@._\-\s]/);

        for (const part of parts) {
            if (part.length > 3 && text.toLowerCase().includes(part.toLowerCase())) {
                return part;
            }
        }

        return null;
    }

    /**
     * Escape special regex characters
     */
    static escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = OutputFilter;
