# MyRent Sanity — Getting Started for Testers

This guide is for a new tester who just got a copy of this project and needs
to run it — no coding experience required. If you want the full technical
details (how the tests work, page objects, etc.), see `README.md` instead.

## What this is

An automated tool that logs into MyRent and runs a set of sanity checks
(creating Quotations, Reservations, Rental Agreements, Customers/Drivers,
etc.) so you don't have to click through those flows by hand every time.
You control it from a **dashboard in your browser** — no terminal needed
day to day.

## 1. One-time setup

You only need to do this once after you get the project folder.

1. **Install Node.js** (version 22.6 or newer) from https://nodejs.org if you
   don't already have it. Pick the "LTS" installer for Windows.
2. **Open the project folder** in File Explorer, then open a terminal there:
   right-click inside the folder and choose "Open in Terminal" (or "Open
   PowerShell window here").
3. **Install dependencies** — type this and press Enter, then wait for it to
   finish:
   ```
   npm install
   npx playwright install chromium
   ```
4. **Set up your credentials file:**
   - Find the file `.env.example` in the project folder.
   - Make a copy of it in the same folder and rename the copy to `.env`.
   - Open `.env` in Notepad and fill in the real MyRent username/password
     (ask whoever gave you this project if you don't have them). You can
     leave the `MYRENT_OPERATOR_*` lines alone unless you specifically need
     to test as the Operator role.
   - Save and close the file.

That's it for setup — you shouldn't need to touch the terminal again after
this.

## 2. Running the tool day-to-day

1. Double-click **`Start Dashboard.bat`** in the project folder.
2. A black console window opens and, a few seconds later, your browser opens
   automatically to `http://localhost:4400` — that's the dashboard.
3. **Leave the black console window open** in the background while you use
   the dashboard — closing it stops everything. (Ctrl+C in that window also
   stops it.)
4. In the dashboard:
   - Tick which suites you want to run.
   - Pick **Run as**: Administrator or Operator.
   - Optionally turn on "headed" mode if you want to watch the browser do
     the clicking instead of running invisibly.
   - Click **Run**, and watch each suite's status/log update live.

That's the whole workflow — everything else is click-only.

## 3. If something goes wrong

- **Dashboard won't open / errors immediately**: make sure step 1 (`npm
  install` + `npx playwright install chromium`) actually completed without
  errors, and that `.env` exists (not just `.env.example`) with real
  credentials filled in.
- **A single suite fails once**: try running it again before assuming
  something's broken — this shared test environment occasionally has a
  one-off hiccup that clears up on retry (the dashboard's own "Retries"
  option can do this for you automatically).
- **Still stuck**: pass along the log text from the dashboard (or the black
  console window) to whoever gave you this project — it usually points at
  the exact failing step.

## Advanced: scripting instead of the dashboard

If you ever need to run this from a script instead of clicking through the
dashboard, there's a command-line equivalent — see the "Automation" section
of `README.md` for `npm run sanity:auto` and its options. Most testers won't
need this.
