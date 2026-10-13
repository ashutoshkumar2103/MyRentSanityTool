# MyRent Sanity Framework

Playwright + TypeScript sanity-test framework for `MyRentWeb`.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # then fill in real credentials
```

## Running

```bash
npm test              # runs the "setup" auth project, then all sanity specs
npm run test:login    # UI login tests only, no stored session (see no-auth project)
npm run test:headed   # same as `npm test` but with a visible browser
npm run test:ui       # Playwright's interactive UI mode
npm run report        # open the last HTML report
npm run sanity:dashboard  # local web dashboard for the creation-flow suites (see "Automation" below)
```

## How auth works

`tests/setup/auth.setup.ts` logs in through the UI once and saves the session
to `playwright/.auth/admin.json` (gitignored). The `sanity` Playwright project
depends on `setup` and reuses that storage state, so individual specs start
already authenticated instead of re-doing the login flow every test.

`tests/sanity/login.spec.ts` is the exception — it runs under the `no-auth`
project and deliberately exercises the login form itself (valid credentials,
invalid password, logout).

### Other user roles (e.g. Operator)

Everything above defaults to the admin account (`admin_clarent`), who can see
and pick from many locations. The automation dashboard/CLI can also run the
whole thing logged in as **Operator** (username `Frances`) — see "Automation"
below for the "Run as" switch. Worth knowing if any spec ends up parametrized
by user/role:

- An Operator is locked to a **single** location (e.g. `PMO - PALERMO PORTO`)
  with a much smaller vehicle pool than admin sees — real availability can be
  genuinely scarce; check more cells/dates before concluding something's
  broken.
- Records created under that location get its own prefix (`PMO-1`, `PMO-2`,
  …) instead of admin's (`CLARENT-…`) — prefix follows location, not role.
- A Rental Agreement created this way didn't hit the affiliate-mismatch
  business rule that trips up admin runs — an Operator's own vehicles are
  presumably already scoped to their own affiliate.

## Layout

```
pages/                  Page Object Model — one file per MyRent page/form
fixtures/               testWithCrashLogging.ts — the test/expect every spec imports
tests/setup/            Auth setup project (produces the stored session)
tests/sanity/           Login/logout/nav sanity specs
tests/new-button/       Creating a Quotation/Reservation/Rental Agreement the "normal" way —
                        top-nav menu "New" or the entity's own List page "New" button
tests/calendar-planning/  Creating a Quotation/Reservation/Rental Agreement from the Calendar
tests/conversion/       Converting a Quotation → Reservation → Rental Agreement
tests/crm/              Creating a Customer/Driver via CRM > Customers > New
tests/fine-management/  Creating a Fine via Administration > Fines Management > Fine
tests/monthly-rental/   Monthly Rental Agreement: tab 3 TOTAL(€) vs Invoice Preview, invoice, close, renew
utils/env.ts            Typed access to .env config
utils/testData.ts       Shared customer/driver/reservation-source/payment test values
utils/formHelpers.ts     Shared "search box → AJAX/filter → select" interaction patterns
utils/quotationTestData.ts / rentalTestData.ts   Fill-sequence helpers per entity type
automation/             Cross-suite sanity runner: web dashboard + CLI — see "Automation" below
playwright.config.ts
```

These six groups (`tests/new-button/`, `tests/calendar-planning/`,
`tests/conversion/`, `tests/crm/`, `tests/fine-management/`, and `tests/monthly-rental/`) are kept in
separate folders deliberately, so any one of them can be run on its own —
e.g. `npx playwright test tests/new-button` — without pulling the others
along for the ride.

### The three entity types and their page objects

MyRent's UI, top-nav labels, and internal code names don't always agree —
worth knowing before reading the page objects:

| Calendar's button label | Top-nav calls it | On-page title says | Page object |
|---|---|---|---|
| Quote/Estimate | Quotation | CREATE QUOTATION | `QuotationPage` |
| Reservation | Rental | CREATE RENTAL | `ReservationPage` |
| Rental Agreement | Board Rental | CREATE BOARD RENTAL | `RentalAgreementPage` |

Each page object is named after the calendar button, since that's the most
specific, unambiguous label MyRent uses for these three.

### Creating "normally" (`tests/new-button/`)

Two entry points per entity, both landing on the same create form and reusing
the same page object:

- top-nav menu: hover **MyRent**, hover the entity's own submenu (Quotation /
  Rental / Board Rental), click **New**
- the entity's own List page: `QuotationListPage` / `ReservationListPage` /
  `RentalAgreementListPage`, each with a `clickNew*()` for its own "New ..."
  button

Unlike the Calendar Planning flow, nothing is pre-filled here — Car Class
Booked and Pickup/Return Location have to be set explicitly
(`fillCarClassAndLocations()` / `RentalAgreementPage.selectCarClassAndLocations()`).
Reservation's and Rental Agreement's own "Car Class Booked" field renders its
options as `"CODE - Model"`, not Quotation's `"CODE / CODE / Model"` — see
`TEST_CAR_CLASS_BOOKED_LABEL` in `utils/testData.ts`.

Rental Agreement additionally requires a real vehicle to be assigned before
Create will accept the form (Quotation/Reservation only ever reserve a class,
never a specific plate — see `RentalAgreementPage.assignVehicle()`'s own
comment for the full explanation). The confirmed order:

1. **Search Available Vehicle** (`#searchVehicle`) — opens a radio-button
   picker of vehicles genuinely free right now at the selected Car
   Class/Location. Try this first.
