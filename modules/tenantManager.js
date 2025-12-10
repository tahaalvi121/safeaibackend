// Tenant Management Module for SaaS Multi-Tenancy

// In-memory storage for tenants (in production, use database)
const tenants = new Map();
const path = require('path');
const fs = require('fs');

// Load tier configurations
const tiersPath = path.join(__dirname, '../config/tiers.json');
let tierConfigs = {};

try {
    tierConfigs = JSON.parse(fs.readFileSync(tiersPath, 'utf8'));
} catch (error) {
    console.error('Error loading tiers.json:', error);
    // Fallback tier configs
    tierConfigs = {
        free: { maxUsers: 5, maxRequests: 1000 },
        pro: { maxUsers: 50, maxRequests: 50000 },
        enterprise: { maxUsers: -1, maxRequests: -1 }
    };
}

// Register a new tenant
function registerTenant(tenantData) {
    const tenantId = generateTenantId();

    const tenant = {
        tenantId,
        name: tenantData.name,
        email: tenantData.email,
        tier: tenantData.tier || 'free',
        createdAt: new Date().toISOString(),
        active: true,
        settings: tenantData.settings || {},
        usage: {
            requestsThisMonth: 0,
            usersCount: 0,
            lastReset: new Date().toISOString()
        }
    };

    tenants.set(tenantId, tenant);

    return tenant;
}

// Get tenant by ID
function getTenant(tenantId) {
    return tenants.get(tenantId);
}

// Update tenant
function updateTenant(tenantId, updates) {
    const tenant = tenants.get(tenantId);

    if (!tenant) {
        return null;
    }

    // Update allowed fields
    if (updates.name) tenant.name = updates.name;
    if (updates.email) tenant.email = updates.email;
    if (updates.tier) tenant.tier = updates.tier;
    if (updates.settings) tenant.settings = { ...tenant.settings, ...updates.settings };
    if (updates.active !== undefined) tenant.active = updates.active;

    tenant.updatedAt = new Date().toISOString();

    return tenant;
}

// Check if tenant can make request (based on tier limits)
function canMakeRequest(tenantId) {
    const tenant = tenants.get(tenantId);

    if (!tenant || !tenant.active) {
        return { allowed: false, reason: 'Tenant not found or inactive' };
    }

    const tierConfig = tierConfigs[tenant.tier];

    if (!tierConfig) {
        return { allowed: false, reason: 'Invalid tier configuration' };
    }

    // Check request limit
    if (tierConfig.maxRequests !== -1 && tenant.usage.requestsThisMonth >= tierConfig.maxRequests) {
        return { allowed: false, reason: 'Monthly request limit exceeded' };
    }

    // Check user limit
    if (tierConfig.maxUsers !== -1 && tenant.usage.usersCount > tierConfig.maxUsers) {
        return { allowed: false, reason: 'User limit exceeded' };
    }

    return { allowed: true };
}

// Increment usage for tenant
function incrementUsage(tenantId) {
    const tenant = tenants.get(tenantId);

    if (!tenant) {
        return false;
    }

    // Reset usage if new month
    const lastReset = new Date(tenant.usage.lastReset);
    const now = new Date();

    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        tenant.usage.requestsThisMonth = 0;
        tenant.usage.lastReset = now.toISOString();
    }

    tenant.usage.requestsThisMonth++;

    return true;
}

// Update user count for tenant
function updateUserCount(tenantId, count) {
    const tenant = tenants.get(tenantId);

    if (!tenant) {
        return false;
    }

    tenant.usage.usersCount = count;

    return true;
}

// Get tier configuration
function getTierConfig(tier) {
    return tierConfigs[tier];
}

// Get all tiers
function getAllTiers() {
    return tierConfigs;
}

// Generate unique tenant ID
function generateTenantId() {
    return 'tenant_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

module.exports = {
    registerTenant,
    getTenant,
    updateTenant,
    canMakeRequest,
    incrementUsage,
    updateUserCount,
    getTierConfig,
    getAllTiers
};
