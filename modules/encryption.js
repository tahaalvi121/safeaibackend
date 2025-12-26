// Encryption Module - AES-256-GCM encryption for data at rest
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

// Generate key from environment or use default (CHANGE IN PRODUCTION!)
const getKey = () => {
    if (process.env.ENCRYPTION_KEY) {
        return Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    }
    // Default key for development (32 bytes)
    console.warn('WARNING: Using default encryption key. Set ENCRYPTION_KEY in production!');
    return crypto.scryptSync('default-safeai-key', 'salt', 32);
};

const KEY = getKey();

class Encryption {
    /**
     * Encrypt text with AES-256-GCM
     * @param {string} text - Plain text to encrypt
     * @returns {object} - { encrypted, iv, authTag }
     */
    static encrypt(text) {
        if (!text) return null;

        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    /**
     * Decrypt encrypted data
     * @param {string} encrypted - Encrypted hex string
     * @param {string} iv - Initialization vector (hex)
     * @param {string} authTag - Authentication tag (hex)
     * @returns {string} - Decrypted plain text
     */
    static decrypt(encrypted, iv, authTag) {
        if (!encrypted || !iv || !authTag) return null;

        try {
            const decipher = crypto.createDecipheriv(
                ALGORITHM,
                KEY,
                Buffer.from(iv, 'hex')
            );

            decipher.setAuthTag(Buffer.from(authTag, 'hex'));

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('Decryption failed:', error.message);
            return null;
        }
    }

    /**
     * Encrypt JSON object
     */
    static encryptJSON(obj) {
        return this.encrypt(JSON.stringify(obj));
    }

    /**
     * Decrypt to JSON object
     */
    static decryptJSON(encrypted, iv, authTag) {
        const decrypted = this.decrypt(encrypted, iv, authTag);
        return decrypted ? JSON.parse(decrypted) : null;
    }
}

module.exports = Encryption;
