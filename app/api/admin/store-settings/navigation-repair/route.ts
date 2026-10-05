import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { adminFirestore } from '../../../../../lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Industry = 'shop' | 'travel' | 'ngo' | 'school';
type RepairReason = 'missing-navigation' | 'missing-enabled-modules' | 'empty-enabled-modules' | 'all-pages-enabled';

type Candidate = {
  storeId: string;
  storeName: string;
  industry: Industry;
  reason: RepairReason;
  beforeCount: number;
  afterCount: number;
};

const NAV_ITEMS = [
  'dashboard', 'reports', 'products', 'sell', 'quick-pay', 'invoices', 'receipts', 'customers', 'students', 'bookings',
  'upcoming-events', 'student-registration', 'volunteers', 'support-requests', 'settlement', 'integrations', 'blog',
  'promo', 'gallery', 'social-links', 'website-builder', 'bulk-messaging', 'bulk-email', 'donor-management', 'funds-ledger', 'account',
];

const INDUSTRY_ENABLED_MODULE_PRESETS: Record<Industry, string[]> = {
  shop: ['dashboard', 'reports', 'products', 'sell', 'quick-pay', 'invoices', 'receipts', 'customers', 'bookings', 'upcoming-events', 'settlement', 'integrations', 'blog', 'promo', 'gallery', 'social-links', 'website-builder', 'donor-management'],
  travel: ['dashboard', 'reports', 'products', 'quick-pay', 'invoices', 'receipts', 'bookings', 'upcoming-events', 'settlement', 'integrations', 'blog', 'promo', 'gallery', 'social-links', 'website-builder', 'customers', 'bulk-messaging', 'bulk-email', 'donor-management'],
  ngo: ['dashboard', 'reports', 'products', 'quick-pay', 'invoices', 'receipts', 'customers', 'volunteers', 'support-requests', 'upcoming-events', 'settlement', 'integrations', 'blog', 'promo', 'gallery', 'social-links', 'website-builder', 'bulk-messaging', 'bulk-email', 'donor-management', 'funds-ledger'],
  school: ['dashboard', 'reports', 'products', 'quick-pay', 'invoices', 'receipts', 'bookings', 'upcoming-events', 'student-registration', 'students', 'settlement', 'integrations', 'blog', 'promo', 'gallery', 'social-links', 'website-builder', 'customers', 'bulk-messaging', 'bulk-email'],
};

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status });
}

function errorPayload(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  const stack = process.env.NODE_ENV === 'production' ? undefined : error instanceof Error ? error.stack : undefined;
  return { ok: false, error: message || fallback, stack };
}

async function assertAdmin(req: Request, action: string) {
  const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin'] });
  if (!session) {
    return json({ ok: false, error: `Only authenticated platform super_admin or ops_admin can ${action}.` }, 403);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function validIndustry(value: unknown): Industry | null {
  return value === 'shop' || value === 'travel' || value === 'ngo' || value === 'school' ? value : null;
}

function uniqueStringList(value: unknown) {
  if (!Array.isArray(value)) return null;
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim()),
    ),
  );
}

function isAllPagesEnabled(enabledModules: string[]) {
  const enabled = new Set(enabledModules);
  const known = NAV_ITEMS.filter((id) => enabled.has(id));
  return known.length >= NAV_ITEMS.length - 1;
}

function storeDisplayName(storeId: string, store: Record<string, unknown>, settings: Record<string, unknown>) {
  return text(store.storeName || store.name || store.businessName || store.displayName || settings.storeName || settings.name || settings.businessName || settings.displayName, storeId);
}

function inferIndustry(store: Record<string, unknown>, settings: Record<string, unknown>): Industry {
  const navigation = asRecord(settings.navigation);
  const direct = validIndustry(navigation.industry) || validIndustry(settings.industry) || validIndustry(store.industry) || validIndustry(store.businessType);
  if (direct) return direct;

  const categoryText = [store.businessCategory, store.category, store.storeCategory, store.businessName, store.storeName, store.name]
    .map((item) => text(item).toLowerCase())
    .join(' ');

  if (/school|academy|college|training|course|student|education/.test(categoryText)) return 'school';
  if (/ngo|foundation|charity|donor|church|ministry|non-profit|nonprofit/.test(categoryText)) return 'ngo';
  if (/travel|tour|visa|ticket|flight|hotel|trip/.test(categoryText)) return 'travel';
  return 'shop';
}

function repairReason(settings: Record<string, unknown>): { reason: RepairReason; enabledModules: string[] | null } | null {
  const navigation = asRecord(settings.navigation);
  if (!settings.navigation) return { reason: 'missing-navigation', enabledModules: null };

  const enabledModules = uniqueStringList(navigation.enabledModules);
  const enabledModulesLegacy = uniqueStringList(navigation.enabled_modules);
  const visibleModules = uniqueStringList(navigation.visible_modules);
  const bestList = enabledModules ?? enabledModulesLegacy ?? visibleModules;

  if (!bestList) return { reason: 'missing-enabled-modules', enabledModules: null };
  if (bestList.length === 0) return { reason: 'empty-enabled-modules', enabledModules: bestList };
  if (isAllPagesEnabled(bestList)) return { reason: 'all-pages-enabled', enabledModules: bestList };
  return null;
}

