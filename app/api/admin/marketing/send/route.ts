import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Recipient = {
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  role?: string;
  storeId?: string;
  storeName?: string;
};

type RequestBody = {
  audience?: string;
  subject?: string;
  html?: string;
  text?: string;
  recipients?: Recipient[];
};


function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeRecipients(recipients: unknown): Recipient[] {
  if (!Array.isArray(recipients)) return [];
  const deduped = new Map<string, Recipient>();
  for (const item of recipients.slice(0, 2000)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Recipient;
    const email = normalizeEmail(record.email);
    if (!isValidEmail(email)) continue;
    deduped.set(email, {
      name: cleanText(record.name) || email.split('@')[0],
      email,
      phone: cleanText(record.phone),
      source: cleanText(record.source),
      role: cleanText(record.role),
      storeId: cleanText(record.storeId),
      storeName: cleanText(record.storeName),
    });
  }
  return Array.from(deduped.values());
}

function plainTextFromHtml(html: string) {
  return html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function sedifexMarketingConfig() {
  const webAppUrl = (
    process.env.SEDIFEX_MARKETING_APPS_SCRIPT_URL ||
    process.env.MARKETING_APPS_SCRIPT_WEBHOOK_URL ||
    process.env.APPS_SCRIPT_MARKETING_WEBHOOK_URL ||
    ''
  ).trim();

  const sharedToken = (
    process.env.SEDIFEX_MARKETING_SHARED_TOKEN ||
    process.env.MARKETING_APPS_SCRIPT_TOKEN ||
    process.env.SEDIFEX_SHARED_TOKEN ||
    ''
  ).trim();

  return {
    webAppUrl,
    sharedToken,
    fromEmail: (process.env.SEDIFEX_MARKETING_FROM_EMAIL || process.env.SEDIFEX_FROM_EMAIL || 'sedifexbiz@gmail.com').trim(),
    fromName: (process.env.SEDIFEX_MARKETING_FROM_NAME || 'Sedifex Team').trim(),
    replyTo: (process.env.SEDIFEX_MARKETING_REPLY_TO || process.env.SEDIFEX_MARKETING_FROM_EMAIL || process.env.SEDIFEX_FROM_EMAIL || 'sedifexbiz@gmail.com').trim(),
  };
}

function responseSnippet(value: string, max = 3000) {
  return value.length > max ? `${value.slice(0, max)}\n…[truncated ${value.length - max} chars]` : value;
}

function campaignIdForRequest(audience: string) {
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
  return `sedifex_${audience}_${Date.now()}_${randomPart}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function validateMarketingWebhookUrl(webAppUrl: string) {
  if (!webAppUrl) {
    return {
      ok: false,
      error: 'SEDIFEX_MARKETING_APPS_SCRIPT_URL is not configured.',
      detail: 'Add your Google Apps Script Web App URL in Vercel. It should look like https://script.google.com/macros/s/.../exec, not your Sedifex admin website URL.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(webAppUrl);
  } catch {
    return {
      ok: false,
      error: 'SEDIFEX_MARKETING_APPS_SCRIPT_URL is not a valid URL.',
      detail: `Current value starts with: ${webAppUrl.slice(0, 80)}`,
    };
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const looksLikeAppsScript = (host === 'script.google.com' || host.endsWith('.googleusercontent.com')) && path.includes('/macros/');
  const looksLikeSedifexSite = host.includes('sedifex.com') || host.includes('sedifexmarket.com');

  if (looksLikeSedifexSite || !looksLikeAppsScript) {
    return {
      ok: false,
      error: 'Wrong marketing webhook URL configured.',
      detail: `SEDIFEX_MARKETING_APPS_SCRIPT_URL must be the Google Apps Script Web App URL, for example https://script.google.com/macros/s/.../exec. Current host is ${host}. This is why the campaign showed a Cloudflare 502 from admin.sedifex.com instead of reaching Apps Script.`,
    };
  }

  return { ok: true };
}

