# ScamVerify MCP Server

AI-powered scam and threat verification MCP server. Verify phone numbers, URLs, text messages, emails, documents, and QR codes against 10M+ threat intelligence records from FTC, FCC, URLhaus, ThreatFox, and community reports.

**Server URL:** `https://scamverify.ai/api/mcp`

**Transport:** Streamable HTTP (stateless) or stdio (local proxy)

**Authentication:** API key or OAuth 2.1 (PKCE)

## Tools (10)

| Tool | Description |
|------|-------------|
| `check_phone` | Look up a US phone number for scam reports, carrier info, robocall flags, and community reports. Returns risk score (0-100), verdict, and detailed signals from FTC, FCC, carrier, and community data. |
| `check_url` | Check a website URL for safety. Analyzes domain age, SSL certificate, redirect chains, brand impersonation, Google Web Risk, URLhaus, ThreatFox, and community reports. |
| `check_text` | Analyze a text/SMS message for scam indicators. Extracts and cross-references embedded phone numbers and URLs. AI identifies scam type, red flags, and risk level. |
| `check_email` | Analyze an email for phishing indicators. Checks sender domain, email headers (SPF/DKIM/DMARC), brand impersonation, embedded URLs and phone numbers. |
| `check_document` | Analyze a document image for scam indicators. Uses vision AI to extract entities (addresses, officials, citations, phone numbers) and verifies them against government databases. |
| `check_qr` | Scan a QR code image and verify its contents. Decodes the QR code server-side and, if it contains a URL, runs full URL verification. |
| `batch_phone` | Look up multiple phone numbers in a single request (max 100). |
| `batch_url` | Check multiple URLs in a single request (max 100). |
| `get_usage` | Check your current API usage quota and rate limits for the billing period. |
| `get_status` | Check the operational status of ScamVerify API services. No authentication required. |

## Prompts (4)

| Prompt | Description |
|--------|-------------|
| `investigate_phone` | Investigate a suspicious phone number for scam indicators and provide a safety recommendation. |
| `verify_url` | Check if a website URL is safe to visit and provide a detailed safety assessment. |
| `analyze_text` | Analyze a suspicious text message for scam indicators and explain the findings. |
| `check_email` | Analyze a suspicious email for phishing indicators and provide a safety assessment. |

## Data Sources

- **FTC Do Not Call Complaints** - 9.7M+ records with scam type classification
- **FCC Consumer Complaints** - 443K+ telecom violation reports
- **URLhaus** - 74K+ active malicious URL indicators
- **ThreatFox** - 60K+ IOCs (indicators of compromise)
- **Carrier Intelligence** - Line type, CNAM, VoIP detection, high-risk carrier flagging
- **Community Reports** - User-submitted scam reports with verification

## Setup

### Option 1: Remote Server (Recommended)

Connect directly to the hosted ScamVerify MCP server. No installation required.

**Claude Desktop:**

```json
{
  "mcpServers": {
    "scamverify": {
      "type": "streamable-http",
      "url": "https://scamverify.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

**Claude Desktop (OAuth - no API key needed):**

```json
{
  "mcpServers": {
    "scamverify": {
      "type": "streamable-http",
      "url": "https://scamverify.ai/api/mcp"
    }
  }
}
```

When using without an API key, Claude Desktop will initiate the OAuth 2.1 flow. You'll be redirected to sign in at scamverify.ai and authorize access.

**Cursor / Windsurf / Other MCP Clients:**

```json
{
  "type": "streamable-http",
  "url": "https://scamverify.ai/api/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_API_KEY"
  }
}
```

**ChatGPT:**

ScamVerify is available as a ChatGPT connector. Add it through the ChatGPT plugin/connector settings using:

- **MCP URL:** `https://scamverify.ai/api/mcp`
- **Auth:** OAuth

### Option 2: Local Proxy (stdio)

Run a local MCP server that proxies all tool calls to the ScamVerify API. Useful for MCP clients that only support stdio transport.

**Install and run:**

```bash
npm install -g @scamverifyai/scamverify-mcp
SCAMVERIFY_API_KEY=sv_live_... scamverify-mcp
```

**Or run directly with npx:**

```bash
SCAMVERIFY_API_KEY=sv_live_... npx @scamverifyai/scamverify-mcp
```

**Claude Desktop (stdio):**

```json
{
  "mcpServers": {
    "scamverify": {
      "command": "npx",
      "args": ["@scamverifyai/scamverify-mcp"],
      "env": {
        "SCAMVERIFY_API_KEY": "sv_live_..."
      }
    }
  }
}
```

**Docker:**

```bash
docker build -t scamverify-mcp .
docker run -e SCAMVERIFY_API_KEY=sv_live_... scamverify-mcp
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SCAMVERIFY_API_KEY` | Yes | Your API key (prefix: `sv_live_` for production, `sv_test_` for testing) |
| `SCAMVERIFY_API_URL` | No | Override the API base URL (default: `https://scamverify.ai`) |

### Getting an API Key

1. Sign up at [scamverify.ai](https://scamverify.ai)
2. Go to Settings > API Keys
3. Generate a key (prefix: `sv_live_` for production, `sv_test_` for testing)

### OAuth 2.1 Authentication

The remote server supports OAuth 2.1 with PKCE (S256). Discovery endpoints:

- **Authorization Server:** `https://scamverify.ai/.well-known/oauth-authorization-server`
- **Protected Resource:** `https://scamverify.ai/.well-known/oauth-protected-resource`

OAuth scopes: `phone:lookup`, `url:lookup`, `text:analyze`, `email:analyze`, `usage:read`

## Development

```bash
git clone https://github.com/scamverifyai/scamverify-mcp.git
cd scamverify-mcp
npm install
npm run build
SCAMVERIFY_API_KEY=sv_test_... npm start
```

## Pricing

A free tier (50 lookups/month) is automatically provisioned on first OAuth login or API key creation.

| Plan | Monthly Price | Lookups/mo | Rate Limit |
|------|--------------|------------|------------|
| Free | $0 | 50 | 10 RPM |
| Starter | $19/mo | 1,000 | 30 RPM |
| Growth | $49/mo | 5,000 | 60 RPM |
| Pro | $149/mo | 25,000 | 120 RPM |
| Scale | $499/mo | 100,000 | 300 RPM |
| Enterprise | Custom | Custom | Custom |

Full API documentation: [docs.scamverify.ai](https://docs.scamverify.ai)

## Links

- **Website:** [scamverify.ai](https://scamverify.ai)
- **API Docs:** [docs.scamverify.ai](https://docs.scamverify.ai)
- **MCP Integration Guide:** [docs.scamverify.ai/docs/guides/mcp-integration](https://docs.scamverify.ai/docs/guides/mcp-integration)
- **OAuth Flow Guide:** [docs.scamverify.ai/docs/guides/oauth-flow](https://docs.scamverify.ai/docs/guides/oauth-flow)
- **Status Page:** [status.scamverify.ai](https://status.scamverify.ai)
- **Contact:** [scamverify.ai/contact](https://scamverify.ai/contact)

## License

MIT
