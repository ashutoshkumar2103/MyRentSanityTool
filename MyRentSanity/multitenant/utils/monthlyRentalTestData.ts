import { expect, type Page } from '@playwright/test';
import type { CalendarPage } from '../pages/CalendarPage';
import type { HomePage } from '../pages/HomePage';
import { NoMoreVehicleCandidatesError, type RentalAgreementPage } from '../pages/RentalAgreementPage';
import { formatDate, optionLabel } from './instances';
import { RA_LOCATION, TEST_CUSTOMER, TEST_DRIVER1, TEST_PAYMENT, TEST_RESERVATION_SOURCE } from './testData';

/**
 * Same fields as fillStandardBookingDetails(), but Rental Type is Long Term
 * (user request, 8 Oct 2026: 30+ days is always Long Term). The Calendar
 * carries the 3-month period into the form, so choosing Short Term there, as
 * the standard fill does, only draws "The duration of this reservation is 90
 * days, which is a long term. Do you still want to consider it as short
 * term...?". Kept separate so the other suites' shared fill is not touched.
 */
async function fillMonthlyBookingDetails(formPage: RentalAgreementPage) {
  await formPage.selectCustomer(TEST_CUSTOMER.searchTerm, TEST_CUSTOMER.option);
  await formPage.selectDriver1(TEST_DRIVER1.searchTerm, TEST_DRIVER1.option);
  await formPage.selectRentalType('Long Term');
  await formPage.selectReservationSource(TEST_RESERVATION_SOURCE.searchTerm, TEST_RESERVATION_SOURCE.option);
  await formPage.selectPayment(TEST_PAYMENT?.option ?? null);
}

/** Monthly Rental settings (user request, 7 Oct 2026): 3 months of 30 days each, 10% discount on tab 3. */
export const MONTHLY_RENTAL_MONTHS = 3;
export const MONTHLY_RENTAL_MONTH_DURATION_DAYS = 30;
export const MONTHLY_RENTAL_DISCOUNT_PERCENT = 10;

/** Vehicles tried per pickup date before giving up on it (each is a full calendar-to-Create round trip). */
const MAX_VEHICLE_ATTEMPTS_PER_PICKUP = 6;

/**
 * The first day of the month before today, in this instance's date format —
 * on 7 Oct 2026 that is 1 Sep 2026. A backdated pickup, deliberately: the
 * rental is then already more than a month old when it is closed and renewed.
 */
