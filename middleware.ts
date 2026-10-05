import { NextRequest, NextResponse } from 'next/server';
import { getRoutePolicy } from './lib/admin-access';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from './lib/admin-session';

const LOGIN_PATH = '/admin/login';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/admin') || pathname.startsWith('/admin/api')) {
    return NextResponse.next();
  }

  if (pathname === LOGIN_PATH) return NextResponse.next();

  const session = await verifyAdminSessionToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);

  if (!session) {
    const response = NextResponse.redirect(new URL(LOGIN_PATH, req.url));
    response.cookies.set(ADMIN_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  }

  const policy = getRoutePolicy(pathname);
  if (!policy) return NextResponse.next();

  if (!policy.roles.includes(session.role) || !policy.scopes.includes(session.scope)) {
    return NextResponse.redirect(new URL('/admin', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
