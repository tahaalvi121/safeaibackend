// Text anonymization and minimization module

// Anonymization rules
function anonymizeText(text, findings, policy = {}) {
  let sanitizedText = text;
  let changed = false;
  let removedTypes = new Set();
  let bulkDataHandled = false;

  // Sort findings by offsetStart in descending order to replace from end to start
  // This prevents offset issues when replacing text
  const sortedFindings = findings.sort((a, b) => b.offsetStart - a.offsetStart);

  // Apply anonymization for each finding
  for (const finding of sortedFindings) {
    const { type, offsetStart, offsetEnd, value } = finding;

    // Skip if this is a bulk data finding and we need special handling
    if (type === 'BULK_DATA') {
      // For v0.1, we'll block bulk data completely
      bulkDataHandled = true;
      continue;
    }

    // Skip security-related findings as they don't need anonymization
    if (type === 'EXFIL_ATTEMPT' || type === 'JAILBREAK_PATTERN' || type === 'SQL_INJECTION' || type === 'XSS_ATTEMPT') {
      continue;
    }

    let replacement = '';

    switch (type) {
      case 'EMAIL':
        replacement = '[EMAIL]';
        removedTypes.add('EMAIL');
        break;
      case 'PHONE':
        replacement = '[PHONE_NUMBER]';
        removedTypes.add('PHONE');
        break;
      case 'SSN':
        replacement = '[SSN]';
        removedTypes.add('SSN');
        break;
      case 'CREDIT_CARD':
        replacement = '[CREDIT_CARD]';
        removedTypes.add('CREDIT_CARD');
        break;
      case 'ID_NUMBER':
        replacement = '[ID_NUMBER]';
        removedTypes.add('ID_NUMBER');
        break;
      case 'IBAN':
        replacement = '[IBAN]';
        removedTypes.add('IBAN');
        break;
      case 'ADDRESS':
        replacement = '[ADDRESS]';
        removedTypes.add('ADDRESS');
        break;
      case 'PASSPORT':
        replacement = '[PASSPORT]';
        removedTypes.add('PASSPORT');
        break;
      case 'DRIVERS_LICENSE':
        replacement = '[DL]';
        removedTypes.add('DRIVERS_LICENSE');
        break;
      case 'MEDICAL_ID':
        replacement = '[MEDICAL_ID]';
        removedTypes.add('MEDICAL_ID');
        break;
      case 'TAX_ID':
        replacement = '[TAX_ID]';
        removedTypes.add('TAX_ID');
        break;
      case 'VAT_NUMBER':
        replacement = '[VAT]';
        removedTypes.add('VAT_NUMBER');
        break;
      case 'API_KEY_OPENAI':
      case 'API_KEY_AWS':
      case 'API_KEY_GENERIC':
      case 'SECRET_KEY':
        replacement = '[API_KEY]';
        removedTypes.add('API_KEY');
        break;
      default:
        // For other types, we'll mask the content
        replacement = `[${type}]`;
        removedTypes.add(type);
    }

    // Replace the sensitive data with anonymized version
    if (replacement && offsetStart !== undefined && offsetEnd !== undefined) {
      // Add a space after replacement if the original text had one
      const afterChar = sanitizedText.charAt(offsetEnd);
      const addSpace = afterChar && /\s/.test(afterChar) ? '' : ' ';

      sanitizedText = sanitizedText.substring(0, offsetStart) +
        replacement + addSpace +
        sanitizedText.substring(offsetEnd);
      changed = true;
    }
  }

  // Handle bulk data minimization
  const bulkDataFinding = findings.find(f => f.type === 'BULK_DATA');
  if (bulkDataFinding && bulkDataFinding.details && bulkDataFinding.details.rowCount > 10) {
    // For large tables, we block completely in v0.1
    // In a more advanced version, we could send schema + sample rows
    bulkDataHandled = true;
  }

  return {
    sanitizedText: sanitizedText,
    changed: changed,
    summary: {
      removed: Array.from(removedTypes),
      bulkDataHandled: bulkDataHandled
    }
  };
}

// Minimize bulk data (v0.1 implementation - block large tables)
function minimizeBulkData(text, rowCount) {
  // For v0.1, we simply block bulk data
  // In future versions, we could implement schema extraction and sample rows
  if (rowCount > 10) {
    return {
      minimizedText: "[BULK DATA BLOCKED - Use Document Wizard for safe processing]",
      changed: true,
      method: "BLOCK"
    };
  }
  return {
    minimizedText: text,
    changed: false,
    method: "NONE"
  };
}

module.exports = { anonymizeText, minimizeBulkData };