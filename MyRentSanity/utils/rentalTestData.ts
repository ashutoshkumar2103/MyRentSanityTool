import { NoMoreVehicleCandidatesError } from '../pages/RentalAgreementPage';
import { optionLabel, type OptionTarget } from './instances';
import {
  RA_LOCATION,
  TEST_CAR_CLASS_BOOKED,
  TEST_CAR_CLASS_BOOKED_FALLBACKS,
  TEST_CUSTOMER,
  TEST_DRIVER1,
  TEST_PAYMENT,
  TEST_RESERVATION_PICKUP,
  TEST_RESERVATION_RETURN,
  TEST_RESERVATION_SOURCE,
} from './testData';

/**
 * ReservationPage and RentalAgreementPage expose the same shape for these
 * fields (structurally, not via inheritance — the two forms are otherwise
 * quite different), so one helper fills either.
 */
interface BookingFormPage {
  selectCustomer(searchTerm: string, option: OptionTarget): Promise<void>;
  selectDriver1(searchTerm: string, option: OptionTarget): Promise<void>;
  selectReservationSource(searchTerm: string, option: OptionTarget): Promise<void>;
  selectPayment(option: OptionTarget | null): Promise<void>;
  selectRentalType(exactLabel: 'Short Term' | 'Long Term'): Promise<void>;
}

/**
 * Rental Type is set right after Customer/Driver1 — all three live on tab
 * "1. Rentals" — and deliberately before Reservation Source (tab "2. Rate")
 * and Payment (tab "4. Pay"), so the whole fill is one forward pass through
 * the tabs. User request (3 Sep 2026): the previous order set Rental Type
 * last, which meant leaving tab 4 to jump BACK to tab 1 (selectRentalType()
 * switches tabs itself) and then forward again to submit — plausibly
 * invalidating whatever Reservation Source/Payment had just set, since a
 * real user filling this form top-to-bottom never goes backward like that.
 * That matches what was actually happening: Create kept silently failing to
 * navigate to a "show" page despite the form looking fully filled.
 */
export async function fillStandardBookingDetails(formPage: BookingFormPage) {
  await formPage.selectCustomer(TEST_CUSTOMER.searchTerm, TEST_CUSTOMER.option);
  await formPage.selectDriver1(TEST_DRIVER1.searchTerm, TEST_DRIVER1.option);
  await formPage.selectRentalType('Short Term');
  await formPage.selectReservationSource(TEST_RESERVATION_SOURCE.searchTerm, TEST_RESERVATION_SOURCE.option);
  await formPage.selectPayment(TEST_PAYMENT?.option ?? null);
}

interface BookingFormPageWithVehicleClass {
  selectCarClassAndLocations(carClassBooked: OptionTarget, pickupLocation: OptionTarget, returnLocation?: OptionTarget): Promise<void>;
}

/**
 * Car Class Booked + Pickup/Return Location — only needed when creating a
 * Reservation or Rental Agreement from scratch (top-nav menu or the entity's
 * own List page's "New" button). The Calendar Planning flow pre-fills all
 * three from the vehicle/day clicked, so it never calls this.
 *
 * Pickup and Return use different labels — confirmed live (25 Sep 2026) that
 * Reservation's own Location Pick-up select is branch-restricted under
 * Operator (just the account's own office, already preselected) the same way
 * Quotation's Pick Up is (see QuotationPage.selectPickupLocation()), while
 * Location Return gets the full list. On testee, reusing one label for both
 * timed out hunting for the Return location in the Pick-up field, which never
 * has it.
 */
export async function fillCarClassAndLocations(formPage: BookingFormPageWithVehicleClass) {
  await formPage.selectCarClassAndLocations(TEST_CAR_CLASS_BOOKED, TEST_RESERVATION_PICKUP, TEST_RESERVATION_RETURN);
}

interface VehicleAssignable {
  assignVehicle(attempt: number, allowUnlockAndAssign?: boolean): Promise<string>;
  createAndGetReferenceId(): Promise<string>;
}

type VehicleAssigningFormPage = BookingFormPageWithVehicleClass & VehicleAssignable;

