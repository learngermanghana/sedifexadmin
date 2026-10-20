import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import {
  normalizeAdInput, sanitizeAdScript, templateScript,
} from '@/lib/video-ad-studio';

export const runtime = 'nodejs';
export const maxDuration = 20;

export async function POST(request: Request) {
  const admin = await authorizeAdminRequest(request, { roles: ['super_admin', 'ops_admin'] });
  if (!admin) return NextResponse.json({ ok: false, error: 'Not authorized for Video Studio.' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }
  const input = normalizeAdInput(body);
  if (!input.brand || !input.product) {
    return NextResponse.json({ ok: false, error: 'Business name and advertised product are required.' }, { status: 400 });
  }
  const fallback = templateScript(input);
  const enabled = process.env.SEDIFEX_AI_STUDIO_ENABLE_GEMINI === 'true';
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!enabled || !apiKey) {
    return NextResponse.json({ ok: true, mode: 'template', script: fallback,
      notice: 'Local storyboard. No Google API request was made. Configure the server-side Gemini key and opt-in flag for AI scripting.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response: Response;
    try {
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Write factual, upbeat, tasteful ad scripts for small businesses. Return JSON only. Do not invent discounts, price, certifications or business claims. Use exactly four scenes. Keep headlines short, legible and suitable for social media motion graphics. Do not add web links.' }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify({
            instruction: 'Provide fields headline, subheading, offer, callToAction, caption, scenes (four objects with title and subtitle).',
            brand: input.brand, product: input.product, price: input.price,
            callToAction: input.callToAction, style: input.style, durationSeconds: input.duration,
          }) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.6, maxOutputTokens: 500 },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error('Google scripting service unavailable (' + response.status + ').');
    const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const rawText = json.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    const generated: unknown = JSON.parse(rawText);
    return NextResponse.json({ ok: true, mode: 'gemini', script: sanitizeAdScript(generated, fallback),
      notice: 'Storyboard generated with Gemini Flash-Lite. API billing depends on the Google account tier.' });
  } catch {
    // Fail closed to a local template and do not leak API keys or provider payloads.
    return NextResponse.json({ ok: true, mode: 'template', script: fallback,
      notice: 'Gemini was unavailable; used the free built-in storyboard instead.' });
  }
}
