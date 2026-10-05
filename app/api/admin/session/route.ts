import { NextResponse } from 'next/server';
import { getAuthenticatedAdminSession } from '../../../../lib/admin-session-server';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getAuthenticatedAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    role: session.role,
    scope: session.scope,
    email: session.email,
    expiresAt: session.expiresAt,
  });
}
