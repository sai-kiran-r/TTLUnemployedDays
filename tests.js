/**
 * OPT / STEM OPT Unemployment Calculator — Test Suite
 * Run with:  node tests.js
 *
 * All calculation logic is duplicated here so tests run in Node without a DOM.
 * Today is pinned to 2026-04-10 to match the project's system context.
 */

'use strict';

/* ─── Pinned today (UTC midnight — DST-proof) ────────────────────────────── */
const TODAY_STR = '2026-04-10';
const _tp = TODAY_STR.split('-');
const todayDate = new Date(Date.UTC(+_tp[0], +_tp[1] - 1, +_tp[2]));

/* ─── Calculation helpers (mirror of app.js) ─────────────────────────────── */

/** Parse YYYY-MM-DD as UTC midnight — avoids DST off-by-one errors. */
function parseDate(str) {
  if (!str) return null;
  const p = str.split('-');
  if (p.length !== 3) return null;
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return isNaN(d) ? null : d;
}

/** Return d + 1 day (UTC-safe, always exactly 86 400 000 ms). */
function addDay(d) {
  if (!d) return null;
  return new Date(d.getTime() + 86400000);
}

function dateDiff(a, b) {
  return Math.floor((b - a) / 86400000);
}

function mergeRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [[...sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1]) {
      if (sorted[i][1] > last[1]) last[1] = sorted[i][1];
    } else {
      merged.push([...sorted[i]]);
    }
  }
  return merged;
}

/**
 * winStart / winEnd: exclusive-end Date objects (addDay already applied to
 * inclusive EAD end dates by the caller).
 */
function countGapDays(winStart, winEnd, empRanges) {
  if (!winStart || !winEnd || winEnd <= winStart) return 0;
  const effectiveEnd = new Date(Math.min(winEnd.getTime(), addDay(todayDate).getTime()));
  if (effectiveEnd <= winStart) return 0;

  const clipped = empRanges
    .map(([s, e]) => [Math.max(s, winStart), Math.min(e, effectiveEnd)])
    .filter(([s, e]) => s < e);
  const merged = mergeRanges(clipped);

  const totalDays = dateDiff(winStart, effectiveEnd);
  let covered = 0;
  for (const [s, e] of merged) covered += dateDiff(s, e);
  return Math.max(0, totalDays - covered);
}

/** companies: array of { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', current: bool } */
function buildEmpRanges(companies) {
  const ranges = [];
  for (const c of companies) {
    const s = parseDate(c.start);
    if (!s) continue;
    const e = c.current || !c.end ? addDay(todayDate) : addDay(parseDate(c.end));
    if (!e || e <= s) continue;
    ranges.push([s, e]);
  }
  return mergeRanges(ranges);
}

/** Full calculation returning { optGap, stemGap, totalUsed, totalRemaining } */
function calc({ optStart, optEnd, stemStart, stemEnd, companies }) {
  const optS  = parseDate(optStart);
  const optE  = parseDate(optEnd);
  const stemS = parseDate(stemStart);
  const stemE = parseDate(stemEnd);

  const empRanges = buildEmpRanges(companies);
  const optGap    = countGapDays(optS, addDay(optE), empRanges);
  const stemGap   = (stemS && stemE) ? countGapDays(stemS, addDay(stemE), empRanges) : null;

  const OPT_ALLOWANCE   = 90;
  const STEM_ALLOWANCE  = 60;
  const TOTAL_ALLOWANCE = (stemS && stemE) ? 150 : 90;

  const totalUsed      = optGap + (stemGap ?? 0);
  const optRemaining   = OPT_ALLOWANCE - optGap;
  const stemRemaining  = stemGap !== null ? STEM_ALLOWANCE - stemGap : null;
  const totalRemaining = TOTAL_ALLOWANCE - totalUsed;

  return { optGap, stemGap, totalUsed, totalRemaining, optRemaining, stemRemaining };
}

