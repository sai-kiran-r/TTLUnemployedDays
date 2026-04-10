/* ─── State ──────────────────────────────────────────────────────────────── */
// All dates are UTC midnight to avoid DST-related off-by-one errors.
const todayDate = (() => {
  const p = new Date().toISOString().slice(0, 10).split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
})();

let visaType = null; // 'opt' | 'stem'
let companies = [{ id: 1, start: '', end: '', current: false }];

/* ─── Date helpers ───────────────────────────────────────────────────────── */
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

function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/* ─── Range math ─────────────────────────────────────────────────────────── */
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
 * Count gap (unemployment) days within [winStart, winEnd).
 * winStart and winEnd are both exclusive-end Date objects (i.e. addDay has
 * already been applied to the raw EAD end date by the caller).
 * Clipped to addDay(today) so future days are never counted as gaps.
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

function buildEmpRanges() {
  const ranges = [];
  for (const c of companies) {
    const s = parseDate(c.start);
    if (!s) continue;
    // Employment end dates are inclusive (last day worked), so convert to exclusive.
    // For currently-employed, coverage extends through today (inclusive) → addDay(today).
    const e = c.current || !c.end ? addDay(todayDate) : addDay(parseDate(c.end));
    if (!e || e <= s) continue;
    ranges.push([s, e]);
  }
  return mergeRanges(ranges);
}

/* ─── Persistence ────────────────────────────────────────────────────────── */
function saveState() {
  try {
    localStorage.setItem('opt_calc_v2', JSON.stringify({
      visaType,
      optStart:  document.getElementById('opt-start').value,
      optEnd:    document.getElementById('opt-end').value,
      stemStart: document.getElementById('stem-start').value,
      stemEnd:   document.getElementById('stem-end').value,
      companies
    }));
  } catch (_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('opt_calc_v2');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.visaType) {
      visaType = s.visaType;
      document.getElementById('radio-' + visaType).checked = true;
      document.getElementById(visaType + '-label').classList.add('selected');
      document.getElementById(visaType + '-label').querySelector('.radio-dot');
      showSections();
    }
    if (s.optStart)  document.getElementById('opt-start').value  = s.optStart;
    if (s.optEnd)    document.getElementById('opt-end').value    = s.optEnd;
    if (s.stemStart) document.getElementById('stem-start').value = s.stemStart;
    if (s.stemEnd)   document.getElementById('stem-end').value   = s.stemEnd;
    if (s.companies && s.companies.length) {
      companies = s.companies;
      renderCompanies();
    }
    updateSteps();
    calculate();
  } catch (_) {}
}

