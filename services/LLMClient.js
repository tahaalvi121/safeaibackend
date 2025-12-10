// LLM Client - Unified abstraction with metrics and multi-provider support
const OpenAI = require('openai');

class LLMClient {
    constructor() {
        this.providers = {};

        // Initialize OpenAI if API key exists
        if (process.env.OPENAI_API_KEY) {
            this.providers.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }

        // Add more providers here
        // if (process.env.ANTHROPIC_API_KEY) {
        //   this.providers.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        // }

        this.defaultProvider = 'openai';
        this.metrics = [];
    }

    /**
     * Complete a prompt with LLM
     * @param {string} prompt - The prompt text
     * @param {object} options - Configuration options
     * @returns {object} - { text, usage, cost, provider, model, latencyMs }
     */
    async complete(prompt, options = {}) {
        const provider = options.provider || this.defaultProvider;
        const startTime = Date.now();

        if (!this.providers[provider]) {
            throw new Error(`Provider ${provider} not configured. Check API keys.`);
        }

        try {
            let response;

            if (provider === 'openai') {
                response = await this.providers.openai.chat.completions.create({
                    model: options.model || 'gpt-4',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: options.maxTokens || 1000,
                    temperature: options.temperature || 0.7
                });

                const result = {
                    text: response.choices[0].message.content,
                    usage: {
                        promptTokens: response.usage.prompt_tokens,
                        completionTokens: response.usage.completion_tokens,
                        totalTokens: response.usage.total_tokens
                    },
                    cost: this.calculateCost(provider, response.model, response.usage),
                    provider,
                    model: response.model,
                    latencyMs: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                };

                // Log metrics
                this.logMetrics(result);

                return result;
            }

            throw new Error(`Provider ${provider} not implemented yet`);

        } catch (error) {
            console.error('LLM request failed:', {
                provider,
                error: error.message,
                latencyMs: Date.now() - startTime
            });

            // Failover logic
            if (options.failover && provider !== 'openai' && this.providers.openai) {
                console.log('Attempting failover to OpenAI...');
                return this.complete(prompt, {
                    ...options,
                    provider: 'openai',
                    failover: false
                });
            }

            throw error;
        }
    }

    /**
     * Calculate cost based on provider and usage
     */
    calculateCost(provider, model, usage) {
        const pricing = {
            openai: {
                'gpt-4': {
                    prompt: 0.03 / 1000,
                    completion: 0.06 / 1000
                },
                'gpt-4-turbo-preview': {
                    prompt: 0.01 / 1000,
                    completion: 0.03 / 1000
                },
                'gpt-3.5-turbo': {
                    prompt: 0.0015 / 1000,
                    completion: 0.002 / 1000
                }
            }
        };

        // Default to gpt-4 pricing if model not found
        const rates = pricing[provider]?.[model] || pricing[provider]['gpt-4'];

        if (!rates) return 0;

        return (
            (usage.prompt_tokens * rates.prompt) +
            (usage.completion_tokens * rates.completion)
        );
    }

    /**
     * Log metrics for analytics
     */
    logMetrics(result) {
        console.log('LLM Request:', {
            provider: result.provider,
            model: result.model,
            tokens: result.usage.totalTokens,
            cost: `$${result.cost.toFixed(4)}`,
            latency: `${result.latencyMs}ms`
        });

        // Store in memory (in production, save to database)
        this.metrics.push(result);

        // Keep only last 1000 metrics
        if (this.metrics.length > 1000) {
            this.metrics.shift();
        }
    }

    /**
     * Get metrics summary
     */
    getMetrics(limit = 100) {
        return {
            recent: this.metrics.slice(-limit),
            summary: {
                totalRequests: this.metrics.length,
                totalTokens: this.metrics.reduce((sum, m) => sum + m.usage.totalTokens, 0),
                totalCost: this.metrics.reduce((sum, m) => sum + m.cost, 0),
                avgLatency: this.metrics.reduce((sum, m) => sum + m.latencyMs, 0) / this.metrics.length
            }
        };
    }
}

// Export singleton instance
module.exports = new LLMClient();
