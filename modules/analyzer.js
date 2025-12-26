// Sensitive data detection module

// Regular expressions for PII detection
const PII_PATTERNS = {
  // Basic PII
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  PHONE: /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  SSN: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  CREDIT_CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{16}\b/g,
  ID_NUMBER: /\b\d{9}\b/g, // Generic 9-digit ID
  IBAN: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,
  ADDRESS: /\b\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Parkway|Pkwy|Place|Pl|Square|Sq|Trail|Trl|Circle|Cir)\b/gi,

  // Enhanced PII Patterns
  PASSPORT: /\b[A-Z]{1,2}\d{6,9}\b/g, // Generic passport format
  DRIVERS_LICENSE: /\b[A-Z]{1,2}\d{5,8}\b/g, // Generic driver's license
  MEDICAL_ID: /\b(MRN|Medical Record|Patient ID)[\s:#-]*\d{6,10}\b/gi,
  TAX_ID: /\b\d{2}-?\d{7}\b/g, // EIN format
  VAT_NUMBER: /\b(VAT|Tax ID)[\s:#-]*[A-Z]{2}\d{8,12}\b/gi,

  // API Keys and Secrets
  API_KEY_OPENAI: /\bsk-[A-Za-z0-9]{48}\b/g,
  API_KEY_AWS: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
  API_KEY_GENERIC: /\b(api[_-]?key|apikey|api[_-]?secret)[\s:=]+['"]?[A-Za-z0-9_\-]{20,}['"]?\b/gi,
  SECRET_KEY: /\b(secret[_-]?key|private[_-]?key|access[_-]?token)[\s:=]+['"]?[A-Za-z0-9_\-]{20,}['"]?\b/gi,

  // Sensitive Keywords
  KEYWORDS: /\b(client name|customer name|תיק מס|מספר תיק|salary list|client list|customer list|employee list|confidential|proprietary)\b/gi
};

// SQL Injection Patterns
const SQL_INJECTION_PATTERNS = [
  /(\bUNION\b.*\bSELECT\b)/gi,
  /(\bDROP\b.*\bTABLE\b)/gi,
  /(\bINSERT\b.*\bINTO\b.*\bVALUES\b)/gi,
  /(\bDELETE\b.*\bFROM\b)/gi,
  /(\bUPDATE\b.*\bSET\b)/gi,
  /(;.*\bDROP\b)/gi,
  /('.*OR.*'.*=.*')/gi,
  /(--|\#|\/\*.*\*\/)/g, // SQL comments
  /(\bEXEC\b|\bEXECUTE\b)/gi,
  /(\bxp_cmdshell\b)/gi
];

// XSS and Code Injection Patterns
const XSS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<iframe\b[^>]*>/gi,
  /javascript:/gi,
  /on(load|error|click|mouse\w+|focus|blur)\s*=/gi,
  /<img[^>]+src\s*=\s*["']?javascript:/gi,
  /<object\b[^>]*>/gi,
  /<embed\b[^>]*>/gi,
  /eval\s*\(/gi,
  /expression\s*\(/gi,
  /vbscript:/gi
];

// Enhanced Jailbreak Patterns
const JAILBREAK_PATTERNS = [
  // Direct instruction manipulation
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?)/gi,
  /forget\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,

  // Bypass attempts
  /bypass\s+(safety|security|filter|protection)/gi,
  /disable\s+(safety|security|filter|protection)/gi,
  /override\s+(safety|security|filter|protection)/gi,

  // Role manipulation
  /you\s+are\s+now\s+(a|an)\s+\w+/gi,
  /act\s+as\s+(if|though)\s+you\s+(are|were)/gi,
  /pretend\s+(you\s+are|to\s+be)/gi,

  // System prompt extraction
  /reveal\s+(your\s+)?(system\s+)?(prompt|instructions?)/gi,
  /show\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions?)/gi,
  /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)/gi,

  // Data exfiltration
  /print\s+all\s+(clients?|customers?|users?|data)/gi,
  /show\s+all\s+(clients?|customers?|users?|data)/gi,
  /list\s+all\s+(clients?|customers?|users?|data)/gi,
  /reveal\s+(all\s+)?(hidden|secret|private)\s+data/gi,
  /export\s+all\s+data/gi,

  // DAN (Do Anything Now) variants
  /\bDAN\s+mode\b/gi,
  /do\s+anything\s+now/gi,
  /developer\s+mode/gi,

  // Prompt injection markers
  /\[SYSTEM\]/gi,
  /\[ADMIN\]/gi,
  /\[ROOT\]/gi,
  /sudo\s+/gi
];

// Bulk data detection
function detectBulkData(text) {
  // Simple heuristic: count lines or rows
  const lines = text.split('\n');
  const rowCount = lines.length;

  // Count potential table rows (lines with multiple fields)
  const tableRows = lines.filter(line => {
    // Simple heuristic: lines with multiple fields separated by commas, tabs, or multiple spaces
    return (line.includes(',') && line.split(',').length > 3) ||
      (line.includes('\t') && line.split('\t').length > 3) ||
      (line.match(/\s{2,}/g) && line.split(/\s{2,}/).length > 3);
  }).length;

  // If we have more than 10 table-like rows, consider it bulk data
  if (tableRows > 10) {
    return { isBulk: true, rowCount: tableRows };
  }

  // Also check for explicit bulk indicators
  const bulkIndicators = ['list of', 'all clients', 'all customers', 'full list'];
  const hasBulkIndicators = bulkIndicators.some(indicator =>
    text.toLowerCase().includes(indicator)
  );

  // Also consider it bulk if we have more than 50 lines
  return {
    isBulk: hasBulkIndicators || rowCount > 50,
    rowCount: rowCount
  };
}

// Detect SQL injection attempts
function detectSQLInjection(text) {
  const findings = [];

  for (const pattern of SQL_INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      findings.push({
        type: 'SQL_INJECTION',
        offsetStart: 0,
        offsetEnd: text.length
      });
      break; // One finding is enough
    }
  }

  return findings;
}

// Detect XSS attempts
function detectXSS(text) {
  const findings = [];

  for (const pattern of XSS_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      findings.push({
        type: 'XSS_ATTEMPT',
        offsetStart: 0,
        offsetEnd: text.length
      });
      break; // One finding is enough
    }
  }

  return findings;
}

// Detect jailbreak attempts
function detectJailbreak(text) {
  const findings = [];

  for (const pattern of JAILBREAK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      findings.push({
        type: 'JAILBREAK_PATTERN',
        offsetStart: 0,
        offsetEnd: text.length
      });
      break; // One finding is enough
    }
  }

  return findings;
}

// Detect PII in text
function detectPII(text) {
  const findings = [];

  // Check for each PII pattern
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    // Reset the regex lastIndex to ensure proper matching
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      findings.push({
        type: type,
        offsetStart: match.index,
        offsetEnd: match.index + match[0].length,
        value: match[0]
      });
    }
  }

  return findings;
}

