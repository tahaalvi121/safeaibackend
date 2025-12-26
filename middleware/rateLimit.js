// Rate Limiting Middleware
const rateLimit = require('express-rate-limit');

const createRateLimiter = (maxRequests, windowMs, message) => {
    return rateLimit({
        windowMs,
        max: maxRequests,
        keyGenerator: (req) => req.user?.tenantId || req.ip,
        handler: (req, res) => {
            res.status(429).json({
                error: 'Too many requests',
                message,
                retryAfter: Math.ceil(windowMs / 1000)
            });
        },
        standardHeaders: true,
        legacyHeaders: false
    });
};

module.exports = {
    // 100 requests per minute for inline checks
    inlineCheckLimit: createRateLimiter(
        100,
        60000,
        'Too many inline checks. Please wait a minute before trying again.'
    ),

    // 10 uploads per minute
    wizardUploadLimit: createRateLimiter(
        10,
        60000,
        'Too many document uploads. Please wait a minute before uploading again.'
    ),

    // 50 questions per minute
    wizardQuestionLimit: createRateLimiter(
        50,
        60000,
        'Too many questions. Please wait a minute before asking again.'
    ),

    // 20 requests per minute for general API
    generalApiLimit: createRateLimiter(
        20,
        60000,
        'Too many API requests. Please slow down.'
    )
};
