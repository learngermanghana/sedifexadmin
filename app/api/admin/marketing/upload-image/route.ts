import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { adminStorageBucket } from '../../../../../lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type UploadedImageFile = {
  name?: string;
  size: number;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};


function safeFilename(value: string) {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned || 'marketing-image';
}

function resolveExtension(filename: string, mimeType: string) {
  const fromName = filename.match(/\.([a-zA-Z0-9_-]{1,10})$/)?.[0]?.toLowerCase();
  if (fromName && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName)) return fromName;
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  return '.jpg';
}

function detectImageMimeType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3], buffer[4], buffer[5]))) return 'image/gif';
  return null;
}

function firebaseDownloadUrl(bucketName: string, objectName: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectName)}?alt=media&token=${encodeURIComponent(token)}`;
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-sedifex-upload-route-version': '2026-05-24-safe-blob-upload',
    },
  });
}

function errorJson(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || 'Image upload failed.');
  return json({ ok: false, error: message }, status);
}

function getUploadedImageFile(value: FormDataEntryValue | null): UploadedImageFile | null {
  if (!value || typeof value !== 'object') return null;
  const maybeFile = value as unknown as Partial<UploadedImageFile>;
  if (typeof maybeFile.size !== 'number' || typeof maybeFile.arrayBuffer !== 'function') return null;
  return {
    name: typeof maybeFile.name === 'string' ? maybeFile.name : 'marketing-image',
    size: maybeFile.size,
    type: typeof maybeFile.type === 'string' ? maybeFile.type : undefined,
    arrayBuffer: maybeFile.arrayBuffer,
  };
}

export async function GET() {
  return json({
    ok: true,
    route: '/api/admin/marketing/upload-image',
    method: 'POST',
    field: 'imageFile',
    maxSizeMb: 4,
    supportedTypes: Array.from(SUPPORTED_IMAGE_TYPES),
    version: '2026-05-24-safe-blob-upload',
  });
}

export async function POST(req: Request) {
  try {
    const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin', 'support'] });
    if (!session) {
      return json({ ok: false, error: 'Only super_admin, ops_admin, or support can upload marketing images.', currentRole: role || null }, 403);
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return json({ ok: false, error: 'Upload must use multipart/form-data with form field imageFile.' }, 400);
    }

    const formData = await req.formData();
    const uploadedFile = getUploadedImageFile(formData.get('imageFile'));
    if (!uploadedFile || uploadedFile.size === 0) {
      return json({ ok: false, error: 'No image file was uploaded. Use form field imageFile.' }, 400);
    }

    if (uploadedFile.size > MAX_IMAGE_BYTES) {
      return json({ ok: false, error: 'Image is too large. Maximum upload size is 4 MB. Please compress or resize it first.' }, 413);
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    const detectedMimeType = detectImageMimeType(buffer);
    if (!detectedMimeType || !SUPPORTED_IMAGE_TYPES.has(detectedMimeType)) {
      return json({ ok: false, error: 'Unsupported image file. Please upload JPG, PNG, WEBP, or GIF.' }, 400);
    }

    const bucket = adminStorageBucket();
    const originalName = safeFilename(uploadedFile.name || 'marketing-image');
    const basename = originalName.replace(/\.(jpe?g|png|webp|gif)$/i, '') || 'marketing-image';
    const extension = resolveExtension(originalName, detectedMimeType);
    const objectName = `marketing-campaign-images/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${basename}${extension}`;
    const downloadToken = randomUUID();
    const target = bucket.file(objectName);

    await target.save(buffer, {
      resumable: false,
      metadata: {
        contentType: detectedMimeType,
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    return json({
      ok: true,
      imageUrl: firebaseDownloadUrl(bucket.name, objectName, downloadToken),
      imagePath: objectName,
      contentType: detectedMimeType,
      sizeBytes: uploadedFile.size,
      maxSizeMb: 4,
      version: '2026-05-24-safe-blob-upload',
    });
  } catch (error) {
    console.error('[marketing-upload-image] failed', error);
    return errorJson(error);
  }
}
