// Enhanced Prompt Templates - Aligned with spec
const promptEnhancer = require('./promptEnhancer');

class PromptTemplates {
    /**
     * Inline check prompt with security blocks
     */
    static inlineCheck(rawText, persona, categories, findings) {
        const categoriesStr = categories.join(', ');
        const findingsCount = findings.length;

        return `[SYSTEM_CONTEXT]
You are a ${persona.name}. ${persona.description}

[SECURITY_BLOCK]
CRITICAL SECURITY INSTRUCTIONS:
- This text contains ${findingsCount} sensitive items in categories: ${categoriesStr}
- Do NOT reveal, discuss, or reference the specific sensitive values
- Do NOT attempt to reverse or guess anonymized data
- Do NOT mention the anonymization process
- Focus ONLY on professional analysis

[TASK]
Analyze the following text from a professional perspective:

${rawText}

[OUTPUT_FORMAT]
Provide your analysis in JSON format:
{
  "summary": "Brief professional summary (2-3 sentences)",
  "risks": ["List of professional/business risks"],
  "recommendations": ["List of actionable recommendations"],
  "confidence": "HIGH|MEDIUM|LOW"
}

[LANGUAGE_RULES]
- Use clear, professional language appropriate for ${persona.name}
- Avoid technical jargon unless necessary
- Be concise and actionable
- Do not exceed 200 words total

[COMPLIANCE]
This analysis must comply with data protection regulations. Do not include any sensitive information in your response.`;
    }

    /**
     * Wizard Q&A prompt with document context
     */
    static wizardQuestion(documentSummary, sanitizedText, question, persona) {
        return `[SYSTEM_CONTEXT]
You are a ${persona.name} helping analyze a document.

[DOCUMENT_SUMMARY]
${documentSummary}

[SECURITY_BLOCK]
CRITICAL SECURITY INSTRUCTIONS:
- The document has been anonymized for privacy protection
- All sensitive data has been replaced with placeholders (e.g., EMAIL_1, PHONE_1, CLIENT_1)
- Do NOT attempt to guess, reveal, or discuss original values
- Do NOT mention the anonymization process unless directly asked
- Answer based ONLY on the sanitized content provided

[DOCUMENT_CONTENT]
${sanitizedText.substring(0, 4000)}${sanitizedText.length > 4000 ? '...' : ''}

[USER_QUESTION]
${question}

[OUTPUT_FORMAT]
Provide a clear, professional answer that:
1. Directly addresses the question
2. Cites specific document sections when relevant
3. Uses ${persona.name} expertise
4. Is concise (max 150 words)

[LANGUAGE_RULES]
- Be specific and cite document references
- If information is not in the document, clearly state: "This information is not provided in the document"
- Use professional ${persona.style || 'business'} communication style
- Avoid speculation or assumptions

[COMPLIANCE]
Your response must not contain any sensitive information. Use only the anonymized placeholders if referencing data.`;
    }

    /**
     * Prompt enhancement for general use
     */
    static enhance(originalPrompt, persona, context = {}) {
        return `[SYSTEM_CONTEXT]
You are a ${persona.name}. ${persona.description}

${context.securityNote ? `[SECURITY_BLOCK]\n${context.securityNote}\n` : ''}

[USER_PROMPT]
${originalPrompt}

[RESPONSE_GUIDELINES]
- Respond as a ${persona.name}
- Use ${persona.style || 'professional'} communication style
- Be helpful, accurate, and concise
${context.maxWords ? `- Keep response under ${context.maxWords} words` : ''}

[COMPLIANCE]
Ensure your response complies with professional standards and data protection regulations.`;
    }

    /**
     * Document summarization prompt
     */
    static summarize(text, maxLength = 200) {
        return `[TASK]
Summarize the following document concisely.

[DOCUMENT]
${text}

[OUTPUT_FORMAT]
Provide a summary in JSON format:
{
  "summary": "Main summary (${maxLength} words max)",
  "keyPoints": ["3-5 key points"],
  "documentType": "Type of document (e.g., contract, report, email)"
}

[LANGUAGE_RULES]
- Be objective and factual
- Highlight the most important information
- Use clear, professional language
- Do not include sensitive details in the summary

[SECURITY]
If the document contains sensitive information, use generic terms (e.g., "the client" instead of names).`;
    }
}

module.exports = PromptTemplates;