/**
 * Works through every vehicle candidate assignVehicle() offers for whatever
 * Car Class/Location the form is currently set to, retrying Create on a
 * rejection — a candidate can be turned down at assignment time (Unlock and
 * Assign: "vehicle is busy") or later at Create time (affiliate mismatch);
 * either just means "try the next one," not that the form fill is wrong.
 * Stops once assignVehicle() reports there's genuinely nothing left to try
 * (NoMoreVehicleCandidatesError) rather than an arbitrary attempt cap, so
 * every candidate this Car Class/Location actually offers gets checked.
 * Returns undefined (not a throw) at that point, so callers can decide what
 * "no luck here" means for them — try another Location/Car Class, or fail.
 */
async function createRentalAgreementTryingEachVehicle(formPage: VehicleAssignable, allowUnlockAndAssign = true): Promise<string | undefined> {
  for (let attempt = 0; ; attempt++) {
    try {
      await formPage.assignVehicle(attempt, allowUnlockAndAssign);
      return await formPage.createAndGetReferenceId();
    } catch (error) {
      if (error instanceof NoMoreVehicleCandidatesError) return undefined;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[STEP] Vehicle candidate ${attempt + 1} didn't work out (${message}) — trying the next one`);
    }
  }
}

/**
 * Creates a from-scratch Rental Agreement, always at TEST_CAR_CLASS_BOOKED /
 * RA_LOCATION (CDAV / PMO on testee) — user request (2 Sep 2026), replacing an
 * earlier search across every Car Class Booked option and multiple locations
 * that was timing out entirely rather than reliably finding stock. Still
 * exhausts every vehicle candidate this one Car Class/Location combination
 * offers before giving up.
 */
export async function createRentalAgreementWithAvailableVehicle(formPage: VehicleAssigningFormPage): Promise<string> {
  // Pass 1: Search Available Vehicle only, across every configured Car Class
  // (user request, 7 Oct 2026). Pass 2, only if no class had a free vehicle:
  // back to the first class, this time allowing Unlock and Assign.
  const classes = [TEST_CAR_CLASS_BOOKED, ...TEST_CAR_CLASS_BOOKED_FALLBACKS];
  for (const carClass of classes) {
    await formPage.selectCarClassAndLocations(carClass, RA_LOCATION);
    const referenceId = await createRentalAgreementTryingEachVehicle(formPage, false);
    if (referenceId) return referenceId;
    console.log(`[STEP] No available vehicle for "${optionLabel(carClass)}" at "${optionLabel(RA_LOCATION)}" — trying the next Car Class Booked`);
  }
  console.log(`[STEP] No class had an available vehicle — retrying "${optionLabel(TEST_CAR_CLASS_BOOKED)}" with Unlock and Assign`);
  await formPage.selectCarClassAndLocations(TEST_CAR_CLASS_BOOKED, RA_LOCATION);
  const referenceId = await createRentalAgreementTryingEachVehicle(formPage);
  if (referenceId) return referenceId;
  throw new Error(
    `Could not create a rental agreement — no available vehicle in any of [${classes.map(optionLabel).join(', ')}] at ` +
      `"${optionLabel(RA_LOCATION)}", and Unlock and Assign on "${optionLabel(TEST_CAR_CLASS_BOOKED)}" found none either.`,
  );
}

/**
 * Creates a Rental Agreement converted from a Reservation (see
 * ReservationPage.convertToRentalAgreement()). Car Class Booked and Location
 * are already pre-filled from the conversion chain and deliberately left
 * untouched here — only the vehicle (never carried over — Quotations and
 * Reservations only ever reserve a class, not a specific plate) needs
 * assigning.
 */
export async function createConvertedRentalAgreementWithAvailableVehicle(formPage: VehicleAssignable): Promise<string> {
  const referenceId = await createRentalAgreementTryingEachVehicle(formPage);
  if (!referenceId) {
    throw new Error(
      'Could not create a rental agreement — every vehicle candidate at the pre-filled Car Class/Location was ' +
        'rejected (affiliate mismatch or busy). This is real shared-environment data exhaustion, not a form-fill bug.',
    );
  }
  return referenceId;
}
