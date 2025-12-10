# SafeAI Security Backend

Security backend service for the SafeAI Assistant browser extension.

## Overview

This backend service provides the core security layer for the SafeAI Assistant:

- Sensitive data detection (PII, client info, bulk tables)
- Text anonymization and minimization
- Policy-based decision engine
- Document processing workflows
- Persona-based prompt enhancement
- Usage analytics and reporting

## Features

- Multi-language support (English, Hebrew)
- Role-based access control
- Tenant isolation
- GDPR-compliant data handling
- Real-time security decisions
- Document wizard workflows
- Evidence generation and verification

## Installation

1. Clone the repository
2. Navigate to the backend directory:
   ```bash
   cd backend
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```

## Environment Variables

Create a `.env` file with the following variables:
```env
PORT=3000
LOG_RETENTION_DAYS=30
BULK_DATA_THRESHOLD=10
ALLOWED_ORIGINS=http://localhost:3000,https://chat.openai.com,https://claude.ai,https://gemini.google.com
```

For production deployments, you'll also need:
```env
DATABASE_URL=postgresql://user:password@host:port/database
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
GOOGLE_API_KEY=...
```

## Development

- Run in development mode: `npm run dev`
- Run tests: `npm test`
- Run tests with coverage: `npm test -- --coverage`

## Deployment

### Vercel Deployment

The backend can be deployed to Vercel using the Vercel CLI:
```bash
vercel --prod
```

### Render Deployment

The backend can also be deployed to Render:

1. Fork the repository to your GitHub account
2. Sign up at [render.com](https://render.com)
3. Click "New+" and select "Web Service"
4. Connect your GitHub repository
5. Configure the service:
   - Name: safeai-backend
   - Environment: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free
6. Add environment variables in the Render dashboard:
   - PORT: 10000
   - DATABASE_URL: (your PostgreSQL database URL)
   - ALLOWED_ORIGINS: (comma-separated list of allowed origins including your frontend URL)
7. Click "Create Web Service"

Render will automatically deploy your application and provide a public URL.

### Railway Deployment

The backend can also be deployed to Railway:

1. Install the Railway CLI: `npm install -g @railway/cli`
2. Login to Railway: `railway login`
3. Initialize a new project: `railway init`
4. Deploy the service: `railway up`
5. Add environment variables:
   ```bash
   railway variables set PORT=3000
   railway variables set ALLOWED_ORIGINS=https://your-frontend-url.com
   ```
6. Provision a PostgreSQL database:
   ```bash
   railway add postgresql
   ```

Alternatively, you can deploy via the Railway dashboard:
1. Sign up at [railway.app](https://railway.app)
2. Click "New Project" and select "Deploy from GitHub repo"
3. Connect your repository
4. Configure the service with the proper environment variables
5. Railway will automatically detect it's a Node.js project and deploy accordingly

### Docker Deployment

A Dockerfile is included for containerized deployment:
```bash
docker build -t safeai-backend .
docker run -p 3000:3000 safeai-backend
```

## API Endpoints

### `POST /analyze`
Analyze text for sensitive information.

**Request:**
```json
{
  "text": "string",
  "platform": "chatgpt|claude|gemini"
}
```

**Response:**
```json
{
  "riskLevel": "LOW|MEDIUM|HIGH",
  "findings": [...],
  "anonymized": "string"
}
```

### `POST /security/analyze`
Advanced security analysis with context.

### `POST /security/anonymize`
Anonymize text based on analysis findings.

### `POST /security/decide`
Make a security decision based on analysis.

### `GET /health`
Health check endpoint.

## Security Considerations

- All API keys are stored server-side
- No sensitive data is logged or stored
- Communication happens over HTTPS
- Minimal permissions model
- Input validation and sanitization

## Testing

The backend includes comprehensive tests for all modules:

- Unit tests for detection algorithms
- Unit tests for anonymization functions
- Unit tests for policy engine
- Integration tests for API endpoints