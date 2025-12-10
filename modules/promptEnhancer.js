// Prompt Enhancer Module - AI-powered prompt improvement
const OpenAI = require('openai');

class PromptEnhancer {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || ''
        });
        this.enabled = !!process.env.OPENAI_API_KEY;
    }

    // Prompt engineering templates
    getTemplate(promptType = 'general') {
        const templates = {
            general: `You are an expert prompt engineer. Enhance the following user prompt to get better AI responses.

Apply these best practices:
1. Add clear role definition if appropriate
2. Provide necessary context
3. Make instructions specific and actionable
4. Specify desired output format
5. Add relevant constraints or guidelines

Original prompt: {prompt}

Enhanced prompt (return ONLY the enhanced prompt, no explanations):`,

            analysis: `Enhance this prompt for document/data analysis:

Original: {prompt}

Create an enhanced version that:
- Defines the analyst role
- Specifies what aspects to analyze
- Requests structured output
- Sets clear success criteria

Enhanced prompt:`,

            creative: `Enhance this creative writing prompt:

Original: {prompt}

Create an enhanced version that:
- Sets the creative context
- Defines tone and style
- Specifies format and length
- Provides inspiration or constraints

Enhanced prompt:`,

            technical: `Enhance this technical prompt:

Original: {prompt}

Create an enhanced version that:
- Defines technical expertise level
- Specifies technologies/frameworks
- Requests code examples if relevant
- Sets quality standards

Enhanced prompt:`
        };

        return templates[promptType] || templates.general;
    }

    // Detect prompt type
    detectPromptType(prompt) {
        const lower = prompt.toLowerCase();

        if (lower.includes('analyze') || lower.includes('summary') || lower.includes('report')) {
            return 'analysis';
        }
        if (lower.includes('write') || lower.includes('story') || lower.includes('creative')) {
            return 'creative';
        }
        if (lower.includes('code') || lower.includes('function') || lower.includes('implement')) {
            return 'technical';
        }

        return 'general';
    }

    // Enhance prompt using OpenAI
    async enhance(userPrompt, options = {}) {
        if (!this.enabled) {
            return {
                success: false,
                error: 'OpenAI API key not configured',
                originalPrompt: userPrompt,
                enhancedPrompt: null
            };
        }

        try {
            const promptType = options.type || this.detectPromptType(userPrompt);
            const template = this.getTemplate(promptType);
            const systemPrompt = template.replace('{prompt}', userPrompt);

            const response = await this.openai.chat.completions.create({
                model: options.model || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert prompt engineer who helps users write better prompts for AI assistants.'
                    },
                    {
                        role: 'user',
                        content: systemPrompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            });

            const enhancedPrompt = response.choices[0].message.content.trim();

            return {
                success: true,
                originalPrompt: userPrompt,
                enhancedPrompt: enhancedPrompt,
                promptType: promptType,
                tokensUsed: response.usage.total_tokens,
                cost: this.calculateCost(response.usage.total_tokens, options.model || 'gpt-3.5-turbo')
            };
        } catch (error) {
            console.error('Prompt enhancement error:', error);
            return {
                success: false,
                error: error.message,
                originalPrompt: userPrompt,
                enhancedPrompt: null
            };
        }
    }

    // Calculate API cost
    calculateCost(tokens, model) {
        const pricing = {
            'gpt-3.5-turbo': 0.002 / 1000, // $0.002 per 1K tokens
            'gpt-4': 0.03 / 1000 // $0.03 per 1K tokens
        };

        const rate = pricing[model] || pricing['gpt-3.5-turbo'];
        return tokens * rate;
    }

    // Analyze prompt quality
    analyzePrompt(prompt) {
        const analysis = {
            length: prompt.length,
            wordCount: prompt.split(/\s+/).length,
            hasContext: false,
            hasRole: false,
            hasFormat: false,
            hasConstraints: false,
            score: 0
        };

        // Check for context indicators
        if (prompt.match(/context|background|about|regarding/i)) {
            analysis.hasContext = true;
            analysis.score += 25;
        }

        // Check for role definition
        if (prompt.match(/you are|act as|as a|expert|specialist/i)) {
            analysis.hasRole = true;
            analysis.score += 25;
        }

        // Check for format specification
        if (prompt.match(/format|structure|list|bullet|table|json/i)) {
            analysis.hasFormat = true;
            analysis.score += 25;
        }

        // Check for constraints
        if (prompt.match(/must|should|don't|avoid|limit|maximum|minimum/i)) {
            analysis.hasConstraints = true;
            analysis.score += 25;
        }

        // Adjust score based on length
        if (analysis.wordCount < 5) {
            analysis.score = Math.min(analysis.score, 20);
        } else if (analysis.wordCount > 50) {
            analysis.score = Math.min(analysis.score + 10, 100);
        }

        return analysis;
    }
}

module.exports = new PromptEnhancer();
