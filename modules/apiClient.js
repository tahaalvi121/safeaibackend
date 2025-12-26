// API client for communicating with the security backend

// Base URL for the security backend
const BASE_URL = process.env.SECURITY_BACKEND_URL || 'https://safeaibackend-production.up.railway.app';

// Analyze text using the security backend
async function analyzeText(text, context = {}) {
  try {
    const response = await fetch(`${BASE_URL}/security/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, context }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error analyzing text:', error);
    throw error;
  }
}

// Anonymize text using the security backend
async function anonymizeText(text, findings, context = {}) {
  try {
    const response = await fetch(`${BASE_URL}/security/anonymize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, findings, context }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error anonymizing text:', error);
    throw error;
  }
}

// Get security decision from the backend
async function getDecision(analysis, context = {}) {
  try {
    const response = await fetch(`${BASE_URL}/security/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ analysis, context }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting decision:', error);
    throw error;
  }
}

// Check backend health
async function checkHealth() {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    return response.ok;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

module.exports = {
  analyzeText,
  anonymizeText,
  getDecision,
  checkHealth,
  BASE_URL
};