/* ─── Minimal test framework ─────────────────────────────────────────────── */
let passed = 0;
let failed = 0;
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n  ${name}`);
}

function expect(actual, expected, label) {
  const ok = actual === expected;
  if (ok) {
    console.log(`    \x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`    \x1b[31m✗\x1b[0m ${label}`);
    console.error(`      expected: ${expected}`);
    console.error(`      received: ${actual}`);
    failed++;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   TESTS
═══════════════════════════════════════════════════════════════════════════ */

console.log('\nOPT / STEM OPT Unemployment Calculator — Tests');
console.log('─'.repeat(52));

// ─── Suite 1: User scenario (the canonical reference case) ───────────────
suite('1. User scenario — STEM OPT, 3 companies');
{
  const result = calc({
    optStart:  '2023-08-17',
    optEnd:    '2024-08-16',
    stemStart: '2024-08-17',
    stemEnd:   '2026-08-16',
    companies: [
      { start: '2023-09-05', end: '2024-06-21', current: false }, // Company A
      { start: '2024-06-24', end: '2025-03-16', current: false }, // Company B
      { start: '2025-03-17', end: '2026-04-10', current: false }, // Company C (ends today)
    ],
  });

  // OPT gaps:
  //   Aug 17 – Sep 5, 2023  → 19 days (before Company A)
  //   Jun 22 – Jun 24, 2024 →  2 days (between A and B)
  // Total OPT gap = 21 days
  expect(result.optGap,         21,  'OPT gap = 21 days');
  expect(result.stemGap,         0,  'STEM gap = 0 days (fully employed through today)');
  expect(result.totalUsed,      21,  'Total used = 21 days');
  expect(result.totalRemaining, 129, 'Total remaining = 129 days (150 − 21)');
  expect(result.optRemaining,   69,  'OPT days remaining = 69');
  expect(result.stemRemaining,  60,  'STEM days remaining = 60');
}

// ─── Suite 2: OPT only — no employment at all ────────────────────────────
suite('2. OPT only — no employment (entire window is gap)');
{
  // A completed year in the past: Jan 1 – Dec 31, 2023 = 365 days
  const result = calc({
    optStart: '2023-01-01',
    optEnd:   '2023-12-31',
    companies: [],
  });
  expect(result.optGap, 365, 'Full year with no employment = 365 gap days');
  expect(result.totalRemaining, 90 - 365, 'Total remaining goes negative when limit exceeded');
}

// ─── Suite 3: OPT only — fully employed for entire window ────────────────
suite('3. OPT only — fully employed the whole period');
{
  const result = calc({
    optStart: '2023-01-01',
    optEnd:   '2023-12-31',
    companies: [{ start: '2023-01-01', end: '2023-12-31', current: false }],
  });
  expect(result.optGap, 0, 'Fully employed OPT = 0 gap days');
  expect(result.totalRemaining, 90, 'Total remaining = 90 (none used)');
}

// ─── Suite 4: Gap only at the very start (joined late) ───────────────────
suite('4. OPT only — gap at start, then employed');
{
  // OPT window: Jan 1 – Dec 31, 2023
  // Employment:  Feb 1 – Dec 31, 2023  →  Jan gap = 31 days
  const result = calc({
    optStart: '2023-01-01',
    optEnd:   '2023-12-31',
    companies: [{ start: '2023-02-01', end: '2023-12-31', current: false }],
  });
  expect(result.optGap, 31, 'January gap = 31 days');
  expect(result.totalRemaining, 59, 'Remaining = 90 − 31 = 59');
}

// ─── Suite 5: Gap only at the end (quit before EAD expired) ──────────────
suite('5. OPT only — gap at end, was employed before');
{
  // OPT window: Jan 1 – Dec 31, 2023
  // Employment:  Jan 1 – Nov 30, 2023  →  December gap = 31 days
  const result = calc({
    optStart: '2023-01-01',
    optEnd:   '2023-12-31',
    companies: [{ start: '2023-01-01', end: '2023-11-30', current: false }],
  });
  expect(result.optGap, 31, 'December gap = 31 days');
}

