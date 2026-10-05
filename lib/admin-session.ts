import type { AdminRole, AdminScope } from './admin-access';

export const ADMIN_SESSION_COOKIE = 'sedifex_admin_session';

const VALID_ROLES = new Set<AdminRole>([
  'super_admin',
  'ops_admin',
  'store_admin',
  'support',
  'analyst',
  'moderator',
]);

const VALID_SCOPES = new Set<AdminScope>(['platform', 'store']);

export type AdminSession = {
  version: 1;
  role: AdminRole;
  scope: AdminScope;
  email: string;
  issuedAt: number;
  expiresAt: number;
};

function sessionSecret() {
  const configured = process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) return configured;

  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (adminPassword) return adminPassword;

  throw new Error('Admin session signing is not configured. Set ADMIN_SESSION_SECRET.');
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeJson(value: unknown) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T {
  const decoded = new TextDecoder().decode(base64UrlDecode(value));
  return JSON.parse(decoded) as T;
}

async function signingKey() {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createAdminSessionToken(input: {
  role: AdminRole;
  scope: AdminScope;
  email: string;
  maxAgeSeconds: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSession = {
    version: 1,
    role: input.role,
    scope: input.scope,
    email: input.email.trim().toLowerCase(),
    issuedAt: now,
    expiresAt: now + input.maxAgeSeconds,
  };

  const encodedPayload = encodeJson(payload);
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(),
    new TextEncoder().encode(encodedPayload),
  );

  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionToken(token: string | null | undefined): Promise<AdminSession | null> {
  if (!token) return null;

  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(),
      base64UrlDecode(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;

    const payload = decodeJson<Partial<AdminSession>>(encodedPayload);
    if (payload.version !== 1) return null;
    if (!payload.role || !VALID_ROLES.has(payload.role as AdminRole)) return null;
    if (!payload.scope || !VALID_SCOPES.has(payload.scope as AdminScope)) return null;
    if (typeof payload.email !== 'string' || !payload.email.trim()) return null;
    if (typeof payload.issuedAt !== 'number' || typeof payload.expiresAt !== 'number') return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.expiresAt <= now || payload.issuedAt > now + 60) return null;

    return payload as AdminSession;
  } catch {
    return null;
  }
}
