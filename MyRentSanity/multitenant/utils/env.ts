import { currentInstance, localCredentials } from './instances';

export type Role = 'administrator' | 'operator';

/**
 * Multitenant logins come only from multitenant/instances.local.json
 * (gitignored) — never from the tenant-based side's .env — so the two
 * environments cannot pick up each other's credentials.
 */
export function credentialsFor(role: Role): { username: string; password: string; companyCode: string } {
  const credentials = localCredentials(currentInstance.id, role);
  if (!credentials) {
    throw new Error(
      `No ${role === 'operator' ? 'Operator' : 'Administrator'} credentials for multitenant instance "${currentInstance.id}" — add them to multitenant/instances.local.json.`,
    );
  }
  return { ...credentials, companyCode: currentInstance.companyCode };
}

/** Administrator login — kept under the name the shared page objects/tests already use. */
export const env = {
  baseUrl: currentInstance.baseUrl,
  get username() {
    return credentialsFor('administrator').username;
  },
  get password() {
    return credentialsFor('administrator').password;
  },
  companyCode: currentInstance.companyCode,
};
