// API Key and Secret Management Module

const crypto = require('crypto');

// In-memory storage for API keys (in production, use encrypted database)
const apiKeys = new Map();
const tenantKeys = new Map();

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);

// Encrypt sensitive data
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        authTag: authTag.toString('hex')
    };
}

// Decrypt sensitive data
function decrypt(encryptedObj) {
    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        ENCRYPTION_KEY,
        Buffer.from(encryptedObj.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

    let decrypted = decipher.update(encryptedObj.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

// Store API key for a tenant
function storeAPIKey(tenantId, keyName, keyValue) {
    const encrypted = encrypt(keyValue);

    const keyId = `${tenantId}_${keyName}_${Date.now()}`;

    apiKeys.set(keyId, {
        tenantId,
        keyName,
        encrypted,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        usageCount: 0
    });

    // Track keys by tenant
    if (!tenantKeys.has(tenantId)) {
        tenantKeys.set(tenantId, []);
    }
    tenantKeys.get(tenantId).push(keyId);

    return keyId;
}

// Retrieve API key
function getAPIKey(keyId) {
    const keyData = apiKeys.get(keyId);

    if (!keyData) {
        return null;
    }

    // Update usage stats
    keyData.lastUsed = new Date().toISOString();
    keyData.usageCount++;

    // Decrypt and return
    return {
        keyName: keyData.keyName,
        keyValue: decrypt(keyData.encrypted),
        tenantId: keyData.tenantId
    };
}

// Get all keys for a tenant (without decrypting)
function getTenantKeys(tenantId) {
    const keyIds = tenantKeys.get(tenantId) || [];

    return keyIds.map(keyId => {
        const keyData = apiKeys.get(keyId);
        return {
            keyId,
            keyName: keyData.keyName,
            createdAt: keyData.createdAt,
            lastUsed: keyData.lastUsed,
            usageCount: keyData.usageCount
        };
    });
}

// Rotate API key
function rotateAPIKey(keyId, newKeyValue) {
    const keyData = apiKeys.get(keyId);

    if (!keyData) {
        return null;
    }

    // Create new encrypted version
    const encrypted = encrypt(newKeyValue);

    // Update key data
    keyData.encrypted = encrypted;
    keyData.rotatedAt = new Date().toISOString();

    return keyId;
}

// Delete API key
function deleteAPIKey(keyId) {
    const keyData = apiKeys.get(keyId);

    if (!keyData) {
        return false;
    }

    // Remove from tenant keys
    const tenantKeyList = tenantKeys.get(keyData.tenantId);
    if (tenantKeyList) {
        const index = tenantKeyList.indexOf(keyId);
        if (index > -1) {
            tenantKeyList.splice(index, 1);
        }
    }

    // Delete key
    apiKeys.delete(keyId);

    return true;
}

module.exports = {
    storeAPIKey,
    getAPIKey,
    getTenantKeys,
    rotateAPIKey,
    deleteAPIKey
};