async function findCandidates(limit: number): Promise<Candidate[]> {
  const db = adminFirestore();
  const [storesSnap, settingsSnap] = await Promise.all([
    db.collection('stores').limit(limit).get(),
    db.collection('storeSettings').limit(limit).get(),
  ]);

  const storeIds = new Set<string>();
  storesSnap.docs.forEach((doc) => storeIds.add(doc.id));
  settingsSnap.docs.forEach((doc) => storeIds.add(doc.id));

  const storesById = new Map(storesSnap.docs.map((doc) => [doc.id, doc.data() as Record<string, unknown>]));
  const settingsById = new Map(settingsSnap.docs.map((doc) => [doc.id, doc.data() as Record<string, unknown>]));
  const candidates: Candidate[] = [];

  for (const storeId of Array.from(storeIds).slice(0, limit)) {
    const store = storesById.get(storeId) || {};
    const settings = settingsById.get(storeId) || {};
    const reasonResult = repairReason(settings);
    if (!reasonResult) continue;

    const industry = inferIndustry(store, settings);
    candidates.push({
      storeId,
      storeName: storeDisplayName(storeId, store, settings),
      industry,
      reason: reasonResult.reason,
      beforeCount: reasonResult.enabledModules?.length ?? 0,
      afterCount: INDUSTRY_ENABLED_MODULE_PRESETS[industry].length,
    });
  }

  return candidates;
}

async function applyRepair(candidates: Candidate[]) {
  const db = adminFirestore();
  const now = new Date().toISOString();
  let updated = 0;

  for (let i = 0; i < candidates.length; i += 400) {
    const batch = db.batch();
    const chunk = candidates.slice(i, i + 400);

    chunk.forEach((candidate) => {
      const enabledModules = INDUSTRY_ENABLED_MODULE_PRESETS[candidate.industry];
      batch.set(db.collection('storeSettings').doc(candidate.storeId), {
        navigation: {
          industry: candidate.industry,
          labelPolicy: 'shared',
          enabledModules,
          enabled_modules: enabledModules,
          visible_modules: enabledModules,
          customNavItems: [],
          custom_nav_items: [],
          repairedFromLegacyNavigation: true,
          repairedReason: candidate.reason,
          repairedAt: now,
        },
        adminUpdatedAt: now,
        adminUpdatedFrom: 'navigation-repair-api',
      }, { merge: true });
      updated += 1;
    });

    batch.set(db.collection('adminAuditLogs').doc(), {
      action: 'store_settings_navigation_repair_batch',
      count: chunk.length,
      storeIds: chunk.map((candidate) => candidate.storeId),
      actor: 'sedifexadmin',
      createdAt: now,
    });

    await batch.commit();
  }

  return updated;
}

function limitFrom(value: string | number | null | undefined) {
  return Math.min(Math.max(Number(value || 500), 1), 1000);
}

export async function GET(req: Request) {
  try {
    const denied = await assertAdmin(req, 'inspect navigation repair');
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = limitFrom(url.searchParams.get('limit'));
    const applyFromQuery = url.searchParams.get('apply') === 'true';
    const candidates = await findCandidates(limit);

    if (applyFromQuery) {
      const updated = await applyRepair(candidates);
      return json({
        ok: true,
        mode: 'applied-from-get',
        updated,
        message: `Navigation repaired for ${updated} store setting documents.`,
        candidates: candidates.slice(0, 100),
      });
    }

    return json({
      ok: true,
      mode: 'dry-run',
      message: 'No changes were made. Open this URL with ?apply=true to repair, or send POST with { "apply": true }.',
      scannedLimit: limit,
      candidatesCount: candidates.length,
      candidates: candidates.slice(0, 100),
    });
  } catch (error) {
    console.error('[navigation-repair] GET failed', error);
    return json({
      ...errorPayload(error, 'Navigation repair dry-run failed.'),
      hint: 'Check Firebase Admin environment variables and make sure this route is deployed on sedifexadmin.',
    }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const denied = await assertAdmin(req, 'apply navigation repair');
    if (denied) return denied;

    const body = await req.json().catch(() => ({})) as { apply?: boolean; limit?: number; storeIds?: string[] };
    const limit = limitFrom(body.limit);
    const candidates = await findCandidates(limit);
    const narrowedCandidates = Array.isArray(body.storeIds) && body.storeIds.length > 0
      ? candidates.filter((candidate) => body.storeIds?.includes(candidate.storeId))
      : candidates;

    if (body.apply !== true) {
      return json({
        ok: true,
        mode: 'dry-run',
        message: 'No changes were made because apply was not true.',
        candidatesCount: narrowedCandidates.length,
        candidates: narrowedCandidates.slice(0, 100),
      });
    }

    const updated = await applyRepair(narrowedCandidates);

    return json({
      ok: true,
      mode: 'applied',
      updated,
      message: `Navigation repaired for ${updated} store setting documents.`,
      candidates: narrowedCandidates.slice(0, 100),
    });
  } catch (error) {
    console.error('[navigation-repair] POST failed', error);
    return json({
      ...errorPayload(error, 'Navigation repair apply failed.'),
      hint: 'If you used browser console fetch, inspect the Response text. This endpoint now always returns JSON.',
    }, 500);
  }
}
