import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SanitySuite } from './suiteDefinitions.mts';

/**
 * The automation layer's view of config/instances.json — just what the CLI
 * and dashboard need to offer an instance and its suites. The test-side
 * loader (utils/instances.ts) reads the same file; it's read directly here
 * rather than imported because that module is Playwright-side CommonJS,
 * which native-Node ESM (this file) can't import named exports from.
 */
export interface InstanceSummary {
  id: string;
  title: string;
  excludedSuites: string[];
  unverified?: string;
}

export const DEFAULT_INSTANCE_ID = 'felirenttestmulti';

const CONFIG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'instances.json');

export function loadInstances(): InstanceSummary[] {
  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as InstanceSummary[];
  return raw.map(({ id, title, excludedSuites, unverified }) => ({ id, title, excludedSuites: excludedSuites ?? [], unverified }));
}

export function suiteAvailableOn(suite: SanitySuite, instance: InstanceSummary): boolean {
  return !instance.excludedSuites.includes(suite.id);
}
