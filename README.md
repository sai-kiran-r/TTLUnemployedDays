# OPT & STEM OPT Unemployment Days Calculator

A free, open-source web application that helps F-1 international students on OPT or STEM OPT track their unemployment days in real time.

**100% client-side — no login, no backend, no data sent anywhere.**

---

## Why This Exists

USCIS strictly limits the number of days you can be unemployed during OPT and STEM OPT:

| Period   | Unemployment Allowance |
|----------|------------------------|
| OPT      | 90 days                |
| STEM OPT | 60 additional days     |
| **Total**| **150 days combined**  |

Unused days from OPT carry forward into your STEM OPT period. Exceeding the limit puts your visa status at risk. This tool makes it easy to know exactly where you stand — in real time.

---

## Features

- **OPT and STEM OPT support** — select your visa type and enter the appropriate EAD dates
- **Dynamic employment history** — add unlimited companies; new rows appear automatically as you fill each one in
- **Carry-forward calculation** — correctly pools unused OPT days into the 150-day combined allowance
- **Real-time results** — updates on every date change, no submit button needed
- **Gap timeline visualization** — horizontal bar chart showing employed periods, gaps, and future EAD window at a glance
- **Status projection** — if currently unemployed, shows the exact date your allowance will run out
- **EAD expiry warning** — flags if your EAD has already expired
- **Color-coded alerts** — green (safe), amber (< 60 days), red (< 30 days or exceeded)
- **Persistent state** — data saved to `localStorage` and restored on page refresh
- **Zero dependencies** — pure HTML, CSS, and vanilla JavaScript; no frameworks, no build step
- **Mobile responsive** — works on phone and desktop

---

## How to Use

### Step 1 — Select Visa Type
Choose **OPT** or **STEM OPT**.

### Step 2 — Enter EAD Dates
Enter the start and end dates printed on your EAD card(s). If you have STEM OPT, enter both your original OPT EAD dates and your STEM OPT EAD dates.

### Step 3 — Enter Employment History
Add each employer's start and end dates in order. If you are currently employed, check **"Currently employed here"** and leave the end date blank. A new employer row appears automatically after each end date is filled.

### Results
The summary panel updates instantly showing:
- Unemployment gap days used in each period
- Days remaining in your allowance
- A visual timeline of your employment vs. gap periods
- A projection of when your allowance would be exhausted if you became unemployed today

---

## Calculation Logic

### What counts as a gap day?
Any calendar day within your EAD validity window that is **not covered** by any employer's employment period. Only days up to and including today are counted — future days within your EAD window are not penalized.

### How carry-forward works

```
OPT days remaining   = 90  − gap days in OPT period
STEM days remaining  = 60  − gap days in STEM period
─────────────────────────────────────────────────────
Total remaining      = 150 − (OPT gap + STEM gap)
```

Unused OPT days automatically extend the pool available during STEM OPT. The combined limit is always 150 days.

### Example

| Period       | EAD Window                  | Gap Used | Allowance | Remaining |
|--------------|-----------------------------|----------|-----------|-----------|
| OPT          | Aug 17, 2023 – Aug 16, 2024 | 21 days  | 90 days   | 69 days   |
| STEM OPT     | Aug 17, 2024 – Aug 16, 2026 | 0 days   | 60 days   | 60 days   |
| **Combined** |                             | **21**   | **150**   | **129**   |

### Edge cases handled

| Scenario | Behavior |
|---|---|
| Employment start = EAD start | No leading gap |
| Adjacent companies (no break) | 0-day gap — no penalty |
| Overlapping company date ranges | Ranges are merged; no double-counting |
| Last company has no end date | Treated as employed through today |
| Gap spans OPT → STEM boundary | Split and assigned to the correct period |
| EAD window entirely in the future | 0 gap days (cannot count future days) |
| Today is past EAD end date | EAD-expired warning shown |

---

## Project Structure

```
├── index.html    — Semantic HTML markup (structure only)
├── styles.css    — All styles and design tokens
├── app.js        — All calculation and rendering logic
├── tests.js      — Test suite (run with Node.js)
└── README.md
```

---

## Running the Tests

The test suite runs in Node.js with no dependencies:

```bash
node tests.js
```

**16 test suites, 31 assertions** covering:

- The canonical user scenario (OPT gap 21 days, STEM gap 0, total remaining 129)
- No employment / full employment / partial employment
- Gaps at start, end, or both
- Overlapping and adjacent employer date ranges
- Currently employed (open end date)
- Future EAD window (not yet started)
- Gap spanning the OPT → STEM boundary
- Single-day gaps
- STEM dates not yet entered

---

## Deploying to GitHub Pages

### One-time setup
1. Push this repository to GitHub
2. Go to **Settings → Pages**
3. Source: `Deploy from a branch` → `main` → `/ (root)`
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`

### Auto-deploy with GitHub Actions (optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - uses: actions/deploy-pages@v4
```

---

## Technical Notes

- **Date arithmetic** — all dates are parsed and stored as UTC midnight (`Date.UTC`) to prevent DST-related off-by-one errors when computing day differences across daylight saving transitions
- **Inclusive end dates** — EAD end dates and employment end dates are treated as the last valid/worked day (inclusive); the code converts them to exclusive ends internally before range math
- **Range merging** — overlapping employment periods are merged via a sort-then-sweep algorithm before gap counting, preventing double-counting of covered days
- **No external libraries** — vanilla JS only; `date-fns` or similar are explicitly not used

---

## Contributing

Pull requests are welcome. Please:

1. Fork the repo and create a feature branch
2. Add or update tests in `tests.js` for any logic changes — run `node tests.js` and confirm all tests pass
3. Keep the zero-dependency constraint (no npm packages, no build step)
4. Open a pull request with a clear description of the change

---

## Disclaimer

This tool is for **informational purposes only**. The calculations are based on publicly available USCIS guidelines but may not reflect the most current rules. Always consult your Designated School Official (DSO) or a qualified immigration attorney before making decisions about your visa status.

---

## License

Released under the [MIT License](LICENSE).

You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of this software for any purpose — personal, academic, or commercial — as long as the original copyright notice and license text are included in all copies or substantial portions of the software.
