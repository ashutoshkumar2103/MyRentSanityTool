import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Every MyRent instance the sanity suites can run against, and the test data
 * each one needs, lives in config/instances.json — plain JSON so the
 * dashboard server (automation/server.mts, native-Node ESM) can read the same
 * list without importing this Playwright-side module. Adding an instance is a
 * config edit, not a code change.
 *
 * Picked per run by the SANITY_INSTANCE env var (set by the dashboard's
 * "Instance" dropdown / the CLI's --instance flag); defaults to 'testee' so a
 * plain `npm test` behaves exactly as before instances existed.
 *
 * Credentials are NOT in that file — see instances.local.json (gitignored)
 * and utils/env.ts. testee keeps reading everything from .env, unchanged.
 *
 * An option is either a plain label (what testee has always used) or a
 * `{ value, label }` pair: `value` is the option's database id, which is what
 * actually gets selected and verified when present — labels repeat on some
 * instances (esgrenttest has two different "CONTANTI" payments), ids never
 * do. `label` is then only used in log/error messages.
 */
export type OptionTarget = string | { value: string; label: string };

export interface SearchableOption {
  /**
   * Typed into the field's search box. Keep it a single word: a multi-word
   * term gets URL-encoded in the lookup request and no longer matches
   * searchAndSelectViaBlur()'s response filter (formHelpers.ts).
   */
  searchTerm: string;
  option: OptionTarget;
}

export type DateFormat = 'yyyy-MM-dd' | 'dd/MM/yyyy';

export interface InstanceProfile {
  id: string;
  /** Shown in the dashboard dropdown. */
  title: string;
  baseUrl: string;
  /** The webapp's context path — not always /MyRentWeb (e.g. noleggiaretest is /MyRentNoleggiareTest). */
  appPath: string;
  companyCode: string;
  /**
   * Appends `?lang=en` to the login page, which switches the whole session to
   * English (confirmed live, 6 Oct 2026) — every selector and option label in
   * this repo is English, while the customer instances default to Italian.
   * Off for testee, which has always been English.
   */
  forceEnglish: boolean;
  /** How this instance writes dates — Calendar cells' `day` attribute and the Closure tab's Return Date both use it. */
  dateFormat: DateFormat;
  /**
   * Scales playwright.config.ts's expect/action/navigation timeouts (1 =
   * unchanged). The customer instances are noticeably slower than testee —
   * confirmed live (6 Oct 2026): navigations finishing just past the 15s
   * expect window, and giffitest's home page `load` taking over 30s.
   */
  timeoutMultiplier: number;
  /**
   * Whether the conversion suite narrows the Calendar to this instance's RA
   * Car Class/Location before picking its vehicle. Needed on the customer
   * instances under Administrator, who sees every branch's fleet — confirmed
   * live (6 Oct 2026): unfiltered, giffitest picked another branch's vehicle
   * whose RA then couldn't be assigned one, and noleggiaretest found nothing
   * free in its first 19 cells. Some Reservation Sources also only apply to
   * certain classes (esgrenttest's TARIFFA TRATTORI isn't offered for AV).
   */
  filterConversionCalendar: boolean;
  /** The calendar-planning suite's Rental Agreement step narrows the Calendar to the RA Car Class/Location unless this is false (rentalplustest: user request, 7 Oct 2026 — any free vehicle will do). */
  filterRaCalendar?: boolean;
  /** Suite ids NOT offered for this instance (see automation/suiteDefinitions.mts). */
  excludedSuites: string[];
  /** Skip the new-button suite's Duplicate crash-reproduction step (user request, 7 Oct 2026: run it on testee only). */
  skipDuplicateStep?: boolean;
  /** On "There is another open contract for this driver!" at Rental Agreement Create: create a fresh customer/driver in a second tab, swap it into the same form and retry (rentalplustest: user request, 7 Oct 2026). */
  freshDriverOnOpenContract?: boolean;
  /** Set when the profile hasn't been confirmed against the live instance yet — shown in the dashboard. */
  unverified?: string;
  /** Top-nav "MyRent" submenu names and List-page "New" button names, which some instances rename. */
  menu: {
    reservation: string;
    rentalAgreement: string;
    newQuotationButton: string;
    newReservationButton: string;
    newRentalAgreementButton: string;
  };
  data: {
    customer: SearchableOption;
    driver1: SearchableOption;
    reservationSource: SearchableOption;
    /** null = keep whatever Payment the form preselects, or take its first real option. */
    payment: SearchableOption | null;
    /** Quotation's own Car Class select ("CODE / CODE / Model" labels). */
    quotationCarClass: OptionTarget;
    /** Reservation/RA "Car Class Booked" ("CODE - Model" labels). */
    carClassBooked: OptionTarget;
    /**
     * Tried in order after carClassBooked when a from-scratch Rental Agreement
     * finds no free vehicle for it (or Search Available Vehicle shows "No
     * available vehicle") — for instances where stock per class is thin (rentalplustest).
     */
    carClassBookedFallbacks?: OptionTarget[];
    /** Calendar Planning filter's car class ("CODE / Model / CODE" labels). */
    calendarCarClass: OptionTarget;
    /** Quotation Pick Up — searchTerm is typed into its keystroke-filter box. */
    quotationPickup: SearchableOption;
    quotationReturn: SearchableOption;
    /** Reservation (from-scratch) Pick-up / Return. */
    reservationPickup: OptionTarget;
    reservationReturn: OptionTarget;
    /** Rental Agreement (from-scratch) Pick-up and Return, and the Calendar location filter. */
    rentalAgreementLocation: OptionTarget;
  };
}

export const DEFAULT_INSTANCE_ID = 'testee';

const REPO_ROOT = path.resolve(__dirname, '..');

export const INSTANCES: InstanceProfile[] = JSON.parse(readFileSync(path.join(REPO_ROOT, 'config', 'instances.json'), 'utf-8'));

export function findInstance(id: string): InstanceProfile | undefined {
  return INSTANCES.find((instance) => instance.id === id);
}

/** The instance this process runs against — SANITY_INSTANCE, else testee. Throws on an unknown id rather than silently falling back. */
export const currentInstance: InstanceProfile = (() => {
  const id = process.env.SANITY_INSTANCE || DEFAULT_INSTANCE_ID;
  const instance = findInstance(id);
  if (!instance) {
    throw new Error(`Unknown SANITY_INSTANCE "${id}". Valid ids: ${INSTANCES.map((i) => i.id).join(', ')}`);
  }
  return instance;
})();

/** `appPath`-prefixed path, e.g. appUrl('/user/home') → '/MyRentNoleggiareTest/user/home' on noleggiaretest. */
export function appUrl(pathname: string): string {
  return `${currentInstance.appPath}${pathname}`;
}

/** Matches this instance's home page URL. */
export function homeUrlPattern(): RegExp {
  const escaped = currentInstance.appPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}/user/home`);
}

export function formatDate(date: Date, format: DateFormat = currentInstance.dateFormat): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return format === 'dd/MM/yyyy' ? `${dd}/${mm}/${yyyy}` : `${yyyy}-${mm}-${dd}`;
}

export function optionLabel(option: OptionTarget): string {
  return typeof option === 'string' ? option : option.label;
}

type Credentials = { username: string; password: string };
type LocalCredentialsFile = Record<string, { administrator?: Credentials; operator?: Credentials }>;

/**
 * Per-instance credentials from instances.local.json (gitignored), at the
 * repo root. Missing file or entry → undefined, and utils/env.ts falls back to
 * .env.
 */
export function localCredentials(instanceId: string, role: 'administrator' | 'operator'): Credentials | undefined {
  const file = path.join(REPO_ROOT, 'instances.local.json');
  if (!existsSync(file)) return undefined;
  const parsed = JSON.parse(readFileSync(file, 'utf-8')) as LocalCredentialsFile;
  return parsed[instanceId]?.[role];
}
