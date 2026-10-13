/**
 * The creation-flow suites this repo's README calls out as deliberately
 * separate (`tests/new-button`, `tests/calendar-planning`, `tests/conversion`,
 * `tests/crm`) — each with its own entry point, its own failure modes, and
 * its own known flakiness profile against the shared MyRent test
 * environment. Described here as data, not code, so the CLI/report layers
 * can talk about "the suites" without hard-coding any one of them.
 */
export interface SanitySuite {
  /** Stable id used on the CLI (--suite <id>) and in report output. */
  id: 'new-button' | 'calendar-planning' | 'conversion' | 'crm' | 'fine-creation' | 'monthly-rental';
  /** Human-readable name for console/report output. */
  title: string;
  /** Playwright testDir, passed straight through to `playwright test <dir>`. */
  testDir: string;
  /** What this suite actually proves, so a report reader knows why it exists. */
  purpose: string;
  /** Behavior specific to this suite that a reader shouldn't assume carries over to the other two. */
  knownBehavior: string;
}

export const SANITY_SUITES: SanitySuite[] = [
  {
    id: 'new-button',
    title: 'New button (top-nav / list-page entry)',
    testDir: 'multitenant/tests/new-button',
    purpose:
      'A Quotation, Reservation, and Rental Agreement can each be created from scratch via both the top-nav "New" ' +
      'menu and the entity\'s own List page "New" button (Car Class Booked and Pickup/Return Location filled ' +
      'explicitly), plus a known Duplicate-with-Included-Service server crash, reproduced last.',
    knownBehavior:
      'One continuous test/one login (user request, 25 Sep 2026), not seven separate spec files as before — seven ' +
      'test.step() phases in this order: Quotation (List, Menu), Reservation (List, Menu), Rental Agreement (List, ' +
      'Menu), then the Duplicate crash-exploration last, so a real regression in the six coverage steps is never ' +
      'masked by that known, consistently-reproducing bug. Because it is one test, this suite reports FAILED every ' +
      'run for as long as that Duplicate bug exists, regardless of whether the six coverage steps ahead of it ' +
      'passed — check the live log / step list, not just the badge. Rental Agreement steps exhaust every vehicle ' +
      'candidate (Search Available Vehicle radios, then Unlock and Assign) at the fixed Car Class/Location ' +
      "(the instance's rentalAgreementLocation in multitenant/config/instances.json — PMO on testee, user-specified as reliably having available stock) before giving " +
      'up. Nothing here depends on live Calendar state.',
  },
  {
    id: 'calendar-planning',
    title: 'Calendar planning (click-a-cell entry)',
    testDir: 'multitenant/tests/calendar-planning',
    purpose:
      'The same three entities can be created by clicking an available cell on the Calendar, with Car Class, ' +
      'Pickup/Return Location, and dates pre-filled from the cell.',
    knownBehavior:
      'All three creations run as one test in one browser session (user request, 3 Sep 2026 — separate spec files ' +
      'meant a separate visible-browser login per entity). Quotation and Reservation just use whichever cell looks ' +
      "available, no real-availability check; only Rental Agreement needs one — restricted to CDAV at PMO, and it's " +
      'the slowest part by design: it retries the whole calendar-cell-to-form cycle up to 3 times, because an ' +
      'affiliate mismatch can only be discovered after a specific vehicle is picked, not from the calendar view alone.',
  },
  {
    id: 'conversion',
    title: 'Conversion chain (Quotation → Reservation → Rental Agreement)',
    testDir: 'multitenant/tests/conversion',
    purpose:
      'A Quotation can graduate into a Reservation and then a Rental Agreement, carrying Customer, Driver, ' +
      'Reservation Source, and Payment forward at each step instead of re-filling them.',
    knownBehavior:
      'Depends on one vehicle staying genuinely available across all three steps chosen up front. Unlike the other ' +
      'two suites, a failure partway through invalidates the rest of the chain rather than just one test.',
  },
  {
    id: 'crm',
    title: 'CRM customer/driver (CRM > Customers > New)',
    testDir: 'multitenant/tests/crm',
    purpose:
      'A Person Entity Customer with Is Driver ticked can be created from scratch via CRM > Customers > New, ' +
      'filling identity, address, and birth details plus both Driver Information document blocks ' +
      '(license and a second document type) on the Notes/Other Info tab.',
    knownBehavior:
      'Independent of Calendar/vehicle state entirely — no Car Class, Location, or vehicle assignment involved. ' +
      'The City field is deliberately left blank: its autocomplete only matches a fixed municipality list and ' +
      'never returned a match for the non-Italian city used here, confirmed live not to block creation.',
  },
  {
    id: 'fine-creation',
    title: 'Fine Creation (Administration > Fines Management > Fine)',
    testDir: 'multitenant/tests/fine-management',
    purpose:
      'A Fine can be raised against an already-open Rental Agreement via Administration > Fines Management > Fine: ' +
      'the search step matches a real rental by plate + an Infraction Date inside its rental window, then ' +
      '"Infraction details" (Minutes Number, Emission/Notification/Expiration Date, Fine Org, Violated Law, Points ' +
      'Deleted) is filled and submitted.',
    knownBehavior:
      'Picks whichever Rental Agreement is first on the (default "Open") Board RA List rather than one it created ' +
      'itself — any real, currently-open rental works, since only its plate and rental window matter. Selecting a ' +
      'Fine Org auto-fills Issuer Authority Name/City/Address from that organization\'s own record, which is why ' +
      'those required (`*`) fields are never set directly. create() checks the "show" URL as the authoritative ' +
      "success signal and, if that's never reached, reports whatever inline validation text is on screen instead " +
      'of a generic timeout.',
  },
  {
    id: 'monthly-rental',
    title: 'Monthly rental (totals vs Invoice Preview, invoice, close, renew)',
    testDir: 'multitenant/tests/monthly-rental',
    purpose:
      'A Rental Agreement created from Calendar Planning with "Enable monthly Rental" (3 months x 30 days, pickup on the ' +
      '1st of last month, Long Term) keeps the TOTAL(€) on tab 3 equal to the Total Amount in the Invoice Preview at every ' +
      'stage: after creation, after a 10% discount, after Update, after the discount is removed (field emptied, not saved) ' +
      'and, for Administrator, after renewal. It is invoiced and closed (the Return Date is set by clicking in and out of ' +
      'the date picker, not to today), and for Administrator renewed from the Closure tab and invoiced and closed again.',
    knownBehavior:
      'Backdated by design, so the vehicle must be free for the whole period: the Calendar is filtered to the instance\'s ' +
      'class and location and a vehicle is used only if its cell says "Vehicle available" for the whole period (falls back ' +
      'to the 1st of the current month); a vehicle is then assigned with Search Available Vehicle only (never Unlock and ' +
      'Assign). Only offered on testee and rentalplustest. Operator skips the renewal steps (the server refuses the ' +
      'renewal with HTTP 403) and, where the app refuses a 10% discount (rentalplustest, 1 Sep pickup), the discount ' +
      'and discount-removal checks run without one. KNOWN FAILURE: the "discount removed" step fails until the Jira ' +
      'defect is fixed (the Invoice Preview keeps the old discounted total after the Discount % field is emptied); the ' +
      'other steps still run. Stops at any other TOTAL(€) / Invoice Preview mismatch; set ' +
      'SANITY_MONTHLY_CONTINUE_ON_MISMATCH=1 to run the whole flow anyway and fail at the end.',
  },
];
