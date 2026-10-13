import 'dotenv/config';
import { DEFAULT_INSTANCE_ID, currentInstance, localCredentials } from './instances';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Did you create a .env file from .env.example?`);
  }
  return value;
}

export type Role = 'administrator' | 'operator';

const isDefaultInstance = currentInstance.id === DEFAULT_INSTANCE_ID;

/**
 * testee (the default instance) reads everything from .env, exactly as
 * before instances existed. Any other instance takes its URL and company
 * code from config/instances.json, and its Administrator login from
 * instances.local.json — falling back to .env's MYRENT_USERNAME/PASSWORD,
 * since most instances share the same administrator account.
 */
const adminOverride = isDefaultInstance ? undefined : localCredentials(currentInstance.id, 'administrator');

export const env = {
  baseUrl: isDefaultInstance ? (process.env.MYRENT_BASE_URL ?? currentInstance.baseUrl) : currentInstance.baseUrl,
  username: adminOverride?.username ?? required('MYRENT_USERNAME'),
  password: adminOverride?.password ?? required('MYRENT_PASSWORD'),
  companyCode: isDefaultInstance ? required('MYRENT_COMPANY_CODE') : currentInstance.companyCode,
};

/**
 * Operator credentials are read lazily (only when a run actually selects the
 * Operator role via the automation dashboard's "Run as" dropdown or the CLI's
 * --role flag) so an Administrator-only setup never needs MYRENT_OPERATOR_*
 * filled in at all.
 */
export function credentialsFor(role: Role): { username: string; password: string; companyCode: string } {
  if (role === 'administrator') return env;
  if (!isDefaultInstance) {
    const operator = localCredentials(currentInstance.id, 'operator');
    if (!operator) {
      throw new Error(`No Operator credentials for instance "${currentInstance.id}" — add them to instances.local.json.`);
    }
    return { ...operator, companyCode: currentInstance.companyCode };
  }
  return {
    username: required('MYRENT_OPERATOR_USERNAME'),
    password: required('MYRENT_OPERATOR_PASSWORD'),
    companyCode: process.env.MYRENT_OPERATOR_COMPANY_CODE ?? env.companyCode,
  };
}