function timeoutSignal(milliseconds: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

export async function POST(req: Request) {
  const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin', 'support'] });
  if (!session) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to send Sedifex marketing emails.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as RequestBody | null;
  const subject = cleanText(body?.subject);
  const html = cleanText(body?.html);
  const text = cleanText(body?.text) || plainTextFromHtml(html);
  const recipients = sanitizeRecipients(body?.recipients);
  const audience = cleanText(body?.audience) || 'both';
  const config = sedifexMarketingConfig();
  const campaignId = campaignIdForRequest(audience);
  const createdAt = new Date().toISOString();
  const webhookValidation = validateMarketingWebhookUrl(config.webAppUrl);

  if (!webhookValidation.ok) return NextResponse.json({ ok: false, error: webhookValidation.error, detail: webhookValidation.detail, campaignId }, { status: 500 });
  if (!config.sharedToken) return NextResponse.json({ ok: false, error: 'SEDIFEX_MARKETING_SHARED_TOKEN is not configured.', detail: 'Add SEDIFEX_MARKETING_SHARED_TOKEN or MARKETING_APPS_SCRIPT_TOKEN in Vercel.' }, { status: 500 });
  if (!subject) return NextResponse.json({ ok: false, error: 'Subject is required.' }, { status: 400 });
  if (!html && !text) return NextResponse.json({ ok: false, error: 'Email body is required.' }, { status: 400 });
  if (recipients.length === 0) return NextResponse.json({ ok: false, error: 'Select at least one valid recipient.' }, { status: 400 });

  const outboundPayload = {
    action: 'sendSedifexMarketingEmail',
    campaignId,
    createdAt,
    token: config.sharedToken,
    sharedToken: config.sharedToken,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    replyTo: config.replyTo,
    senderName: config.fromName,
    senderEmail: config.fromEmail,
    subject,
    html,
    text,
    recipients,
    audience,
    source: 'sedifexadmin_marketing_center',
    campaignOwner: 'sedifex',
    processAsync: true,
  };

  const timeout = timeoutSignal(12000);

  try {
    const response = await fetch(config.webAppUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sedifex-shared-token': config.sharedToken,
      },
      body: JSON.stringify(outboundPayload),
      signal: timeout.signal,
    });

    const responseText = await response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(responseText); } catch {}

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        error: `Sedifex marketing Apps Script returned HTTP ${response.status}.`,
        httpStatus: response.status,
        detail: responseSnippet(responseText || response.statusText || 'No response body returned from Apps Script.'),
        response: parsed,
        campaignId,
        requestSummary: {
          appScriptUrlConfigured: Boolean(config.webAppUrl),
          sender: `${config.fromName} <${config.fromEmail}>`,
          audience,
          recipientCount: recipients.length,
        },
      }, { status: 502 });
    }

    if (parsed && typeof parsed === 'object' && 'ok' in parsed && (parsed as { ok?: unknown }).ok === false) {
      const parsedRecord = parsed as { error?: unknown; message?: unknown; detail?: unknown };
      return NextResponse.json({
        ok: false,
        campaignId,
        error: cleanText(parsedRecord.error) || cleanText(parsedRecord.message) || 'Apps Script returned ok:false.',
        detail: cleanText(parsedRecord.detail) || responseSnippet(responseText),
        response: parsed,
      }, { status: 502 });
    }

    const scriptResponse = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    return NextResponse.json({
      ok: true,
      campaignId,
      sentToScript: recipients.length,
      queued: typeof scriptResponse?.queued === 'number' ? scriptResponse.queued : undefined,
      processedNow: typeof scriptResponse?.processedNow === 'number' ? scriptResponse.processedNow : undefined,
      remainingDailyQuota: typeof scriptResponse?.remainingDailyQuota === 'number' ? scriptResponse.remainingDailyQuota : undefined,
      queue: scriptResponse?.queue,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      audience,
      response: parsed ?? responseSnippet(responseText),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json({
      ok: false,
      campaignId,
      error: timedOut ? 'Apps Script did not acknowledge the campaign within 12 seconds.' : error instanceof Error ? error.message : 'Unable to send Sedifex marketing email.',
      detail: timedOut
        ? 'The Google Apps Script webhook took too long to respond. Deploy the queued Apps Script version as a new Web App version so it acknowledges campaigns quickly and sends recipients from the background queue.'
        : error instanceof Error ? error.stack : undefined,
      requestSummary: {
        appScriptUrlConfigured: Boolean(config.webAppUrl),
        sender: `${config.fromName} <${config.fromEmail}>`,
        audience,
        recipientCount: recipients.length,
      },
    }, { status: timedOut ? 504 : 500 });
  } finally {
    timeout.clear();
  }
}