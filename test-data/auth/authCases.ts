export type AuthRole = 'admin' | 'standard';

export type SyntheticIdentity = Readonly<{
  id: string;
  role: AuthRole;
  passwordEnvironment: 'AUTH_ADMIN_PASSWORD' | 'AUTH_STANDARD_PASSWORD';
}>;

export const identities = {
  admin: { id: 'fixture-admin', role: 'admin', passwordEnvironment: 'AUTH_ADMIN_PASSWORD' },
  standard: { id: 'fixture-standard', role: 'standard', passwordEnvironment: 'AUTH_STANDARD_PASSWORD' },
} as const satisfies Readonly<Record<AuthRole, SyntheticIdentity>>;

export type AuthCase = Readonly<{
  testCaseId: `AUTH_TC_${string}` | `RBAC_TC_${string}`;
  title: string;
  scope: 'AUTHENTICATION' | 'RBAC';
}>;

export const authCases = {
  adminLogin: { testCaseId: 'AUTH_TC_001', title: 'admin login establishes the correct UI and API identity', scope: 'AUTHENTICATION' },
  standardLogin: { testCaseId: 'AUTH_TC_002', title: 'standard login establishes the correct UI and API identity', scope: 'AUTHENTICATION' },
  invalidCredentials: { testCaseId: 'AUTH_TC_003', title: 'invalid credentials do not establish a session', scope: 'AUTHENTICATION' },
  guestAccess: { testCaseId: 'AUTH_TC_004', title: 'guest direct access is rejected by UI and API', scope: 'AUTHENTICATION' },
  logout: { testCaseId: 'AUTH_TC_005', title: 'logout invalidates only its issued session', scope: 'AUTHENTICATION' },
  inMemoryReuse: { testCaseId: 'AUTH_TC_006', title: 'in-memory state reuses one session without authenticating a guest', scope: 'AUTHENTICATION' },
  standardDenied: { testCaseId: 'RBAC_TC_001', title: 'standard user cannot access the admin resource', scope: 'RBAC' },
  adminAllowed: { testCaseId: 'RBAC_TC_002', title: 'admin can access the admin resource', scope: 'RBAC' },
  roleIsolation: { testCaseId: 'RBAC_TC_003', title: 'independent admin and standard sessions retain their roles', scope: 'RBAC' },
} as const satisfies Readonly<Record<string, AuthCase>>;
