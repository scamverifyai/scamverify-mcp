#!/usr/bin/env node

/**
 * ScamVerify MCP Server
 *
 * A local MCP server (stdio) that proxies tool calls to the ScamVerify API
 * at https://scamverify.ai/api/mcp. Requires a SCAMVERIFY_API_KEY environment
 * variable for authentication.
 *
 * 10 tools across 6 verification channels:
 *   Phone, URL, Text, Email, Document, QR Code
 *
 * Data sources: FTC (9.7M+), FCC (443K+), URLhaus (74K+), ThreatFox (60K+),
 * carrier intelligence, community reports.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.SCAMVERIFY_API_URL || 'https://scamverify.ai';
const API_KEY = process.env.SCAMVERIFY_API_KEY || '';

const server = new McpServer({
  name: 'scamverify',
  version: '1.0.0',
});

// ── HTTP helpers ──

function ensureApiKey(): void {
  if (!API_KEY) {
    throw new Error(
      'SCAMVERIFY_API_KEY is not set. ' +
      'Get a free API key at https://scamverify.ai (Settings > API Keys).'
    );
  }
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  ensureApiKey();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data as Record<string, string>).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function apiGet(path: string): Promise<unknown> {
  ensureApiKey();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data as Record<string, string>).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function apiMultipart(path: string, buffer: Buffer, mimeType: string, fileName: string): Promise<unknown> {
  ensureApiKey();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  const formData = new FormData();
  formData.append('file', blob, fileName);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data as Record<string, string>).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ── Result helpers ──

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

// ── Image resolution (for document + QR tools) ──

async function resolveImage(
  imageUrl?: string,
  imageBase64?: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  if (!imageUrl && !imageBase64) {
    throw new Error('Provide either image_url or image_base64.');
  }
  if (imageUrl && imageBase64) {
    throw new Error('Provide only one of image_url or image_base64, not both.');
  }

  if (imageUrl) {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Failed to download image: HTTP ${response.status}`);
    const ct = response.headers.get('content-type');
    const mimeType = ct ? ct.split(';')[0].trim() : 'image/jpeg';
    const arrayBuf = await response.arrayBuffer();
    let fileName = 'image.jpg';
    try {
      const seg = new URL(imageUrl).pathname.split('/').pop();
      if (seg && seg.includes('.')) fileName = seg;
    } catch { /* keep default */ }
    return { buffer: Buffer.from(arrayBuf), mimeType, fileName };
  }

  // base64
  let raw = imageBase64!;
  let mimeType = 'image/jpeg';
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    raw = match[2];
  }
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length === 0) throw new Error('Base64 data decoded to empty buffer.');
  const ext: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf',
  };
  return { buffer, mimeType, fileName: `image${ext[mimeType] || '.jpg'}` };
}

// ── Tool registration ──

