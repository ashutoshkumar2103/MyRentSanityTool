import { currentInstance } from './instances';

/**
 * Shared booking test data reused across Quotation, Reservation, and Rental
 * Agreement creation flows — all three forms need the same customer, driver,
 * reservation source, and payment method. The values come from the instance
 * this run targets (config/instances.json, picked by SANITY_INSTANCE — see
 * utils/instances.ts); testee's are the ones these constants always had.
 *
 * Notes that still hold for testee's values:
 * - Driver1's own search (getBusinessPartnerList with
 *   extraInfo=clientiByIdCond1 on Reservation/Rental Agreement) needs a
 *   whole-word match — a partial prefix like "Creat" can silently return zero
 *   results (confirmed live, 26 Aug 2026).
 * - Reservation/RA "Car Class Booked" renders options as "CODE - Model"
 *   rather than Quotation's "CODE / CODE / Model", hence two car class values.
 * - Quotation's Pick Up is branch-restricted (confirmed live, 22 Sep 2026):
 *   it briefly renders a stub "PMO,PALERMO PORTO" entry, then swaps in the
 *   full dash-separated list, while Return always has the full list — so Pick
 *   Up and Return use different locations there.
 * - From-scratch Rental Agreements always use one fixed Car Class/Location
 *   (user request, 2 Sep 2026) rather than searching across many, which was
 *   timing out entirely.
 */
const data = currentInstance.data;

export const TEST_CUSTOMER = data.customer;
export const TEST_DRIVER1 = data.driver1;
export const TEST_RESERVATION_SOURCE = data.reservationSource;
/** null = any Payment Type (see InstanceProfile.data.payment). */
export const TEST_PAYMENT = data.payment;
export const TEST_CAR_CLASS = data.quotationCarClass;
export const TEST_CAR_CLASS_BOOKED = data.carClassBooked;
export const TEST_CAR_CLASS_BOOKED_FALLBACKS = data.carClassBookedFallbacks ?? [];
export const TEST_QUOTATION_PICKUP = data.quotationPickup;
export const TEST_QUOTATION_RETURN = data.quotationReturn;
export const TEST_RESERVATION_PICKUP = data.reservationPickup;
export const TEST_RESERVATION_RETURN = data.reservationReturn;
export const RA_LOCATION = data.rentalAgreementLocation;
export const CALENDAR_CAR_CLASS = data.calendarCarClass;

const RANDOM_FIRST_NAMES = ['Aarav', 'Vivaan', 'Rohan', 'Karan', 'Nikhil', 'Arjun', 'Sanjay', 'Rahul', 'Vikram', 'Aditya'];
const RANDOM_LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Gupta', 'Mehta', 'Singh', 'Reddy', 'Nair', 'Iyer', 'Choudhary'];
const RANDOM_BIRTH_PLACES = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Pune', 'Hyderabad', 'Ahmedabad', 'Jaipur', 'Lucknow'];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * A random date landing 25-60 years before today — comfortably clear of the
 * 18+ requirement (user request, 2 Sep 2026) with room either side, rather
 * than a fixed literal that's the same on every run. Day capped at 28 so it's
 * always valid regardless of which month gets picked.
 */
function randomAdultBirthDate(): string {
  const age = 25 + Math.floor(Math.random() * 36);
  const year = new Date().getFullYear() - age;
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * A from-scratch Customer/Driver record (CRM > Customers > New) — Person
 * Entity with Is Driver ticked, confirmed live (31 Aug 2026) to create
 * successfully with City left blank (its own autocomplete only matches a
 * fixed municipality list and never returned a match for a non-Italian
 * city — not a required field, so leaving it empty is correct, not a gap).
 * firstName/lastName/birthPlace/birthDate are randomized per run (user
 * request, 2 Sep 2026) rather than the same literal every time — evaluated
 * once at module load, so one test run still creates one consistent record.
 */
export const NEW_CUSTOMER_DETAILS = {
  firstName: pickRandom(RANDOM_FIRST_NAMES),
  lastName: pickRandom(RANDOM_LAST_NAMES),
  street: 'MG Road',
  streetNumber: '12',
  countrySearchTerm: 'India',
  country: 'INDIA',
  province: 'Maharashtra',
  postalCode: '400001',
  mobile: '9876543210',
  email: 'test.dogmaystsems@gmail.com',
  birthNationSearchTerm: 'India',
  birthNation: 'INDIA',
  birthDate: randomAdultBirthDate(),
  birthProv: 'Maharashtra',
  birthPlace: pickRandom(RANDOM_BIRTH_PLACES),
};

/**
 * Both "Driver Information" blocks on the Notes/Other Info tab. The first
 * block's Document select defaults to "DRIVER'S LICENSE" on a fresh form —
 * deliberately not set here, see CustomerPage.fillDriverInformation(). The
 * second block's document type is free text (backed by a <datalist>, not a
 * <select>) — confirmed live that "PASSAPORTO" is one of its real options.
 * Issue By on both blocks is a read-only field populated via a "CARGOS"
 * lookup modal (Country only — its City field is silently ignored by the
 * site's own JS unless Country is Italy, confirmed live), so both use the
 * same India selection as the rest of this record rather than a free-text
 * city name, which the site would discard anyway.
 */
export const NEW_CUSTOMER_DRIVER_INFO = {
  licenseNumber: 'DL1234567890',
  licenseType: 'Non-Commercial',
  licenseIssueByCountrySearchTerm: 'India',
  licenseIssueByCountry: 'INDIA',
  licenseReleaseDate: '2024-03-10',
  licenseExpiryDate: '2032-03-10',
  secondDocument: 'PASSAPORTO',
  secondDocumentNumber: 'P1234567',
  secondIssueByCountrySearchTerm: 'India',
  secondIssueByCountry: 'INDIA',
  secondReleaseDate: '2024-06-01',
  secondExpiryDate: '2034-06-01',
};