export function monthlyRentalPickup(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

/** Fallback (user request, 8 Oct 2026): the 1st of the current month — on 8 Oct 2026 that is 1 Oct 2026. */
export function monthlyRentalCurrentMonthPickup(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// The pickup the Rental Agreement was really created with (the fallback one if
// the previous month had no vehicle), so the spec can log the right date.
let usedPickup: Date | null = null;

export function monthlyRentalPickupDate(now = new Date()): string {
  return formatDate(usedPickup ?? monthlyRentalPickup(now), 'yyyy-MM-dd');
}

/** The period's end: pickup + months x days-per-month, which is what Estimated End Date comes to. */
function monthlyRentalEnd(pickup: Date): Date {
  const end = new Date(pickup);
  end.setDate(end.getDate() + MONTHLY_RENTAL_MONTHS * MONTHLY_RENTAL_MONTH_DURATION_DAYS);
  return end;
}

/**
 * On the monthly create form as it stands: puts a vehicle in (Search Available
 * Vehicle for the form's own period — changing the period empties Vehicle, and
 * Create then silently does nothing; Unlock and Assign is never used), then
 * creates. A few Search candidates are tried, the first one is not guaranteed
 * to be accepted (the same XXXX16659 was assigned, and refused, on every attempt
 * — 12 Oct 2026). Throws when none of them works for this period.
 */
async function assignVehicleAndCreate(formPage: RentalAgreementPage, period: Date, firstCandidate: number): Promise<string> {
  let lastError: unknown = new Error('no vehicle candidate was tried');
  for (let candidate = firstCandidate; candidate < firstCandidate + 3; candidate++) {
    try {
      if ((await formPage.raVehicleInput.inputValue()) === '') {
        const assigned = await formPage.assignVehicle(candidate, false);
        console.log(`[STEP] Search Available Vehicle assigned: ${assigned}`);
      }
      const estimatedEnd = await formPage.estimatedEndDate();
      // Create is clicked once and the Show page awaited: the issuing-date prompt
      // is answered "Do not Update" and the save then finishes by itself.
      const id = await formPage.createMonthlyAndGetReferenceId(candidate);
      usedPickup = period;
      console.log(`[STEP] Created ${id} from the Calendar, pickup ${formatDate(period, 'yyyy-MM-dd')} to ${estimatedEnd}`);
      return id;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.log(`[STEP] Vehicle candidate ${candidate + 1} did not work out (${message})`);
      if (error instanceof NoMoreVehicleCandidatesError) break;
    }
  }
  throw lastError;
}

/**
 * Creates a monthly Rental Agreement from Calendar Planning (user request,
 * 8 Oct 2026), not the New button: the Calendar is filtered to the instance's
 * Rental Agreement Car Class and Location, the month of the pickup date is
 * shown, and a vehicle whose cell on the 1st says "Vehicle available" for the
 * whole 3-month period is clicked. "Rental Agreement" in its modal opens the
 * create form with that vehicle, class and locations filled in; then the
 * standard booking details and "Enable monthly Rental" are applied as usual.
 *
 * The 1st of the previous month is tried first and the 1st of the current
 * month only if no vehicle works for it. Unlock and Assign is never used: it
 * can override an existing hold, so it says nothing about availability.
 */
export async function createMonthlyRentalAgreementFromCalendar(
  page: Page,
  homePage: HomePage,
  calendarPage: CalendarPage,
  formPage: RentalAgreementPage,
): Promise<string> {
  const pickups = [monthlyRentalPickup(), monthlyRentalCurrentMonthPickup()];
  for (const [pickupIndex, pickup] of pickups.entries()) {
    const end = monthlyRentalEnd(pickup);
    let nextCellIndex = 0;
    for (let attempt = 1; attempt <= MAX_VEHICLE_ATTEMPTS_PER_PICKUP; attempt++) {
      await homePage.openCalendarPlanningViaMenu();
      await calendarPage.showMonthFilteredToRentalAgreementClassAndLocation(pickup);
      let vehicle: string;
      try {
        const found = await calendarPage.openAvailableVehicleModalForPeriod(pickup, end, nextCellIndex);
        vehicle = found.vehicle;
        nextCellIndex = found.cellIndex + 1;
      } catch (error) {
        console.log(`[STEP] ${error instanceof Error ? error.message : String(error)}`);
        break;
      }

      // One slow or stuck step while filling this form (seen live 9-12 Oct 2026,
      // rentalplustest: the "2. Rate" tab click never settling) is not the end of
      // the test — move on to the next Calendar vehicle, as a failed Create does.
      try {
        await calendarPage.clickRentalAgreement();
        await expect(page).toHaveURL(/\/MRRentalAgreement\/create/);
        await formPage.answerRentalTypePromptsForLongTerm();
        await fillMonthlyBookingDetails(formPage);
        await formPage.enableMonthlyRental(pickup, MONTHLY_RENTAL_MONTHS, MONTHLY_RENTAL_MONTH_DURATION_DAYS);
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        console.log(`[STEP] Filling the form for ${vehicle} did not work out (${message}) — trying the next vehicle (attempt ${attempt}/${MAX_VEHICLE_ATTEMPTS_PER_PICKUP})`);
        continue;
      }
      // This form first for the original pickup; if no vehicle works for that
      // period, the SAME form is moved to the next month (pickup 1st of the next
      // month, drop-off a month later, times unchanged) and Search Available
      // Vehicle is repeated right here — user instruction, 12 Oct 2026 — instead
      // of going back to the Calendar and starting everything again.
      const periods = pickupIndex === 0 ? [pickup, pickups[1]] : [pickup];
      for (const [periodIndex, period] of periods.entries()) {
        try {
          if (periodIndex > 0) {
            console.log(
              `[STEP] No vehicle worked from ${formatDate(pickup, 'yyyy-MM-dd')} on this form — moving the same form to ${formatDate(period, 'yyyy-MM-dd')} ` +
                `(drop-off a month later, times unchanged) and searching for a vehicle here`,
            );
            await formPage.shiftMonthlyPickup(period, MONTHLY_RENTAL_MONTHS, MONTHLY_RENTAL_MONTH_DURATION_DAYS);
          }
          const id = await assignVehicleAndCreate(formPage, period, attempt - 1);
          return id;
        } catch (error) {
          const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
          console.log(`[STEP] ${vehicle}'s form could not be completed for a pickup on ${formatDate(period, 'yyyy-MM-dd')} (${message})`);
        }
      }
      console.log(`[STEP] Trying the next Calendar vehicle (attempt ${attempt}/${MAX_VEHICLE_ATTEMPTS_PER_PICKUP})`);
    }
    if (pickupIndex < pickups.length - 1) {
      console.log(`[STEP] No vehicle worked from ${formatDate(pickup, 'yyyy-MM-dd')} — falling back to ${formatDate(pickups[pickupIndex + 1], 'yyyy-MM-dd')}`);
    }
  }
  throw new Error(
    `Could not create a monthly rental agreement from the Calendar — no vehicle at "${optionLabel(RA_LOCATION)}" worked for a pickup on ` +
      `${pickups.map((p) => formatDate(p, 'yyyy-MM-dd')).join(' or ')} (${MONTHLY_RENTAL_MONTHS} months x ${MONTHLY_RENTAL_MONTH_DURATION_DAYS} days).`,
  );
}
