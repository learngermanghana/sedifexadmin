import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { resolveExistingFirebaseStorageBucket } from '../../../../../lib/firebase-storage-resolver';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type UploadBody = {
  fileName?: unknown;
  contentType?: unknown;
  dataUrl?: unknown;
  base64?: unknown;
};


function cleanText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function safeFilename(value: string) {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned || 'marketing-image';
}

function detectImageMimeType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3], buffer[4], buffer[5]))) return 'image/gif';
  return null;
}

function extensionFor(mimeType: string, fileName: string) {
  const fromName = fileName.match(/\.([a-zA-Z0-9_-]{1,10})$/)?.[0]?.toLowerCase();
  if (fromName && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName)) return fromName;
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  return '.jpg';
}

function firebaseDownloadUrl(bucketName: string, objectName: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectName)}?alt=media&token=${encodeURIComponent(token)}`;
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-sedifex-upload-route-version': '2026-05-24-json-upload-bucket-resolver',
    },
  });
}

function readBase64(body: UploadBody) {
  const dataUrl = cleanText(body.dataUrl);
  if (dataUrl) {
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid dataUrl. Expected data:image/...;base64,...');
    return { contentType: match[1], base64: match[2] };
  }
  return { contentType: cleanText(body.contentType), base64: cleanText(body.base64) };
}

export async function GET() {
  return json({
    ok: true,
    route: '/api/admin/marketing/upload-image-json',
    method: 'POST',
    body: { fileName: 'string', dataUrl: 'data:image/png;base64,...' },
    maxSizeMb: 4,
    supportedTypes: Array.from(SUPPORTED_IMAGE_TYPES),
    version: '2026-05-24-json-upload-bucket-resolver',
  });
}

export async function POST(req: Request) {
  try {
    const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin', 'support'] });
    if (!session) {
      return json({ ok: false, error: 'Only super_admin, ops_admin, or support can upload marketing images.', currentRole: null }, 403);
    }

    const body = await req.json().catch(() => null) as UploadBody | null;
    if (!body) return json({ ok: false, error: 'Invalid JSON body.' }, 400);

    const fileName = safeFilename(cleanText(body.fileName, 'marketing-image'));
    const { contentType, base64 } = readBase64(body);
    if (!base64) return json({ ok: false, error: 'Missing image data. Send dataUrl or base64.' }, 400);

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return json({ ok: false, error: 'Image data is empty.' }, 400);
    if (buffer.length > MAX_IMAGE_BYTES) {
      return json({ ok: false, error: 'Image is too large. Maximum upload size is 4 MB. Please compress or resize it first.', sizeBytes: buffer.length, maxSizeBytes: MAX_IMAGE_BYTES }, 413);
    }

    const detectedMimeType = detectImageMimeType(buffer);
    if (!detectedMimeType || !SUPPORTED_IMAGE_TYPES.has(detectedMimeType)) {
      return json({ ok: false, error: 'Unsupported image file. Please upload JPG, PNG, WEBP, or GIF.', detectedMimeType, providedContentType: contentType || null }, 400);
    }

    const { bucket, bucketName, candidates } = await resolveExistingFirebaseStorageBucket();
    const basename = fileName.replace(/\.(jpe?g|png|webp|gif)$/i, '') || 'marketing-image';
    const extension = extensionFor(detectedMimeType, fileName);
    const objectName = `marketing-campaign-images/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${basename}${extension}`;
    const downloadToken = randomUUID();

    await bucket.file(objectName).save(buffer, {
      resumable: false,
      metadata: {
        contentType: detectedMimeType,
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    return json({
      ok: true,
      imageUrl: firebaseDownloadUrl(bucketName, objectName, downloadToken),
      imagePath: objectName,
      bucketName,
      triedBuckets: candidates,
      contentType: detectedMimeType,
      sizeBytes: buffer.length,
      maxSizeMb: 4,
      uploadMode: 'json-base64',
      version: '2026-05-24-json-upload-bucket-resolver',
    });
  } catch (error) {
    console.error('[marketing-upload-image-json] failed', error);
    return json({ ok: false, error: error instanceof Error ? error.message : 'Image upload failed.' }, 500);
  }
}