// Calculate anomaly score (0-100)
function calculateAnomalyScore(findings, text) {
  let score = 0;

  // Base score on number of findings
  score += Math.min(findings.length * 5, 30);

  // High-risk findings add more points
  const highRiskTypes = [
    'SQL_INJECTION', 'XSS_ATTEMPT', 'JAILBREAK_PATTERN',
    'API_KEY_OPENAI', 'API_KEY_AWS',
    'SSN', 'CREDIT_CARD', 'PASSPORT', 'DRIVERS_LICENSE', 'MEDICAL_ID', 'IBAN'
  ];
  const highRiskCount = findings.filter(f => highRiskTypes.includes(f.type)).length;
  score += highRiskCount * 25; // Increased weight

  // Multiple PII types increase score
  const uniqueTypes = new Set(findings.map(f => f.type));
  if (uniqueTypes.size > 3) {
    score += 15;
  }

  // Long text with many findings is suspicious
  if (text.length > 1000 && findings.length > 5) {
    score += 10;
  }

  return Math.min(score, 100);
}

// Analyze text for sensitive data
function analyzeText(text, context = {}) {
  // Detect PII
  const piiFindings = detectPII(text);

  // Detect bulk data
  const bulkData = detectBulkData(text);

  // Detect SQL injection
  const sqlFindings = detectSQLInjection(text);

  // Detect XSS
  const xssFindings = detectXSS(text);

  // Detect jailbreak
  const jailbreakFindings = detectJailbreak(text);

  // Combine findings
  let allFindings = [...piiFindings, ...sqlFindings, ...xssFindings, ...jailbreakFindings];

  if (bulkData.isBulk) {
    allFindings.push({
      type: 'BULK_DATA',
      offsetStart: 0,
      offsetEnd: text.length,
      details: { rowCount: bulkData.rowCount }
    });
  }

  // Calculate anomaly score
  const anomalyScore = calculateAnomalyScore(allFindings, text);

  // Determine risk level
  let riskLevel = 'LOW';

  // Check for high-risk patterns
  const hasHighRiskFindings = sqlFindings.length > 0 || xssFindings.length > 0 || jailbreakFindings.length > 0;
  const hasAPIKeys = allFindings.some(f => f.type.includes('API_KEY') || f.type.includes('SECRET'));

  // Set risk level based on findings and anomaly score
  if (hasHighRiskFindings || hasAPIKeys || anomalyScore >= 70) {
    riskLevel = 'HIGH';
  } else if (allFindings.length > 0 || bulkData.isBulk || anomalyScore >= 40) {
    riskLevel = 'MEDIUM';
  }

  return {
    riskLevel: riskLevel,
    findings: allFindings,
    anomalyScore: anomalyScore
  };
}

module.exports = { analyzeText, detectPII, detectBulkData, detectSQLInjection, detectXSS, detectJailbreak };