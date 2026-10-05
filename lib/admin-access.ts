export const ADMIN_ROLES = [
  'super_admin',
  'ops_admin',
  'store_admin',
  'support',
  'analyst',
  'moderator',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type AdminScope = 'platform' | 'store';

export const ROUTE_ACCESS: Array<{ pattern: RegExp; scopes: AdminScope[]; roles: AdminRole[] }> = [
  { pattern: /^\/admin$/, scopes: ['platform', 'store'], roles: [...ADMIN_ROLES] },
  { pattern: /^\/admin\/tenants/, scopes: ['platform'], roles: ['super_admin', 'ops_admin'] },
  { pattern: /^\/admin\/stores/, scopes: ['platform', 'store'], roles: ['super_admin', 'ops_admin', 'store_admin', 'support'] },
  { pattern: /^\/admin\/client-items/, scopes: ['platform'], roles: ['super_admin', 'ops_admin', 'support'] },
  { pattern: /^\/admin\/bookings/, scopes: ['platform', 'store'], roles: ['super_admin', 'ops_admin', 'store_admin', 'support', 'analyst'] },
  { pattern: /^\/admin\/store-access/, scopes: ['platform'], roles: ['super_admin', 'ops_admin'] },
  { pattern: /^\/admin\/users/, scopes: ['platform'], roles: ['super_admin', 'ops_admin'] },
  { pattern: /^\/admin\/audit-logs/, scopes: ['platform', 'store'], roles: ['super_admin', 'ops_admin', 'analyst', 'moderator'] },
  { pattern: /^\/admin\/integrations\/clients/, scopes: ['platform', 'store'], roles: ['super_admin', 'ops_admin', 'store_admin'] },
  { pattern: /^\/admin\/integrations\/webhooks/, scopes: ['platform', 'store'], roles: ['super_admin', 'ops_admin', 'store_admin', 'support'] },
  { pattern: /^\/admin\/webhooks/, scopes: ['platform', 'store'], roles: ['super_admin', 'ops_admin', 'store_admin', 'support'] },
  { pattern: /^\/admin\/deliveries/, scopes: ['platform', 'store'], roles: ['super_admin', 'ops_admin', 'store_admin', 'support', 'analyst'] },
  { pattern: /^\/admin\/settings/, scopes: ['platform', 'store'], roles: ['super_admin', 'ops_admin', 'store_admin'] },
  { pattern: /^\/admin\/integrations\/deliveries/, scopes: ['platform', 'store'], roles: ['super_admin', 'ops_admin', 'store_admin', 'support', 'analyst'] },
];

export function getRoutePolicy(pathname: string) {
  return ROUTE_ACCESS.find((route) => route.pattern.test(pathname));
}
