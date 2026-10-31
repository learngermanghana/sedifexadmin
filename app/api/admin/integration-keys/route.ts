import { createHash, randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { adminFirestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function response(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function requirePlatformAdmin(req: Request) {
  return authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin'], scopes: ['platform'] });
}

function validStoreId(value: unknown) {
  if (typeof value !== 'string') return '';
  const result = value.trim();
  return result.length > 0 && result.length <= 180 && !result.includes('/') ? result : '';
}

function validKeyId(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,180}$/.test(value) ? value : '';
}

function validName(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function validWebsiteUrl(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = new URL(req.url).host;
    const trustedHosts = [host, req.headers.get('host'), req.headers.get('x-forwarded-host')];
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
    return trustedHosts.includes(url.host) && (url.protocol === 'https:' || (isLocal && url.protocol === 'http:'));
  } catch {
    return false;
  }
}

function timestamp(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return typeof value === 'string' ? value : null;
}

function publicKey(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    storeId: data.storeId || '',
    name: data.name || 'Website integration',
    websiteUrl: data.websiteUrl || '',
    purpose: data.purpose || 'website',
    keyPreview: data.keyPreview || '••••••••',
    status: data.status || 'active',
    source: data.source || 'manual',
    createdAt: timestamp(data.createdAt),
    lastUsedAt: timestamp(data.lastUsedAt),
    canRevoke: data.source === 'sedifexadmin' && Boolean(data.tokenHash),
  };
}

export async function GET(req: Request) {
  const session = await requirePlatformAdmin(req);
  if (!session) return response({ ok: false, error: 'Forbidden.' }, 403);
  const storeId = validStoreId(new URL(req.url).searchParams.get('storeId'));
  if (!storeId) return response({ ok: false, error: 'Select a valid store.' }, 400);

  try {
    const snapshot = await adminFirestore().collection('integrationApiKeys')
      .where('storeId', '==', storeId)
      .limit(100)
      .get();
    const keys = snapshot.docs.map(doc => publicKey(doc.id, doc.data()));
    return response({ ok: true, storeId, keys });
  } catch (error) {
    console.error('[admin-integration-keys] list failed', error);
    return response({ ok: false, error: 'Unable to load integration keys.' }, 500);
  }
}

export async function POST(req: Request) {
  const session = await requirePlatformAdmin(req);
  if (!session) return response({ ok: false, error: 'Forbidden.' }, 403);
  if (!sameOrigin(req)) return response({ ok: false, error: 'Invalid request origin.' }, 403);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const storeId = validStoreId(body?.storeId);
  const name = validName(body?.name);
  const websiteUrl = validWebsiteUrl(body?.websiteUrl);
  if (!storeId || !name || websiteUrl === null) {
    return response({ ok: false, error: 'Select a store and provide a name and optional HTTPS website URL.' }, 400);
  }

  const token = 'sedx_' + randomBytes(32).toString('hex');
  const keyPreview = token.slice(0, 8) + '...' + token.slice(-4);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = FieldValue.serverTimestamp();
  const db = adminFirestore();
  const storeRef = db.collection('stores').doc(storeId);
  const settingsRef = db.collection('storeSettings').doc(storeId);
  const keyRef = db.collection('integrationApiKeys').doc();
  const auditRef = db.collection('adminAuditLogs').doc();

  try {
    await db.runTransaction(async tx => {
      const [store, settings] = await Promise.all([tx.get(storeRef), tx.get(settingsRef)]);
      if (!store.exists && !settings.exists) throw new Error('STORE_NOT_FOUND');
      // Never save the plaintext token to Firestore. Legacy keys remain supported.
      tx.create(keyRef, {
        storeId,
        name,
        websiteUrl,
        purpose: 'website',
        source: 'sedifexadmin',
        tokenHash,
        keyPreview,
        status: 'active',
        createdBy: session.email,
        createdByRole: session.role,
        createdAt: now,
        updatedAt: now,
      });
      tx.create(auditRef, {
        action: 'integration_key_created',
        actor: 'sedifexadmin',
        actorEmail: session.email,
        actorRole: session.role,
        storeId,
        keyId: keyRef.id,
        keyName: name,
        websiteUrl,
        keyPreview,
        createdAt: now,
      });
    });

    return response({
      ok: true,
      storeId,
      token, // Returned once, only to the authenticated admin that created it.
      key: { id: keyRef.id, name, storeId, websiteUrl, keyPreview, status: 'active' },
    }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_NOT_FOUND') {
      return response({ ok: false, error: 'This client store no longer exists.' }, 404);
    }
    console.error('[admin-integration-keys] create failed', error);
    return response({ ok: false, error: 'Unable to create the integration.' }, 500);
  }
}

export async function PATCH(req: Request) {
  const session = await requirePlatformAdmin(req);
  if (!session) return response({ ok: false, error: 'Forbidden.' }, 403);
  if (!sameOrigin(req)) return response({ ok: false, error: 'Invalid request origin.' }, 403);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const storeId = validStoreId(body?.storeId);
  const keyId = validKeyId(body?.keyId);
  if (!storeId || !keyId) return response({ ok: false, error: 'Store and key are required.' }, 400);

  const db = adminFirestore();
  const keyRef = db.collection('integrationApiKeys').doc(keyId);
  const auditRef = db.collection('adminAuditLogs').doc();
  const now = FieldValue.serverTimestamp();

  try {
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(keyRef);
      const key = snapshot.data();
      if (!key || key.storeId !== storeId) throw new Error('KEY_NOT_FOUND');
      if (key.source !== 'sedifexadmin' || !key.tokenHash) throw new Error('LEGACY_KEY');
      if (key.status === 'revoked') throw new Error('ALREADY_REVOKED');

      tx.update(keyRef, { status: 'revoked', revokedAt: now, revokedBy: session.email, updatedAt: now });
      tx.create(auditRef, {
        action: 'integration_key_revoked',
        actor: 'sedifexadmin',
        actorEmail: session.email,
        actorRole: session.role,
        storeId,
        keyId,
        keyName: key.name || '',
        createdAt: now,
      });
    });
    return response({ ok: true, storeId, keyId, status: 'revoked' });
  } catch (error) {
    if (error instanceof Error && error.message === 'KEY_NOT_FOUND') return response({ ok: false, error: 'Key not found for this store.' }, 404);
    if (error instanceof Error && error.message === 'ALREADY_REVOKED') return response({ ok: false, error: 'Key is already revoked.' }, 409);
    if (error instanceof Error && error.message === 'LEGACY_KEY') return response({ ok: false, error: 'Legacy keys require a separate rotation process.' }, 409);
    console.error('[admin-integration-keys] revoke failed', error);
    return response({ ok: false, error: 'Unable to revoke the key.' }, 500);
  }
}