// ─── Suite 6: Gaps at both start and end ─────────────────────────────────
suite('6. OPT only — gaps at both ends');
{
  // Employment: Feb 1 – Nov 30, 2023
  // Start gap (Jan): 31 days  |  End gap (Dec): 31 days  |  Total: 62
  const result = calc({
    optStart: '2023-01-01',
    optEnd:   '2023-12-31',
    companies: [{ start: '2023-02-01', end: '2023-11-30', current: false }],
  });
  expect(result.optGap, 62, 'Jan gap (31) + Dec gap (31) = 62 days');
}

// ─── Suite 7: Overlapping employer dates merge correctly ──────────────────
suite('7. Overlapping employment ranges merge before counting');
{
  // Two overlapping jobs Jan–Jun and Apr–Oct → merged Jan–Oct
  // Window Jan 1 – Dec 31, 2023 (365 days)
  // Covered Jan 1 – Oct 31 (304 days) → Gap Nov 1 – Dec 31 = 61 days
  const result = calc({
    optStart: '2023-01-01',
    optEnd:   '2023-12-31',
    companies: [
      { start: '2023-01-01', end: '2023-06-30', current: false },
      { start: '2023-04-01', end: '2023-10-31', current: false },
    ],
  });
  expect(result.optGap, 61, 'Merged range: Nov+Dec gap = 61 days');
}

// ─── Suite 8: Adjacent employers (no gap between them) ───────────────────
suite('8. Adjacent employers — exactly 0-day gap between them');
{
  // Company A ends Jun 30, Company B starts Jul 1 → no gap
  const result = calc({
    optStart: '2023-01-01',
    optEnd:   '2023-12-31',
    companies: [
      { start: '2023-01-01', end: '2023-06-30', current: false },
      { start: '2023-07-01', end: '2023-12-31', current: false },
    ],
  });
  expect(result.optGap, 0, 'Adjacent companies with no break = 0 gap days');
}

// ─── Suite 9: Currently employed — no open-end gap ───────────────────────
suite('9. Currently employed (open end date)');
{
  // OPT window 2025-01-01 to 2025-12-31, employed since Jan 1 and still working
  const result = calc({
    optStart: '2025-01-01',
    optEnd:   '2025-12-31',
    companies: [{ start: '2025-01-01', end: '', current: true }],
  });
  expect(result.optGap, 0, 'Currently employed through entire OPT window = 0 gap days');
}

// ─── Suite 10: Future EAD (window entirely in the future) ────────────────
suite('10. EAD window entirely in the future');
{
  const result = calc({
    optStart: '2027-01-01',
    optEnd:   '2027-12-31',
    companies: [],
  });
  // effectiveEnd = addDay(today) = Apr 11, 2026 < Jan 1, 2027 → gap = 0
  expect(result.optGap, 0, 'Future EAD window = 0 gap days (cannot count future days)');
}

// ─── Suite 11: Gap spanning OPT → STEM boundary ──────────────────────────
suite('11. Gap spans OPT → STEM boundary — split correctly');
{
  // OPT:  Aug 17, 2023 – Aug 16, 2024
  // STEM: Aug 17, 2024 – Aug 16, 2026
  // Employment: Jan 1, 2024 – Jun 30, 2024  and  Sep 1, 2024 – Dec 31, 2025
  // OPT gaps:
  //   Aug 17, 2023 – Jan 1, 2024  = 137 days
  //   Jul 1, 2024  – Aug 17, 2024 =  47 days  (excl end of OPT window)
  //   OPT total = 184
  // STEM gaps:
  //   Aug 17, 2024 – Sep 1, 2024  =  15 days
  //   Jan 1, 2026  – Apr 11, 2026 = 100 days  (clipped to addDay(today))
  //   STEM total = 115
  const result = calc({
    optStart:  '2023-08-17',
    optEnd:    '2024-08-16',
    stemStart: '2024-08-17',
    stemEnd:   '2026-08-16',
    companies: [
      { start: '2024-01-01', end: '2024-06-30', current: false },
      { start: '2024-09-01', end: '2025-12-31', current: false },
    ],
  });
  expect(result.optGap,  184, 'OPT gap = 137 + 47 = 184 days');
  expect(result.stemGap, 115, 'STEM gap = 15 + 100 = 115 days');
  expect(result.totalUsed, 299, 'Total used = 299 days (limit exceeded)');
}