// 1. check_phone
server.tool(
  'check_phone',
  'Look up a US phone number to check for scam reports, carrier info, network status, robocall flags, and community reports. Returns a risk score (0-100), verdict, and detailed signals from FTC, FCC, carrier, and community data.',
  {
    phone_number: z.string().describe('US phone number to look up (any format: +1XXXXXXXXXX, (XXX) XXX-XXXX, etc.)'),
    force_refresh: z.boolean().optional().describe('Force a fresh lookup, bypassing cache (default: false)'),
  },
  {
    title: 'Check Phone Number',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async ({ phone_number, force_refresh }) => {
    try {
      const data = await apiPost('/api/v1/phone/lookup', { phone_number, force_refresh });
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Phone lookup failed');
    }
  },
);

// 2. check_url
server.tool(
  'check_url',
  'Check a website URL for safety. Analyzes domain age, SSL certificate, redirect chains, brand impersonation, Google Web Risk, URLhaus, ThreatFox, and community reports. Returns risk score and detailed signals.',
  {
    url: z.string().describe('URL to check (must include protocol, e.g. https://example.com)'),
    force_refresh: z.boolean().optional().describe('Force a fresh lookup, bypassing cache (default: false)'),
  },
  {
    title: 'Check URL Safety',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async ({ url, force_refresh }) => {
    try {
      const data = await apiPost('/api/v1/url/lookup', { url, force_refresh });
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'URL lookup failed');
    }
  },
);

// 3. check_text
server.tool(
  'check_text',
  'Analyze a text/SMS message for scam indicators. Extracts and cross-references embedded phone numbers and URLs. AI analysis identifies scam type, red flags, and risk level. Returns unified risk score combining AI and sub-lookup signals.',
  {
    message: z.string().describe('Text message content to analyze (max 5000 characters)'),
    from_number: z.string().optional().describe('Sender phone number, if known'),
  },
  {
    title: 'Analyze Text Message',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async ({ message, from_number }) => {
    try {
      const body: Record<string, unknown> = { message };
      if (from_number) body.from_number = from_number;
      const data = await apiPost('/api/v1/text/analyze', body);
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Text analysis failed');
    }
  },
);

// 4. check_email
server.tool(
  'check_email',
  'Analyze an email for phishing indicators. Checks sender domain, email headers (SPF/DKIM/DMARC), brand impersonation, embedded URLs and phone numbers. Returns unified risk score with detailed header and sender analysis.',
  {
    email_body: z.string().describe('Email body content to analyze (max 20000 characters)'),
    sender_email: z.string().optional().describe('Sender email address'),
    subject: z.string().optional().describe('Email subject line'),
    raw_headers: z.string().optional().describe('Raw email headers for SPF/DKIM/DMARC analysis'),
  },
  {
    title: 'Analyze Email',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async ({ email_body, sender_email, subject, raw_headers }) => {
    try {
      const body: Record<string, unknown> = { email_body };
      if (sender_email) body.sender_email = sender_email;
      if (subject) body.subject = subject;
      if (raw_headers) body.raw_headers = raw_headers;
      const data = await apiPost('/api/v1/email/analyze', body);
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Email analysis failed');
    }
  },
);

// 5. check_document
server.tool(
  'check_document',
  'Analyze a document image for scam indicators. Upload a photo of a suspicious letter, court notice, receipt, invoice, or other document. Uses vision AI to extract entities (addresses, officials, citations, phone numbers) and verifies them against government databases. Returns risk score, verdict, red flags, and entity verification results.',
  {
    image_url: z.string().optional().describe('URL of the document image to analyze (provide either image_url or image_base64)'),
    image_base64: z.string().optional().describe('Base64-encoded image data (provide either image_url or image_base64). Include the data URI prefix (e.g. data:image/jpeg;base64,...) or raw base64.'),
  },
  {
    title: 'Analyze Document',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async ({ image_url, image_base64 }) => {
    try {
      const { buffer, mimeType, fileName } = await resolveImage(image_url, image_base64);
      const data = await apiMultipart('/api/v1/document/analyze', buffer, mimeType, fileName);
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Document analysis failed');
    }
  },
);

// 6. check_qr
server.tool(
  'check_qr',
  'Analyze a QR code image. Decodes the QR code server-side and, if it contains a URL, runs full URL verification (domain age, SSL, brand impersonation, URLhaus, ThreatFox, Google Web Risk). Useful for verifying QR codes on parking meters, restaurant menus, mail, and packages. Consumes URL quota only when a URL is found.',
  {
    image_url: z.string().optional().describe('URL of the QR code image to scan (provide either image_url or image_base64)'),
    image_base64: z.string().optional().describe('Base64-encoded QR code image (provide either image_url or image_base64). Supports data URI prefix.'),
  },
  {
    title: 'Scan QR Code',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async ({ image_url, image_base64 }) => {
    try {
      const { buffer, mimeType, fileName } = await resolveImage(image_url, image_base64);
      const data = await apiMultipart('/api/v1/qr/analyze', buffer, mimeType, fileName);
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'QR analysis failed');
    }
  },
);

// 7. batch_phone
server.tool(
  'batch_phone',
  'Look up multiple phone numbers in a single request (max 100). Each number is checked individually with the same analysis as check_phone. Returns results array with per-item risk scores and a summary.',
  {
    phone_numbers: z.array(z.string()).min(1).max(100).describe('Array of US phone numbers (1-100)'),
    force_refresh: z.boolean().optional().describe('Force fresh lookups, bypassing cache (default: false)'),
  },
  {
    title: 'Batch Phone Lookup',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async ({ phone_numbers, force_refresh }) => {
    try {
      const data = await apiPost('/api/v1/batch/phone', { phone_numbers, force_refresh });
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Batch phone lookup failed');
    }
  },
);

// 8. batch_url
server.tool(
  'batch_url',
  'Check multiple URLs in a single request (max 100). Each URL is analyzed individually with the same checks as check_url. Returns results array with per-item risk scores and a summary.',
  {
    urls: z.array(z.string()).min(1).max(100).describe('Array of URLs to check (1-100)'),
    force_refresh: z.boolean().optional().describe('Force fresh lookups, bypassing cache (default: false)'),
  },
  {
    title: 'Batch URL Lookup',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async ({ urls, force_refresh }) => {
    try {
      const data = await apiPost('/api/v1/batch/url', { urls, force_refresh });
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Batch URL lookup failed');
    }
  },
);

// 9. get_usage
server.tool(
  'get_usage',
  'Check your current API usage quota and rate limits for the billing period. Shows per-channel usage (phone, URL, text, email, document) with limits and remaining counts. QR lookups consume URL quota.',
  {},
  {
    title: 'Get Usage & Quota',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async () => {
    try {
      const data = await apiGet('/api/v1/usage');
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to get usage');
    }
  },
);

// 10. get_status
server.tool(
  'get_status',
  'Check the operational status of ScamVerify API services. Returns health status for each component (phone, URL, text, email, document lookups, database, AI inference). No authentication required.',
  {},
  {
    title: 'Get Service Status',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async () => {
    try {
      // Status endpoint does not require auth
      const res = await fetch(`${BASE_URL}/api/v1/status`, { method: 'POST' });
      const data = await res.json();
      return jsonResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to get status');
    }
  },
);

// ── Prompt registration ──

server.prompt(
  'investigate_phone',
  'Investigate a suspicious phone number for scam indicators and provide a safety recommendation.',
  { phone_number: z.string().describe('The phone number to investigate') },
  ({ phone_number }) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I received a call or message from ${phone_number}. Please use the check_phone tool to look up this number and then provide me with:\n1. The risk score and verdict\n2. A plain-English summary of what was found\n3. Whether I should answer calls from this number\n4. What to do if I already shared personal information with this caller`,
        },
      },
    ],
  }),
);

server.prompt(
  'verify_url',
  'Check if a website URL is safe to visit and provide a detailed safety assessment.',
  { url: z.string().describe('The URL to verify') },
  ({ url }) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I was sent this link: ${url}. Please use the check_url tool to analyze it and tell me:\n1. The risk score and verdict\n2. Whether it is safe to click\n3. Any red flags found (malware, phishing, suspicious domain, etc.)\n4. What I should do if I already clicked the link`,
        },
      },
    ],
  }),
);

server.prompt(
  'analyze_text',
  'Analyze a suspicious text message for scam indicators and explain the findings.',
  {
    message: z.string().describe('The text message content'),
    from_number: z.string().optional().describe('The sender phone number, if known'),
  },
  ({ message, from_number }) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I received this text message${from_number ? ` from ${from_number}` : ''}:\n\n"${message}"\n\nPlease use the check_text tool to analyze this message and tell me:\n1. The risk score and verdict\n2. Whether this is a scam, spam, or legitimate message\n3. Any embedded links or phone numbers and whether they are safe\n4. What I should do next (ignore, block, report, etc.)`,
        },
      },
    ],
  }),
);

server.prompt(
  'check_email',
  'Analyze a suspicious email for phishing indicators and provide a safety assessment.',
  {
    email_body: z.string().describe('The email body content'),
    sender_email: z.string().optional().describe('The sender email address'),
    subject: z.string().optional().describe('The email subject line'),
  },
  ({ email_body, sender_email, subject }) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I received this email${sender_email ? ` from ${sender_email}` : ''}${subject ? ` with subject "${subject}"` : ''}:\n\n"${email_body}"\n\nPlease use the check_email tool to analyze this and tell me:\n1. The risk score and verdict\n2. Whether this is a phishing attempt, scam, or legitimate email\n3. Any suspicious sender details or header issues (SPF/DKIM/DMARC failures)\n4. Whether any embedded links or phone numbers are safe\n5. What I should do next`,
        },
      },
    ],
  }),
);

// ── Start server ──

const transport = new StdioServerTransport();
await server.connect(transport);
