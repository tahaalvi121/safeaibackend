// Admin Tracking and Monitoring Module

// In-memory storage for user activity (in production, use database)
const userActivity = [];
const userSessions = new Map();
const usageStats = new Map();

// Track user activity
function trackUserActivity(event) {
    const activityRecord = {
        id: generateActivityId(),
        timestamp: event.timestamp || new Date().toISOString(),
        tenantId: event.tenantId,
        userId: event.userId,
        actionType: event.actionType,
        details: event.details || {},
        platform: event.platform || 'unknown',
        riskLevel: event.riskLevel,
        decision: event.decision
    };

    userActivity.push(activityRecord);

    // Update usage stats
    updateUsageStats(event.tenantId, event.userId, event.actionType);

    // Cleanup old activity (keep last 10000 records)
    if (userActivity.length > 10000) {
        userActivity.splice(0, userActivity.length - 10000);
    }

    return activityRecord;
}

// Update usage statistics
function updateUsageStats(tenantId, userId, actionType) {
    const key = `${tenantId}_${userId}`;

    if (!usageStats.has(key)) {
        usageStats.set(key, {
            tenantId,
            userId,
            totalRequests: 0,
            byActionType: {},
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        });
    }

    const stats = usageStats.get(key);
    stats.totalRequests++;
    stats.lastSeen = new Date().toISOString();

    if (!stats.byActionType[actionType]) {
        stats.byActionType[actionType] = 0;
    }
    stats.byActionType[actionType]++;
}

// Get user activity for a tenant
function getUserActivity(tenantId, options = {}) {
    const { limit = 100, userId, actionType, startDate, endDate } = options;

    let filtered = userActivity.filter(record => record.tenantId === tenantId);

    // Filter by userId if provided
    if (userId) {
        filtered = filtered.filter(record => record.userId === userId);
    }

    // Filter by action type if provided
    if (actionType) {
        filtered = filtered.filter(record => record.actionType === actionType);
    }

    // Filter by date range if provided
    if (startDate) {
        filtered = filtered.filter(record => new Date(record.timestamp) >= new Date(startDate));
    }
    if (endDate) {
        filtered = filtered.filter(record => new Date(record.timestamp) <= new Date(endDate));
    }

    // Sort by timestamp (newest first) and limit
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return filtered.slice(0, limit);
}

// Get list of users for a tenant
function getTenantUsers(tenantId) {
    const users = [];
    const userMap = new Map();

    // Collect unique users from activity
    userActivity
        .filter(record => record.tenantId === tenantId)
        .forEach(record => {
            if (!userMap.has(record.userId)) {
                const key = `${tenantId}_${record.userId}`;
                const stats = usageStats.get(key) || {
                    totalRequests: 0,
                    firstSeen: record.timestamp,
                    lastSeen: record.timestamp
                };

                userMap.set(record.userId, {
                    userId: record.userId,
                    firstSeen: stats.firstSeen,
                    lastSeen: stats.lastSeen,
                    totalRequests: stats.totalRequests
                });
            }
        });

    return Array.from(userMap.values());
}

// Get usage statistics for a tenant
function getTenantStats(tenantId) {
    const tenantActivity = userActivity.filter(record => record.tenantId === tenantId);

    const stats = {
        totalRequests: tenantActivity.length,
        uniqueUsers: new Set(tenantActivity.map(r => r.userId)).size,
        byActionType: {},
        byRiskLevel: {},
        byDecision: {},
        byPlatform: {},
        timeRange: {
            first: tenantActivity.length > 0 ? tenantActivity[tenantActivity.length - 1].timestamp : null,
            last: tenantActivity.length > 0 ? tenantActivity[0].timestamp : null
        }
    };

    // Aggregate by action type
    tenantActivity.forEach(record => {
        if (record.actionType) {
            stats.byActionType[record.actionType] = (stats.byActionType[record.actionType] || 0) + 1;
        }
        if (record.riskLevel) {
            stats.byRiskLevel[record.riskLevel] = (stats.byRiskLevel[record.riskLevel] || 0) + 1;
        }
        if (record.decision) {
            stats.byDecision[record.decision] = (stats.byDecision[record.decision] || 0) + 1;
        }
        if (record.platform) {
            stats.byPlatform[record.platform] = (stats.byPlatform[record.platform] || 0) + 1;
        }
    });

    return stats;
}

// Track user session
function trackSession(tenantId, userId, sessionData) {
    const sessionId = generateSessionId();

    userSessions.set(sessionId, {
        sessionId,
        tenantId,
        userId,
        startTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        platform: sessionData.platform || 'unknown',
        extensionVersion: sessionData.extensionVersion || 'unknown',
        active: true
    });

    return sessionId;
}

// Update session activity
function updateSession(sessionId) {
    const session = userSessions.get(sessionId);

    if (session) {
        session.lastActivity = new Date().toISOString();
    }
}

// End session
function endSession(sessionId) {
    const session = userSessions.get(sessionId);

    if (session) {
        session.active = false;
        session.endTime = new Date().toISOString();
    }
}

// Get active sessions for a tenant
function getActiveSessions(tenantId) {
    return Array.from(userSessions.values())
        .filter(session => session.tenantId === tenantId && session.active);
}

// Generate unique activity ID
function generateActivityId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Generate unique session ID
function generateSessionId() {
    return 'sess_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

module.exports = {
    trackUserActivity,
    getUserActivity,
    getTenantUsers,
    getTenantStats,
    trackSession,
    updateSession,
    endSession,
    getActiveSessions
};