// ─── Suite 12: Single-day gap between two jobs ────────────────────────────
suite('12. Single-day gap between companies');
{
  // Company A ends Jan 14, Company B starts Jan 16 → Jan 15 is a gap (1 day)
  const result = calc({
    optStart: '2023-01-01',
    optEnd:   '2023-12-31',
    companies: [
      { start: '2023-01-01', end: '2023-01-14', current: false },
      { start: '2023-01-16', end: '2023-12-31', current: false },
    ],
  });
  expect(result.optGap, 1, 'Single gap day (Jan 15) = 1 day');
}

// ─── Suite 13: Employment starts exactly on OPT start date ───────────────
suite('13. Employment starts exactly on OPT start (no leading gap)');
{
  const result = calc({
    optStart: '2023-08-17',
    optEnd:   '2024-08-16',
    companies: [{ start: '2023-08-17', end: '2024-08-16', current: false }],
  });
  expect(result.optGap, 0, 'Employed from day 1 = 0 gap days');
}

// ─── Suite 14: OPT-only carry-forward display (no STEM) ──────────────────
suite('14. OPT only — partial unemployment, check totals');
{
  // Gap: first 30 days of OPT, then employed
  const result = calc({
    optStart: '2024-01-01',
    optEnd:   '2024-12-31',
    companies: [{ start: '2024-01-31', end: '2024-12-31', current: false }],
  });
  // Jan 1–30 gap = 30 days (Jan 31 is first day of work)
  expect(result.optGap, 30, 'First 30 days of OPT unemployed = 30 gap days');
  expect(result.totalRemaining, 60, 'Remaining = 90 − 30 = 60 days');
}

// ─── Suite 15: STEM only filled — OPT filled but no STEM dates ───────────
suite('15. STEM OPT selected but no STEM dates entered');
{
  // No stemStart/stemEnd → stemGap = null, totalAllowance = 90 (OPT only)
  const result = calc({
    optStart:  '2023-08-17',
    optEnd:    '2024-08-16',
    stemStart: null,
    stemEnd:   null,
    companies: [{ start: '2023-10-01', end: '2024-08-16', current: false }],
  });
  // Gap: Aug 17 – Oct 1, 2023 = 45 days
  expect(result.stemGap, null, 'No STEM dates → stemGap is null');
  expect(result.optGap,  45,   'OPT gap = 45 days (Aug 17 – Oct 1)');
}

// ─── Suite 16: Multiple companies in STEM only, no OPT gap ───────────────
suite('16. All unemployment in STEM, OPT fully covered');
{
  const result = calc({
    optStart:  '2023-08-17',
    optEnd:    '2024-08-16',
    stemStart: '2024-08-17',
    stemEnd:   '2026-08-16',
    companies: [
      { start: '2023-08-17', end: '2024-08-16', current: false }, // covers full OPT
      { start: '2024-10-01', end: '2025-12-31', current: false }, // STEM gap Aug–Oct
    ],
  });
  // OPT gap = 0
  // STEM gap: Aug 17 – Oct 1, 2024 = 45 days
  //           Jan 1  – Apr 11, 2026 = 100 days
  // STEM total = 145
  expect(result.optGap,  0,   'OPT fully covered = 0 gap days');
  expect(result.stemGap, 145, 'STEM gap = 45 + 100 = 145 days');
  expect(result.totalUsed, 145, 'Total used = 145 days');
  expect(result.totalRemaining, 5, 'Total remaining = 150 − 145 = 5 days');
}

/* ─── Summary ────────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(52));
const icon = failed === 0 ? '\x1b[32m✓ All tests passed\x1b[0m' : `\x1b[31m✗ ${failed} test(s) failed\x1b[0m`;
console.log(`${icon}  (${passed} passed, ${failed} failed)\n`);
if (failed > 0) process.exit(1);