function resetAll() {
  if (!confirm('Reset all entered data?')) return;
  localStorage.removeItem('opt_calc_v2');
  visaType = null;
  companies = [{ id: 1, start: '', end: '', current: false }];
  document.querySelectorAll('.radio-option').forEach(l => l.classList.remove('selected'));
  document.querySelectorAll('input[name="visa"]').forEach(r => r.checked = false);
  ['opt-start', 'opt-end', 'stem-start', 'stem-end'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('ead-section').style.display = 'none';
  document.getElementById('employment-section').style.display = 'none';
  document.getElementById('results-panel').style.display = 'none';
  renderCompanies();
  updateSteps();
}

/* ─── Step progress bar ──────────────────────────────────────────────────── */
function updateSteps() {
  const optS = document.getElementById('opt-start').value;
  const optE = document.getElementById('opt-end').value;

  const step1Done = !!visaType;
  const step2Done = !!(optS && optE);
  const step3Done = companies.some(c => c.start);

  ['1', '2', '3'].forEach((n, i) => {
    const circle = document.getElementById('step-circle-' + n);
    const name   = document.getElementById('step-name-' + n);
    const done = [step1Done, step2Done, step3Done][i];
    const active = [!step1Done, step1Done && !step2Done, step2Done && !step3Done][i];

    circle.className = 'step-circle' + (done ? ' complete' : active ? ' active' : '');
    name.className   = 'step-name'   + (done ? ' complete' : active ? ' active' : '');
    circle.textContent = done ? '✓' : n;
  });

  const line1 = document.getElementById('step-line-1');
  const line2 = document.getElementById('step-line-2');
  if (line1) line1.className = 'step-line' + (step1Done ? ' complete' : '');
  if (line2) line2.className = 'step-line' + (step2Done ? ' complete' : '');
}

/* ─── Section visibility ─────────────────────────────────────────────────── */
function showSections() {
  document.getElementById('ead-section').style.display = 'block';
  document.getElementById('employment-section').style.display = 'block';
  document.getElementById('stem-ead-fields').style.display =
    visaType === 'stem' ? 'block' : 'none';
}

/* ─── Company renderer ───────────────────────────────────────────────────── */
function renderCompanies() {
  const container = document.getElementById('companies-container');
  container.innerHTML = '';

  companies.forEach((c, idx) => {
    const div = document.createElement('div');
    div.className = 'company-block' + (idx === 0 ? '' : ' fade-in');
    div.dataset.id = c.id;

    const letterLabel = String.fromCharCode(65 + idx);

    div.innerHTML = `
      <div class="company-header">
        <div class="company-title">
          <div class="company-num">${idx + 1}</div>
          <span class="label">Company ${letterLabel}</span>
        </div>
        ${idx > 0 ? `<button class="btn-remove" data-idx="${idx}">&#x2715; Remove</button>` : ''}
      </div>
      <div class="company-body">
        <div class="date-grid">
          <div class="field">
            <label>Start Date</label>
            <input type="date" class="c-start" data-idx="${idx}" value="${c.start}" />
          </div>
          <div class="field">
            <label>End Date</label>
            <input type="date" class="c-end" data-idx="${idx}" value="${c.end}"
              ${c.current ? 'disabled' : ''} />
          </div>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" class="c-current" data-idx="${idx}" ${c.current ? 'checked' : ''} />
          Currently employed here
        </label>
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('.c-start').forEach(el => {
    el.addEventListener('change', e => {
      companies[+e.target.dataset.idx].start = e.target.value;
      saveState(); updateSteps(); calculate();
    });
  });

  container.querySelectorAll('.c-end').forEach(el => {
    el.addEventListener('change', e => {
      const idx = +e.target.dataset.idx;
      companies[idx].end = e.target.value;
      addNextIfNeeded(idx);
      saveState(); calculate();
    });
  });

  container.querySelectorAll('.c-current').forEach(el => {
    el.addEventListener('change', e => {
      const idx = +e.target.dataset.idx;
      companies[idx].current = e.target.checked;
      companies[idx].end = '';
      addNextIfNeeded(idx);
      renderCompanies(); saveState(); calculate();
    });
  });

  container.querySelectorAll('.btn-remove').forEach(el => {
    el.addEventListener('click', e => {
      companies.splice(+e.target.dataset.idx, 1);
      renderCompanies(); saveState(); calculate();
    });
  });
}

function addNextIfNeeded(idx) {
  const c = companies[idx];
  if ((c.end || c.current) && idx === companies.length - 1) {
    companies.push({ id: Date.now(), start: '', end: '', current: false });
    renderCompanies();
  }
}

/* ─── Main calculation ───────────────────────────────────────────────────── */
function calculate() {
  if (!visaType) return;

  const optS  = parseDate(document.getElementById('opt-start').value);
  const optE  = parseDate(document.getElementById('opt-end').value);
  const stemS = visaType === 'stem' ? parseDate(document.getElementById('stem-start').value) : null;
  const stemE = visaType === 'stem' ? parseDate(document.getElementById('stem-end').value) : null;

  if (!optS || !optE) {
    document.getElementById('results-panel').style.display = 'none';
    return;
  }

  const empRanges = buildEmpRanges();
  // EAD end dates are inclusive — convert to exclusive before passing to countGapDays.
  const optGap    = countGapDays(optS, addDay(optE), empRanges);
  const stemGap   = (stemS && stemE) ? countGapDays(stemS, addDay(stemE), empRanges) : null;

  const OPT_ALLOWANCE   = 90;
  const STEM_ALLOWANCE  = 60;
  const TOTAL_ALLOWANCE = visaType === 'stem' ? 150 : 90;

  const totalUsed      = optGap + (stemGap ?? 0);
  const optRemaining   = OPT_ALLOWANCE - optGap;
  const stemRemaining  = stemGap !== null ? STEM_ALLOWANCE - stemGap : null;
  const totalRemaining = TOTAL_ALLOWANCE - totalUsed;

  const isCurrentlyEmployed = companies.some(c => c.current || (c.start && !c.end));
  const lastEADEnd = stemE ?? optE;
  const eadExpired = lastEADEnd < todayDate;

  renderMetricTiles({ totalRemaining, totalUsed, TOTAL_ALLOWANCE, isCurrentlyEmployed, lastEADEnd, eadExpired });
  renderBanners(totalRemaining, lastEADEnd, eadExpired);
  renderTable({
    optS, optE, stemS, stemE,
    optGap, stemGap,
    OPT_ALLOWANCE, STEM_ALLOWANCE, TOTAL_ALLOWANCE,
    optRemaining, stemRemaining, totalRemaining,
    lastEADEnd, isCurrentlyEmployed
  });
  renderTimeline({ optS, optE, stemS, stemE, empRanges });

  document.getElementById('results-panel').style.display = 'block';
  document.getElementById('results-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ─── Metric tiles ───────────────────────────────────────────────────────── */
function renderMetricTiles({ totalRemaining, totalUsed, TOTAL_ALLOWANCE, isCurrentlyEmployed, lastEADEnd, eadExpired }) {
  const grid = document.getElementById('metrics-grid');
  const safe = Math.max(0, totalRemaining);

  let tileClass = 'highlight';
  if (eadExpired || safe === 0) tileClass = 'highlight-danger';
  else if (safe < 30) tileClass = 'highlight-danger';
  else if (safe < 60) tileClass = 'highlight-warning';

  const statusLine = eadExpired
    ? 'EAD expired'
    : isCurrentlyEmployed
      ? `Safe until ${fmtDate(lastEADEnd)}`
      : safe > 0
        ? `${safe} days of buffer remaining`
        : 'Limit exceeded';

  grid.innerHTML = `
    <div class="metric-tile ${tileClass}">
      <div class="tile-label">Days Remaining</div>
      <div class="tile-value">${safe}</div>
      <div class="tile-sub">${statusLine}</div>
    </div>
    <div class="metric-tile">
      <div class="tile-label">Days Used</div>
      <div class="tile-value">${totalUsed}</div>
      <div class="tile-sub">Unemployment gap days</div>
    </div>
    <div class="metric-tile">
      <div class="tile-label">Total Allowance</div>
      <div class="tile-value">${TOTAL_ALLOWANCE}</div>
      <div class="tile-sub">${TOTAL_ALLOWANCE === 150 ? 'OPT (90) + STEM (60)' : 'OPT only'}</div>
    </div>
  `;
}

/* ─── Banners ────────────────────────────────────────────────────────────── */
function renderBanners(totalRemaining, lastEADEnd, eadExpired) {
  const div = document.getElementById('banners');
  div.innerHTML = '';

  if (eadExpired) {
    const ago = dateDiff(lastEADEnd, todayDate);
    appendBanner(div, 'danger', '⛔',
      `EAD expired <strong>${ago} day${ago !== 1 ? 's' : ''} ago</strong> on ${fmtDate(lastEADEnd)}. You are no longer in valid OPT/STEM OPT status.`);
  }

  if (!eadExpired) {
    if (totalRemaining <= 0) {
      appendBanner(div, 'danger', '🔴',
        'Unemployment limit <strong>exceeded</strong>. You have used more than the allowed days. Contact your DSO or an immigration attorney immediately.');
    } else if (totalRemaining < 30) {
      appendBanner(div, 'warning', '⚠️',
        `Only <strong>${totalRemaining} days</strong> of unemployment allowance remaining. Seek employment immediately.`);
    } else {
      appendBanner(div, 'success', '✅',
        `You have <strong>${totalRemaining} days</strong> remaining within your allowance. You are within compliance.`);
    }
  }
}

function appendBanner(parent, type, icon, html) {
  parent.insertAdjacentHTML('beforeend', `
    <div class="banner banner-${type}">
      <span class="banner-icon">${icon}</span>
      <span>${html}</span>
    </div>
  `);
}

/* ─── Results table ──────────────────────────────────────────────────────── */
function renderTable(d) {
  const {
    optS, optE, stemS, stemE,
    optGap, stemGap,
    OPT_ALLOWANCE, STEM_ALLOWANCE, TOTAL_ALLOWANCE,
    optRemaining, stemRemaining, totalRemaining,
    lastEADEnd, isCurrentlyEmployed
  } = d;

  const rows = [];

  rows.push({ section: 'OPT Period' });
  rows.push(['EAD Window',           `${fmtDate(optS)} – ${fmtDate(optE)}`]);
  rows.push(['Unemployment Gap',     `${optGap} day${optGap !== 1 ? 's' : ''}`]);
  rows.push(['Allowance',            `${OPT_ALLOWANCE} days`]);
  rows.push(['OPT Days Remaining',   `${Math.max(0, optRemaining)} days`]);

  if (visaType === 'stem' && stemS && stemE) {
    rows.push({ section: 'STEM OPT Period' });
    rows.push(['EAD Window',           `${fmtDate(stemS)} – ${fmtDate(stemE)}`]);
    rows.push(['Unemployment Gap',     `${stemGap} day${stemGap !== 1 ? 's' : ''}`]);
    rows.push(['Allowance',            `${STEM_ALLOWANCE} days`]);
    rows.push(['STEM Days Remaining',  `${Math.max(0, stemRemaining)} days`]);
    rows.push({ section: 'Combined Total (Carry-Forward)' });
  } else {
    rows.push({ section: 'Summary' });
  }

  const safe = Math.max(0, totalRemaining);
  rows.push({ total: true, cells: ['Total Days Remaining', `${safe} / ${TOTAL_ALLOWANCE} days`] });

  // Projection
  const projDate = new Date(todayDate);
  projDate.setDate(projDate.getDate() + Math.max(0, totalRemaining));

  rows.push(['EAD Expires On', fmtDate(lastEADEnd)]);

  if (isCurrentlyEmployed) {
    rows.push(['Employment Status', `Currently employed — compliant until ${fmtDate(lastEADEnd)}`]);
  } else if (totalRemaining > 0) {
    rows.push(['If Unemployed From Today', `Allowance exhausted on ${fmtDate(projDate)} (${totalRemaining} more days)`]);
  } else {
    rows.push(['Employment Status', 'Unemployment limit exceeded — contact DSO']);
  }

  const table = document.getElementById('results-table');
  table.innerHTML = `
    <thead>
      <tr><th>Field</th><th>Value</th></tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');

  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.section) {
      tr.className = 'section-row';
      tr.innerHTML = `<td colspan="2">${row.section}</td>`;
    } else if (row.total) {
      tr.className = 'total-row';
      tr.innerHTML = `<td>${row.cells[0]}</td><td>${row.cells[1]}</td>`;
    } else {
      tr.innerHTML = `<td>${row[0]}</td><td>${row[1]}</td>`;
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

/* ─── Timeline ───────────────────────────────────────────────────────────── */
function renderTimeline({ optS, optE, stemS, stemE, empRanges }) {
  const container = document.getElementById('timeline-container');
  container.innerHTML = `
    <div class="timeline-heading">Gap Timeline Visualization</div>
    <div class="tl-legend">
      <div class="tl-legend-item">
        <div class="tl-legend-dot" style="background:var(--accent)"></div>Employed
      </div>
      <div class="tl-legend-item">
        <div class="tl-legend-dot" style="background:var(--danger)"></div>Unemployment Gap
      </div>
      <div class="tl-legend-item">
        <div class="tl-legend-dot" style="background:#cbd5e1"></div>Future (not yet counted)
      </div>
    </div>
  `;

  const periods = [{ label: 'OPT Period', start: optS, end: optE }];
  if (stemS && stemE) periods.push({ label: 'STEM OPT Period', start: stemS, end: stemE });

  for (const period of periods) {
    const { label, start, end } = period;
    if (!start || !end || end <= start) continue;

    const totalMs = end - start;
    const row     = document.createElement('div');
    row.className = 'timeline-row';

    const lbl = document.createElement('div');
    lbl.className = 'timeline-label';
    lbl.innerHTML = `
      <span>${label}</span>
      <span>${fmtDate(start)} — ${fmtDate(end)}</span>
    `;
    row.appendChild(lbl);

    const track = document.createElement('div');
    track.className = 'timeline-track';

    // Build segments up to today (inclusive) within this period.
    // addDay(todayDate) gives exclusive-end so today is fully included.
    const effectiveEnd = new Date(Math.min(addDay(end).getTime(), addDay(todayDate).getTime()));
    const clipped = empRanges
      .map(([s, e]) => [Math.max(s, start), Math.min(e, effectiveEnd)])
      .filter(([s, e]) => s < e);
    const merged = mergeRanges(clipped);

    const segments = [];
    let cursor = start;
    for (const [s, e] of merged) {
      if (s > cursor) segments.push({ type: 'gap', start: cursor, end: s });
      segments.push({ type: 'emp', start: s, end: e });
      cursor = e;
    }
    if (cursor < effectiveEnd) segments.push({ type: 'gap', start: cursor, end: effectiveEnd });

    // Future portion (after today, within EAD)
    if (effectiveEnd < end) {
      segments.push({ type: 'future', start: effectiveEnd, end });
    }

    for (const seg of segments) {
      const leftPct  = ((seg.start - start) / totalMs) * 100;
      const widthPct = ((seg.end - seg.start) / totalMs) * 100;
      const bar = document.createElement('div');
      bar.className = `tl-bar tl-${seg.type}`;
      bar.style.left  = leftPct + '%';
      bar.style.width = widthPct + '%';

      const days = dateDiff(seg.start, seg.end);
      const labelText = seg.type === 'emp'
        ? `Employed (${days}d)`
        : seg.type === 'gap'
          ? `Gap: ${days}d`
          : `Future (${days}d)`;

      bar.innerHTML = `<span title="${labelText}">${widthPct > 6 ? labelText : ''}</span>`;
      track.appendChild(bar);
    }

    // Today marker
    if (todayDate > start && todayDate < end) {
      const leftPct = ((todayDate - start) / totalMs) * 100;
      const marker  = document.createElement('div');
      marker.className = 'tl-today';
      marker.style.left = leftPct + '%';
      track.appendChild(marker);
    }

    row.appendChild(track);
    container.appendChild(row);
  }
}

/* ─── Event wiring ───────────────────────────────────────────────────────── */
document.querySelectorAll('input[name="visa"]').forEach(radio => {
  radio.addEventListener('change', () => {
    visaType = radio.value;
    document.querySelectorAll('.radio-option').forEach(l => l.classList.remove('selected'));
    document.getElementById(visaType + '-label').classList.add('selected');
    showSections();
    renderCompanies();
    updateSteps();
    saveState();
    calculate();
  });
});

['opt-start', 'opt-end', 'stem-start', 'stem-end'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    saveState(); updateSteps(); calculate();
  });
});

document.getElementById('btn-reset').addEventListener('click', resetAll);

/* ─── Init ───────────────────────────────────────────────────────────────── */
renderCompanies();
loadState();
