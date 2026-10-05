import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { repairPublicCatalogForStore } from '../../../../lib/public-catalog-repair';


export async function POST(req: Request) {
  const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin', 'support'] });
  if (!session) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to repair public catalogs.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { storeId?: string } | null;
  const storeId = body?.storeId?.trim();

  if (!storeId) {
    return NextResponse.json({ ok: false, error: 'storeId is required.' }, { status: 400 });
  }

  try {
    const result = await repairPublicCatalogForStore(storeId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unable to repair catalog.' },
      { status: 500 },
    );
  }
}
