import type { AdminRole, AdminScope } from './admin-access';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from './admin-session';

function cookieValue(req: Request, name: string) {
  return req.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function getAdminRequestSession(req: Request) {
  return verifyAdminSessionToken(cookieValue(req, ADMIN_SESSION_COOKIE));
}

export async function authorizeAdminRequest(
  req: Request,
  {
    roles,
    scopes = ['platform'],
  }: {
    roles: readonly AdminRole[];
    scopes?: readonly AdminScope[];
  },
) {
  const session = await getAdminRequestSession(req);
  if (!session) return null;
  if (!roles.includes(session.role)) return null;
  if (!scopes.includes(session.scope)) return null;
  return session;
}
