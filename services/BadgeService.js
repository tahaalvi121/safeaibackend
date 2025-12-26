// Badge Service - Generate SVG/PNG badges with verification
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class BadgeService {
  constructor() {
    this.badgesDir = path.join(__dirname, '../public/badges');
    this.ensureBadgesDir();
  }

  async ensureBadgesDir() {
    try {
      await fs.mkdir(this.badgesDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create badges directory:', error);
    }
  }

  /**
   * Generate a compliance badge
   */
  async generateBadge(type, tenantName, options = {}) {
    const badgeId = uuidv4();
    const svg = this.getSVGTemplate(type, tenantName, options);

    // Convert SVG to PNG
    const pngBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    const filename = `badge_${badgeId}.png`;
    const filepath = path.join(this.badgesDir, filename);

    // Save PNG file
    await fs.writeFile(filepath, pngBuffer);

    // Also save SVG
    const svgFilename = `badge_${badgeId}.svg`;
    const svgFilepath = path.join(this.badgesDir, svgFilename);
    await fs.writeFile(svgFilepath, svg);

    return {
      badgeId,
      type,
      pngUrl: `/badges/${filename}`,
      svgUrl: `/badges/${svgFilename}`,
      embedCode: this.getEmbedCode(badgeId, type, options.tenantId),
      verificationUrl: options.tenantId
        ? `${process.env.APP_URL || 'http://localhost:3000'}/verify/tenant/${options.tenantId}`
        : `${process.env.APP_URL || 'http://localhost:3000'}/verify/${badgeId}`
    };
  }

  /**
   * Get SVG template for badge type
   */
  getSVGTemplate(type, tenantName, options = {}) {
    const templates = {
      GDPR: {
        color: '#4CAF50',
        title: 'GDPR',
        subtitle: 'Compliant'
      },
      HIPAA: {
        color: '#2196F3',
        title: 'HIPAA',
        subtitle: 'Compliant'
      },
      SOC2: {
        color: '#9C27B0',
        title: 'SOC 2',
        subtitle: 'Type II'
      },
      ISO27001: {
        color: '#FF9800',
        title: 'ISO 27001',
        subtitle: 'Certified'
      },
      RESPONSIBLE_AI: {
        color: '#D4AF37', // Gold
        title: 'SafeAI',
        subtitle: 'Responsible AI Firm'
      }
    };

    const config = templates[type] || templates.GDPR;
    const width = options.width || 200;
    const height = options.height || 100;

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad${type}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${config.color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${this.darkenColor(config.color, 20)};stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#grad${type})" rx="8"/>
  
  <!-- Shield icon -->
  <path d="M ${width / 2} 20 L ${width / 2 - 15} 25 L ${width / 2 - 15} 35 Q ${width / 2 - 15} 45 ${width / 2} 50 Q ${width / 2 + 15} 45 ${width / 2 + 15} 35 L ${width / 2 + 15} 25 Z" 
        fill="white" opacity="0.3"/>
  
  <!-- Title -->
  <text x="${width / 2}" y="65" 
        text-anchor="middle" 
        fill="white" 
        font-size="22" 
        font-weight="bold" 
        font-family="Arial, sans-serif">
    ${config.title}
  </text>
  
  <!-- Subtitle -->
  <text x="${width / 2}" y="82" 
        text-anchor="middle" 
        fill="white" 
        font-size="12" 
        font-family="Arial, sans-serif">
    ${config.subtitle}
  </text>
  
  <!-- Tenant name (small) -->
  <text x="${width / 2}" y="95" 
        text-anchor="middle" 
        fill="white" 
        font-size="8" 
        opacity="0.8"
        font-family="Arial, sans-serif">
    ${tenantName.substring(0, 30)}
  </text>
</svg>`;
  }

  /**
   * Generate embed HTML code
   */
  getEmbedCode(badgeId, type, tenantId = null) {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const verifyUrl = tenantId ? `${baseUrl}/verify/tenant/${tenantId}` : `${baseUrl}/verify/${badgeId}`;

    return `<!-- SafeAI ${type} Badge -->
<a href="${verifyUrl}" target="_blank" rel="noopener">
  <img src="${baseUrl}/badges/badge_${badgeId}.png" 
       alt="SafeAI Responsible AI Firm - Verified SafeAI" 
       width="200" 
       height="100" />
</a>`;
  }

  /**
   * Darken a hex color
   */
  darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;

    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
  }
}

module.exports = new BadgeService();
