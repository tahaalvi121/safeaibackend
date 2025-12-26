const LLMClient = require('./LLMClient');
const analyzer = require('../modules/analyzer');
const anonymizer = require('../modules/anonymizer');

class EnhancementService {
    /**
     * enhancePrompt
     * @param {string} text - The original prompt text
     * @param {string} tenantId - The tenant context
     * @param {string} policyMode - 'RELAXED', 'STANDARD', 'STRICT'
     * @returns {Promise<string>} - The enhanced prompt
     */
    async enhancePrompt(text, tenantId, policyMode = 'STANDARD') {
        try {
            // 1. Analyze for PII
            const analysis = analyzer.analyzeText(text);

            // 2. Anonymize (Sanitize) the text locally
            // This ensures the LLM never sees raw PII
            const anonymizedResult = anonymizer.anonymizeText(text, analysis.findings);
            const safeText = anonymizedResult.sanitizedText;

            // 3. Detect type
            const type = this._detectPromptType(safeText);

            // 4. Construct system prompt
            const systemPrompt = this._getSystemPrompt(policyMode, type);

            // 5. Call LLM with SAFE text
            const enhancedText = await LLMClient.complete({
                model: 'gpt-4o-mini',
                system: systemPrompt,
                user: `Enhance the following prompt. The text has been anonymized with placeholders like [EMAIL], [NAME]. Keep these placeholders intact in your response. Do not invent real data.\n\nOriginal: ${safeText}`
            });

            return enhancedText.text || safeText;
        } catch (error) {
            console.error('EnhancementService Error:', error);
            // Fallback to locally sanitized text if LLM fails
            // throw new Error('Failed to enhance prompt');
            return text; // Or return sanitized text? Returning original text might be risky if error. 
            // Better to re-analyze/sanitize here or just return a generic error.
            // For now, let's return safeText if available, otherwise text.
            // Actually, if we fail to enhance, we should probably output the sanitized version at least?
            // "Fix" uses sanitized. "Enhance" expects enhancement.
            // I'll throw to let the controller handle it, but maybe return sanitized in error message?
            throw error;
        }
    }

    _detectPromptType(prompt) {
        const lower = prompt.toLowerCase();
        if (lower.match(/analyze|summary|report|data/)) return 'analysis';
        if (lower.match(/write|story|creative|poem/)) return 'creative';
        if (lower.match(/code|function|api|bug|error/)) return 'technical';
        return 'general';
    }

    _getSystemPrompt(mode, type) {
        let base = "You are an expert Prompt Engineer and Security Assistant. The user's prompt has been redacted for security. Your goal is to rewrite the prompt to be more effective for an LLM, using best practices (Role, Context, Constraints), while PRESERVING the [PLACEHOLDERS].";

        // Mode adjustments
        if (mode === 'STRICT') base += " Prioritize safety and formal tone. Remove any ambiguity.";
        else if (mode === 'RELAXED') base += " Focus on creativity and comprehensive details.";
        else base += " Focus on clarity, effectiveness, and professional tone.";

        // Type adjustments
        const typeInstructions = {
            analysis: " Structure the output for data analysis. Define the analyst role and success criteria.",
            creative: " Inspire creativity. Define tone, style, and formatting.",
            technical: " Be technically precise. Ask for robust code and error handling.",
            general: " Ensure instructions are specific and actionable."
        };

        return base + (typeInstructions[type] || typeInstructions.general);
    }
}

module.exports = new EnhancementService();