2. **Unlock and Assign** (`#validateUnlockAssign`) — only if Search Available
   Vehicle has nothing listed. Its dropdown draws from a wider pool (it can
   override an existing hold on a vehicle, hence "unlock"), but can also
   refuse a candidate outright ("vehicle is busy with another rental or
   movement").

A candidate can be rejected at assignment time (the "busy" message above) or
later at Create time (affiliate mismatch — the same data condition
`tests/calendar-planning/calendar-create-rental-agreement.spec.ts` already
retries around). `utils/rentalTestData.ts`'s `createRentalAgreementWithAvailableVehicle()`
wraps both: for each Car Class Booked (read live from the form's own
dropdown, so no class is skipped), it tries `NEW_BUTTON_RA_LOCATIONS` in
order (two locations, user-specified as reliably having stock, rather than
scanning the form's full ~245-location dropdown) and, within each, exhausts
every vehicle candidate on offer before moving on. This shared environment's
actual vehicle pool shifts constantly (busy one run, free the next) and a
couple of specific vehicles are *persistently* affiliate-mismatched rather
than transiently busy — if a run genuinely exhausts every class/location
combo, that's real data exhaustion, not a form-fill bug; widen
`NEW_BUTTON_RA_LOCATIONS` rather than chasing it as a flake.

### Creating from the Calendar (`tests/calendar-planning/`)

`CalendarPage.openAvailableVehicleModalForToday()` clicks a green
("available-looking") cell for today's date and reads the resulting modal's
"Printed Note" to confirm the vehicle is genuinely available — the green
styling is a display hint, not a guarantee, so it keeps trying the next cell
if a given vehicle turns out unavailable.

Rental Agreement adds a further wrinkle: a vehicle can be genuinely
available and still belong to a different company/affiliate than the logged-in
user, which Rental Agreement (unlike Quotation/Reservation) refuses to
continue with. That's real shared-environment data, not a bug, so
`calendar-create-rental-agreement.spec.ts` retries with the next available
vehicle (via `openAvailableVehicleModalForToday(startIndex)`) if that happens,
up to `MAX_VEHICLE_ATTEMPTS`.

### Converting Quotation → Reservation → Rental Agreement (`tests/conversion/`)

MyRent lets a Quotation graduate into a Reservation, and a Reservation into a
Rental Agreement, instead of starting each fresh:

1. **Quotation → Reservation**: `QuotationPage.convertToReservation()` closes
   the "Quote created" modal (its backdrop would otherwise block the click)
   and submits the `id="Reservation"` button on the Quotation's own page,
   landing on a Reservation create form.
2. **Reservation → Rental Agreement**: `ReservationPage.convertToRentalAgreement()`
   does the same for `#transformRA` (tab 1's "New Board RA" — a second,
   identical button, `#transformRA2`, lives on tab 4), landing on a Rental
   Agreement create form that still needs a vehicle assigned (see
   `RentalAgreementPage.assignVehicle()`).

**Customer, Driver, Reservation Source and Payment carry over at every step
— don't re-fill them.** This isn't just unnecessary, it's actively harmful:
Driver1's own search endpoint excludes whatever's *currently* in the Driver1
field from its own results (a sensible "don't suggest a duplicate" rule that
backfires when you're searching to confirm the one already there), so
re-searching for the same already-correct driver comes back empty and hangs
the fill. The spec calls `ReservationPage.selectRentalType()` directly
instead of the shared `fillStandardBookingDetails()` for this reason — Rental
Type is the *only* field that doesn't carry over onto the Reservation, and
nothing needs filling at all on the converted Rental Agreement besides the
vehicle. `createConvertedRentalAgreementWithAvailableVehicle()` in
`utils/rentalTestData.ts` handles that last step, reusing the same
assignVehicle() retry loop as `tests/new-button/` without touching Car
Class/Location (already correct from the conversion).

**A Quotation itself never needs a genuinely available vehicle** — it's an
estimate, not a booking, so it can be created even against a cell whose
Printed Note says "Vehicle not available." Reservation and Rental Agreement
both perform a real booking, though, so **every step of this conversion chain
needs a genuinely available vehicle from the start** — picking an
unavailable-but-clickable cell to seed the Quotation would just fail later at
the Reservation step. Use `CalendarPage.openAvailableVehicleModalForToday()`
(or equivalent) to seed the chain, same as `tests/calendar-planning/` does.

Applies across user types, not just admin — e.g. an Operator role is locked
to a single location with its own, much smaller vehicle pool (see the
"single-location operator" note above); the same "must be genuinely
available end to end" rule holds regardless of who's logged in.

### Creating a Customer/Driver (`tests/crm/`)

`HomePage.openNewCustomerViaMenu()` hovers CRM > Customers and clicks **New**,
landing on `/MRBusinessPartner/create` (`CustomerPage`) — completely
independent of Calendar/vehicle state, unlike the other creation-flow groups.

- **Country and Birth Nation** use a custom autocomplete (not jQuery UI's
  default widget): typing filters a client-side list into a sibling
  `#<fieldId>autocomplete-list` div, and only a real click on the suggestion
  commits the value — setting the input's value directly leaves it looking
  filled but uncommitted. The widget listens for `keypress` specifically, so
  this needs `pressSequentially()`, not `.fill()`. See
  `CustomerPage.selectFromCountryAutocomplete()`.
- **City** has its own version of that same widget, but its match list is a
  fixed municipality set — confirmed live it never returns a match for a
  non-Italian city (tried "Mumbai", "Mum", even a bare "a"). Left blank
  deliberately rather than guessing at a value it might reject — confirmed
  live this doesn't block Create, so it isn't a required field.
- Selecting **Country** resets **Province** and **Postal Code** back to
  empty (confirmed live) — fill those two *after* Country, not before, or
  they'll silently end up blank on the created record.
- The **Notes/Other Info** tab holds two "Driver Information" blocks. The
  first's Document field is a real `<select>` that already defaults to
  "DRIVER'S LICENSE" on a fresh form — left untouched deliberately. The
  second's own "Document" field looks the same but is a free-text input
  backed by a `<datalist>` (`id="document21"`, `list="documents"`), not a
  `<select>` — set it directly with `.fill()`, e.g. `"PASSAPORTO"` (one of
  the datalist's confirmed real options, alongside `"PATENTE"` and `"CARTA
  D'IDENTITA'"`).

### Creating a Fine (`tests/fine-management/`)

`HomePage.openFineManagementFineViaMenu()` hovers Administration > Fines
Management and clicks **Fine**, landing on the Fine List
(`/MyRentWeb/MRFine/index`, `FineListPage`); its **New Fine** link opens the
Create Fine form (`/MyRentWeb/MRFine/create`, `FinePage`) — a search step
followed by a two-tab form, not a plain create form like the other entities.

- **Search Filters first**: Infraction Date + a vehicle plate lookup
  (`getVehicleSearch`, fired on real blur — a synthetic DOM `blur` event does
  *not* trigger it, confirmed live) narrow to one vehicle, then **Search**
  loads the actual create form below, pre-filled from whatever
  Rental/Reservation that vehicle is currently on (Rent Agreement, Customer,
  Driver, on the "General" tab).
- This suite deliberately doesn't create its own Rental Agreement first —
  `RentalAgreementListPage.getFirstRentalSummary()` reads plate + Date
  OUT/Date IN off the first (default "Open" filter) row of the Board RA List
  instead, and the Infraction Date is the midpoint of that window, so any
  real open rental works.
- **"Infraction details"** (the second tab) is where the fine's own data
  goes: Minutes Number, Emission/Notification/Expiration Date, Fine Org,
  Violated Law, Points Deleted. Selecting a **Fine Org** (its own search +
  `getFineOrgList` lookup) auto-fills Issuer Authority Name/City/Address from
  that organization's record — confirmed live — so `FinePage` never sets
  those three required (`*`) fields directly.
- Date fields here (`infractionDate`, `munutesEmissionDate`,
  `minutesNotificationDate`, `expirationDate`) share the same
  bootstrap-datepicker `.date-picker` class as `RentalAgreementPage`'s
  `returnDateInput` — same reasoning applies: written directly via
  `setDateField()` (value + dispatched `input`/`change`), not `.fill()`,
  which focuses the field and can pop the calendar open.
- `FinePage.create()` treats the "show" URL as the authoritative success
  signal, same pattern as the other entities' `createAndGetReferenceId()` —
  if it's never reached, it scrapes whatever inline validation text
  (`.has-error .help-block`, `.alert-danger`) is on screen instead of just
  timing out silently.

## Adding a new page object

1. Add a `pages/XyzPage.ts` extending `BasePage`, with locators discovered via
   `npm run codegen` or the browser devtools (prefer IDs / roles over CSS
   classes — this app's classes are largely Bootstrap/Metronic utility
   classes and not stable selectors).
2. Add specs under `tests/sanity/` using the `sanity` project (authenticated)
   unless the test is specifically about the login flow.
3. Import `test`/`expect` from `fixtures/testWithCrashLogging`, not directly
   from `@playwright/test` — see below.
4. If the form is a multi-tab wizard (Reservation, Rental Agreement, and
   likely others) — check where each field actually lives before wiring it
   up. Fields can be hidden on inactive tabs even though they render fine via
   direct DOM access, which is how earlier exploration missed this: the "Create"
   button itself is often gated to specific tabs too (see `RentalAgreementPage`/
   `ReservationPage`'s `*TabLink` locators and the comment on
   `createAndGetReferenceId()`). Have each `select*()` method switch to its own
   tab first, so callers don't need to fill fields in a tab-friendly order.
5. If a new "type into a box, blur, pick from the refreshed `<select>`" field
   uses `searchAndSelectViaBlur()` (`utils/formHelpers.ts`) and shares its
   endpoint with another field on the same form (Customer and Driver1 both
   hit `getBusinessPartnerList`, for instance) — filling one right after the
   other can resolve the second field's `waitForResponse` on a stray,
   still-in-flight response from the *first* field's own search, so
   `selectOption` runs before the real response has landed. The helper
   already guards against this by matching the response to the request's own
   POST body (the search term), not just the URL — no action needed unless
   you're hitting the same class of race somewhere `waitForResponse` isn't
   already tied to the specific request that triggered it.

## Crash / error logging

Every spec imports `test`/`expect` from `fixtures/testWithCrashLogging.ts`
instead of `@playwright/test` directly. That fixture attaches listeners to
each test's page so a crash or a silent server/JS error shows up as an
obvious, tagged line in the terminal output — useful if you're watching a run
over PuTTY/WinSCP rather than a live browser:

- `[PAGE CRASHED]` — the browser tab's renderer crashed
- `[PAGE ERROR]` — an uncaught JS exception on the page
- `[CONSOLE ERROR]` — the page logged a `console.error`
- `[HTTP 5xx]` — a server error response (e.g. the `/save` POST failing)
- `[REQUEST FAILED]` — a network request that never got a response

`QuotationPage.createAndGetQuotationId()` also logs explicit `[STEP]` /
`[STEP FAILED]` lines around the "Create" click specifically, so if the
success modal never shows up, the log points you straight at the tagged
lines above it for the actual cause instead of just a bare timeout. Follow
the same pattern (`console.log` before a submit-like click, a `[STEP FAILED]`
message in the catch if the expected result doesn't appear) for any future
"Edit"/"Save" actions.

### Transient server-side flakiness — retry before you chase it

This shared, heavily-used legacy server occasionally rejects a step it would
normally accept without throwing anything a Playwright assertion or the crash
fixture above would catch — no `[PAGE ERROR]`, no `[HTTP 5xx]`, nothing.
Example: `preventivi/checkAndAssignNumero` (assigns a Quotation's reference
number when Pickup Location changes) returned `{"status":"N"}` once for a
location that had worked every other time that same session, silently
leaving `#numero` empty and the "Create" click going nowhere. Re-running the
exact same spec against the exact same location a minute later passed
cleanly. If a spec fails with no crash/error line pointing at a real cause,
try it again before assuming the form fill is wrong — this class of failure
has nothing to do with the test code.

### Monthly rental (`tests/monthly-rental/`)

testee and rentalplustest only (the other instances list `monthly-rental` in
`excludedSuites`). Creates a Rental Agreement from scratch with **Enable monthly
Rental** ticked — Month 3, Month Duration 30 — and a pickup on the 1st of the
previous month (1 Sep 2026 when run on 7 Oct 2026), then:

1. Compares tab 3's **TOTAL(€)** (`#totalAmount`) with the **Invoice Preview**
   modal's Total Amount (`#totAmount`) after creation, after typing a 10%
   Discount %, after Update, and again after renewal.
2. Creates the Final Invoice (tab 2), Updates, and closes the movement.
3. Renews the movement from the Closure tab (**Renew Movement** opens
   `#renewMovModal`; "There is some amount to be invoiced…" → Yes → Renew
   Movement again), then invoices and closes the renewed movement.

Things worth knowing:

- The pickup is backdated, so the vehicle must be free for the *whole* period.
  Every Car Class Booked is tried with Search Available Vehicle only — Unlock
  and Assign is never used, it can override a hold and proves nothing about
  availability. On testee only one class (XYAZ, Piaggio Vespa) had stock on
  7 Oct 2026.
- Create raises "issuing date is after the start date… Update / Do not Update /
  Cancel" for a backdated pickup; the suite clicks **Do not Update**.
- Close Movement is a small state machine: it also answers "Do you want to save
  the changes before closing?" (Confirm, then re-fills and re-clicks), the
  "exceeding 30 days… Proceed" warning, and the drop-off location picker.
- **Known mismatch (7 Oct 2026, testee):** after a 10% discount tab 3's TOTAL(€)
  drops (138000.00 → 124200.00, and stays there after Update) but the Invoice
  Preview still shows 138000.00 — its request carries `discountRate=10` yet the
  rows come back with no discount. The suite stops there, as specified. Set
  `SANITY_MONTHLY_CONTINUE_ON_MISMATCH=1` to run the remaining steps anyway;
  the test then still fails at the end, listing every mismatch.

## Automation: cross-suite sanity runner (`automation/`)

A thin layer on top of everything above (not a replacement for `npm test`)
that runs the creation-flow suites (`tests/new-button`,
`tests/calendar-planning`, `tests/conversion`, `tests/crm`,
`tests/fine-management`, `tests/monthly-rental`) as separate `playwright test` invocations — one per
suite, never concurrently — and
reports one combined pass/fail result instead of separate logs to piece
together by hand. Two interfaces sit on the same underlying logic:

- **Dashboard (primary)** — double-click **`Start Dashboard.bat`** in the
  repo root (Windows). It starts the server and opens
  <http://localhost:4400> in your browser automatically — no terminal
  involved at all. (Equivalently: `npm run sanity:dashboard`, then open that
  URL yourself.) Pick which suites to run, a **Run as** role (Administrator or
  Operator), retries / headed mode, and watch each suite's status, spec list,
  and live log update as it runs — the whole day-to-day workflow after that is
  click-only. Leave the console window `Start Dashboard.bat` opens running in
  the background; closing it stops the dashboard.
- **CLI (scripting)** — `npm run sanity:auto`, for scripting or piping
  results into something else:

  ```bash
  npm run sanity:auto                          # all suites, as administrator
  npm run sanity:auto -- --suite new-button    # just one (repeatable)
  npm run sanity:auto -- --role operator       # run logged in as Operator instead
  npm run sanity:auto -- --headed              # visible browser
  npm run sanity:auto -- --json out.json       # also write structured results
  npm run sanity:auto -- --help
  ```

### Running as Administrator or Operator

Both interfaces default to the Administrator account. Picking **Operator**
(dashboard dropdown, or CLI `--role operator`) makes the runner spawn
`playwright test` with `SANITY_RUN_AS=operator` set; `playwright.config.ts`
reads that to pick which credentials `global-setup.ts` logs in with
(`MYRENT_OPERATOR_USERNAME`/`MYRENT_OPERATOR_PASSWORD` — see
`.env.example`) and which storage-state file it writes
(`playwright/.auth/operator.json`, kept separate from admin's
`playwright/.auth/admin.json` so the two never clobber each other). Everything
downstream — suite selection, retries, the "single-location, smaller vehicle
pool" behavior noted above — is otherwise identical; only the logged-in
account changes. `npm test` (no role flag) always runs as Administrator.

### Running against another instance (testee, giffitest, noleggiaretest, …)

Both interfaces default to **testee**, exactly as before. Pick another one
with the dashboard's **Instance** dropdown, or CLI `--instance <id>`; the
runner then spawns `playwright test` with `SANITY_INSTANCE=<id>` set
(`npx playwright test` directly works the same way:
`SANITY_INSTANCE=giffitest SANITY_RUN_AS=operator npx playwright test tests/conversion`).

Where things live:

- `config/instances.json` — one entry per instance: base URL, app path (not
  always `/MyRentWeb` — noleggiaretest is `/MyRentNoleggiareTest`), company
  code, date format (`dd/MM/yyyy` vs testee's `yyyy-MM-dd`), menu/button
  names that differ, suites to hide (`excludedSuites` — Fine Creation is
  testee-only), a `timeoutMultiplier` for slower servers, and the test data
  (customer, driver, reservation source, car class, locations). Options can
  be given as a plain label (testee) or `{ "value": "<db id>", "label": "…" }`
  — the id is what gets selected and checked when present, since labels
  repeat on some instances. `"payment": null` means "any Payment Type".
  `utils/instances.ts` documents every field. Adding an instance is a config
  edit — the dashboard re-reads this file on every page load.
- `instances.local.json` (gitignored; copy `instances.local.example.json`) —
  per-instance logins. Administrator falls back to `.env`'s
  `MYRENT_USERNAME`/`MYRENT_PASSWORD` when an instance has no entry. testee
  keeps reading everything from `.env`.

Per instance, the runner also logs in via `?lang=en` (`forceEnglish`), since
the customer instances default to Italian; keeps its own saved sessions under
`playwright/.auth/<instance>/`; and closes two popups whenever they get in
the way (`fixtures/testWithCrashLogging.ts`): a customer's "Customer Info"
notes, and "There is another open contract for this driver1" (OK). When a
Create is refused by a business-rule popup, the failure names the popup's
own text (e.g. a driver missing e-Invoice Code/Email) instead of a generic
"never reached the show page".

Both interfaces are thin wrappers around a shared, readable API — the actual
run/report logic exists exactly once:

- `automation/suiteDefinitions.mts` — data describing the suites: id,
  `testDir`, and what makes each one different (see the table each suite's
  `knownBehavior` field summarizes, drawn from the sections above).
- `automation/playwrightRunner.mts` — the API: `runSuite()` / `runSuites()`
  spawn `playwright test <dir> --project=sanity --reporter=list,json` per
  suite (the JSON reporter's output is captured to a temp file via
  `PLAYWRIGHT_JSON_OUTPUT_FILE`) and emit a typed `RunEvent` stream
  (`suite-start` / `suite-log` / `suite-attempt-done` / `suite-retry` /
  `suite-done` / `run-done`) via an `onEvent` callback — this is the one
  live-progress API both interfaces consume; neither talks to
  `child_process` or Playwright directly.
- `automation/jsonReport.mts` — flattens Playwright's JSON report into one
  `SpecOutcome` per test, and tags each failure `hasDiagnosedCause: true`
  only if its own output contains one of `testWithCrashLogging`'s tags
  (`[PAGE CRASHED]`, `[PAGE ERROR]`, `[CONSOLE ERROR]`, `[HTTP 5xx]`,
  `[REQUEST FAILED]`) or a `[STEP FAILED]` line.
- `automation/report.mts` — pure text formatting for the CLI
  (`toConsoleSummary`, `toJsonSummary`) — no process/file-system code.
- `automation/sanityCli.mts` — the CLI: argv parsing and wiring, nothing else.
- `automation/server.mts` + `automation/public/index.html` — the dashboard: a
  dependency-free `node:http` server (JSON endpoints plus a `/api/events`
  Server-Sent-Events stream) and a single static page with no build step.

**Auto-retry is deliberately narrow.** A suite is only rerun (up to
`--retries` / the dashboard's "Retries" field, default 1 extra attempt) when
*every* one of its failures came back with `hasDiagnosedCause: false` — i.e.
the exact shared-server flakiness described in ["Transient server-side
flakiness"](#transient-server-side-flakiness--retry-before-you-chase-it)
above. The moment even one failure carries a diagnosed cause, the suite is
reported as failed on the spot and never auto-retried, so a real regression
can't get silently masked by a retry that happens to pass.

This app logs a few tags on essentially every run regardless of pass/fail —
a MIME-type console warning for a datepicker script, and a TinyMCE `r is not
a constructor` page error — and a `[STEP FAILED]` line's own text names the
other tags as a hint to a human reader even when none of them actually fired.
None of these count as a diagnosed cause; `jsonReport.mts`'s
`KNOWN_BENIGN_NOISE_PATTERNS` strips them out before classifying a failure,
so they don't produce false "diagnosed" verdicts that would wrongly skip a
retry worth taking.

These scripts run directly via `node automation/sanityCli.mts` /
`node automation/server.mts` — Node 22.6+ can execute `.mts` TypeScript
natively (type-stripping, no build step), which is why they use the `.mts`
extension rather than `.ts`: this project's `package.json` sets `"type":
"commonjs"`, under which a plain `.ts` file can't use `import`/`export` when
run directly by `node`, but `.mts` is always treated as an ES module
regardless of that setting.

## Environment variables

See `.env.example`. `MYRENT_BASE_URL` defaults to the `testee` environment;
override it to point at another environment without touching code.
`MYRENT_OPERATOR_USERNAME`/`MYRENT_OPERATOR_PASSWORD` are only required if you
actually run as Operator (see "Running as Administrator or Operator" above) —
plain admin-only usage doesn't need them filled in.
