import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '../../../../lib/admin-session';

const CREDENTIALS = {
  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    role: 'super_admin',
    scope: 'platform',
  },
  staff: {
    email: process.env.STAFF_EMAIL,
    password: process.env.STAFF_PASSWORD,
    role: 'support',
    scope: 'store',
  },
} as const;

function configuredAccounts() {
  return Object.values(CREDENTIALS).filter((account) => account.email && account.password);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { email?: string; password?: string; rememberMe?: boolean } | null;
  const email = body?.email?.trim().toLowerCase() || '';
  const password = body?.password || '';
  const rememberMe = body?.rememberMe === true;

  if (!email && !password) {
    return NextResponse.json({ ok: false, code: 'missing_fields', error: 'Enter your admin email and password.' }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ ok: false, code: 'missing_email', error: 'Enter your admin email address.' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ ok: false, code: 'missing_password', error: 'Enter your password.' }, { status: 400 });
  }

  const accounts = configuredAccounts();

  if (accounts.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: 'login_not_configured',
        error: 'Admin login is not configured. Add ADMIN_EMAIL and ADMIN_PASSWORD in the environment settings.',
      },
      { status: 500 },
    );
  }

  const account = accounts.find((item) => item.email?.trim().toLowerCase() === email);

  if (!account) {
    return NextResponse.json(
      {
        ok: false,
        code: 'email_not_found',
        error: 'This email is not allowed to access Sedifex Admin. Check the email address or ask the platform owner to add it.',
      },
      { status: 401 },
    );
  }

  if (password !== account.password) {
    return NextResponse.json(
      {
        ok: false,
        code: 'wrong_password',
        error: 'The password is incorrect. Check the password and try again.',
      },
      { status: 401 },
    );
  }

  const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
  const sessionToken = await createAdminSessionToken({
    role: account.role,
    scope: account.scope,
    email,
    maxAgeSeconds: maxAge,
  });

  const response = NextResponse.json({
    ok: true,
    role: account.role,
    scope: account.scope,
  });

  response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  // Remove the old unsigned authorization cookies. They are no longer trusted.
  response.cookies.set('sedifex_admin_role', '', { path: '/', maxAge: 0 });
  response.cookies.set('sedifex_admin_scope', '', { path: '/', maxAge: 0 });

  return response;
}
