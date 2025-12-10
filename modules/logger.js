// Privacy-aware logging module

// In-memory storage for logs (in production, this would be a database)
const logs = [];

// Log an event with privacy considerations
async function logEvent(eventData) {
  // Extract and pseudonymize identifiers
  const firmId = eventData.firmId !== 'unknown' ? 
    `firm_${hashString(eventData.firmId)}` : 'unknown';
  
  const userId = eventData.userId !== 'unknown' ? 
    `user_${hashString(eventData.userId)}` : 'unknown';
  
  // Create log entry with privacy-conscious data
  const logEntry = {
    id: generateLogId(),
    timestamp: eventData.timestamp || new Date().toISOString(),
    firmId: firmId,
    userId: userId,
    actionType: eventData.actionType,
    riskLevel: eventData.riskLevel,
    decision: eventData.decision,
    reasonCodes: eventData.reasonCodes,
    findingsCount: eventData.findingsCount,
    changed: eventData.changed,
    // Note: No raw text or sensitive content is stored
  };
  
  // Store the log entry
  logs.push(logEntry);
  
  // In production, you would save to a database here
  // For now, we'll just keep it in memory
  console.log('Security Event Logged:', logEntry);
  
  // Implement data retention policy
  cleanupOldLogs();
  
  return logEntry;
}

// Get logs (with privacy considerations)
function getLogs(options = {}) {
  const { limit = 100, firmId, actionType } = options;
  
  let filteredLogs = [...logs];
  
  // Filter by firmId if provided
  if (firmId && firmId !== 'unknown') {
    const hashedFirmId = `firm_${hashString(firmId)}`;
    filteredLogs = filteredLogs.filter(log => log.firmId === hashedFirmId);
  }
  
  // Filter by action type if provided
  if (actionType) {
    filteredLogs = filteredLogs.filter(log => log.actionType === actionType);
  }
  
  // Sort by timestamp (newest first) and limit
  filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return filteredLogs.slice(0, limit);
}

// Get log statistics
function getLogStats(firmId) {
  let filteredLogs = logs;
  
  if (firmId && firmId !== 'unknown') {
    const hashedFirmId = `firm_${hashString(firmId)}`;
    filteredLogs = filteredLogs.filter(log => log.firmId === hashedFirmId);
  }
  
  // Calculate statistics
  const totalEvents = filteredLogs.length;
  const byActionType = {};
  const byRiskLevel = {};
  const byDecision = {};
  
  filteredLogs.forEach(log => {
    // Count by action type
    byActionType[log.actionType] = (byActionType[log.actionType] || 0) + 1;
    
    // Count by risk level
    if (log.riskLevel) {
      byRiskLevel[log.riskLevel] = (byRiskLevel[log.riskLevel] || 0) + 1;
    }
    
    // Count by decision
    if (log.decision) {
      byDecision[log.decision] = (byDecision[log.decision] || 0) + 1;
    }
  });
  
  return {
    totalEvents,
    byActionType,
    byRiskLevel,
    byDecision
  };
}

// Simple hash function for pseudonymization (not cryptographically secure)
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

// Generate a unique log ID
function generateLogId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Clean up old logs based on retention policy
function cleanupOldLogs() {
  // Default retention: 30 days
  const retentionDays = process.env.LOG_RETENTION_DAYS || 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  // Remove logs older than cutoff date
  const initialLength = logs.length;
  const cutoffIndex = logs.findIndex(log => new Date(log.timestamp) >= cutoffDate);
  
  if (cutoffIndex > 0) {
    logs.splice(0, cutoffIndex);
    console.log(`Cleaned up ${initialLength - logs.length} old log entries`);
  }
}

// Export functions
module.exports = {
  logEvent,
  getLogs,
  getLogStats
};