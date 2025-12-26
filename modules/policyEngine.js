// Policy engine for security decisions

// Make a security decision based on analysis and context
function makeDecision(analysis, context = {}) {
  const { riskLevel, findings } = analysis;
  const { userRole = 'employee' } = context;
  
  // Extract finding types
  const findingTypes = findings.map(f => f.type);
  
  // Check for specific patterns
  const hasPII = findingTypes.some(type => 
    ['EMAIL', 'PHONE', 'SSN', 'ID_NUMBER', 'CREDIT_CARD', 'IBAN', 'ADDRESS'].includes(type)
  );
  
  const hasBulkData = findingTypes.includes('BULK_DATA');
  const hasExfilAttempt = findingTypes.includes('EXFIL_ATTEMPT');
  const hasJailbreakPattern = findingTypes.includes('JAILBREAK_PATTERN');
  
  // Initialize decision variables
  let decision = 'ALLOW';
  let reasonCodes = [];
  let sanitizedText = null;
  let userMessage = '';
  
  // Apply policy rules
  if (riskLevel === 'HIGH' || hasExfilAttempt || hasJailbreakPattern) {
    // High risk content - block by default
    decision = 'BLOCK';
    reasonCodes.push(hasExfilAttempt ? 'EXFIL_ATTEMPT' : 
                    hasJailbreakPattern ? 'JAILBREAK_PATTERN' : 'HIGH_RISK');
    userMessage = hasExfilAttempt ? 
      'This prompt appears to be attempting data extraction and has been blocked.' :
      hasJailbreakPattern ?
      'This prompt contains instructions that attempt to bypass safety measures and has been blocked.' :
      'This content has been blocked due to high security risk.';
  } else if (hasBulkData) {
    // Bulk data handling
    const bulkFinding = findings.find(f => f.type === 'BULK_DATA');
    if (bulkFinding && bulkFinding.details && bulkFinding.details.rowCount > 10) {
      decision = 'BLOCK';
      reasonCodes.push('BULK_DATA');
      userMessage = 'Large data sets have been blocked for security. Please use the Document Wizard for safe processing.';
    } else {
      // Small bulk data - treat as regular PII
      if (hasPII) {
        if (userRole === 'employee') {
          decision = 'WARN_AND_SANITIZE';
        } else {
          decision = 'WARN_AND_ALLOW';
        }
        reasonCodes.push('PII_DETECTED');
        userMessage = 'Sensitive information detected. Content will be sanitized before sending.';
      }
    }
  } else if (hasPII) {
    // Regular PII handling
    if (userRole === 'employee') {
      decision = 'WARN_AND_SANITIZE';
    } else {
      decision = 'WARN_AND_ALLOW';
    }
    reasonCodes.push('PII_DETECTED');
    userMessage = 'Sensitive information detected. Content will be sanitized before sending.';
  } else if (riskLevel === 'LOW') {
    // Low risk content - allow
    decision = 'ALLOW';
    userMessage = 'Content approved for sending.';
  } else {
    // Medium risk - default handling
    decision = 'WARN_AND_ALLOW';
    reasonCodes.push('MEDIUM_RISK');
    userMessage = 'Content has medium risk factors. Please review before sending.';
  }
  
  return {
    decision,
    reasonCodes,
    sanitizedText,
    userMessage
  };
}

// Get default policy settings
function getDefaultPolicy() {
  return {
    // Default behavior for different scenarios
    piiHandling: {
      employee: 'WARN_AND_SANITIZE',
      manager: 'WARN_AND_ALLOW'
    },
    bulkDataThreshold: 10,
    bulkDataHandling: 'BLOCK',
    exfilHandling: 'BLOCK',
    jailbreakHandling: 'BLOCK'
  };
}

module.exports = { makeDecision, getDefaultPolicy };