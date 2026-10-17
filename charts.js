/* Derived values (age/BMI/duration bands, time of day) and the case-activity chart. Hand-built SVG, no libraries. */
(function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const iso = (d) => d.toLocaleDateString('en-CA');
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

  // ------------------------------------------------------------------ derived values
  const Derive = {
    ageYears(d) {
      const v = parseFloat(d.ageValue); if (!(v >= 0)) return null;
      return d.ageUnit === 'm' ? v / 12 : d.ageUnit === 'd' ? v / 365 : v;
    },
    bandFor(bands, value) { if (value == null || isNaN(value)) return ''; const b = bands.find((x) => value < x.below); return b ? b.id : ''; },
    ageBand(d) { return d.ageBand || Derive.bandFor(OPT.ageBands, Derive.ageYears(d)); },
    // Index of the age band, used for the paediatric board targets when no exact age was typed.
    ageBandIndex(d) { const b = Derive.ageBand(d); return OPT.ageBands.findIndex((x) => x.id === b); },
    bmi(d) {
      const w = parseFloat(d.weightKg), h = parseFloat(d.heightCm);
      return w > 0 && h > 0 ? w / Math.pow(h / 100, 2) : null;
    },
    bmiBand(d) { return d.bmiBand || Derive.bandFor(OPT.bmiBands, Derive.bmi(d)); },
    durationBand(d) { return d.durationBand || Derive.bandFor(OPT.durationBands, parseFloat(d.durationMin)); },
    timeOfDay(dateIso, hhmm) {
      const wh = OPT.workingHours; const day = parse(dateIso).getDay();
      if (wh.weekendDays.includes(day)) return 'Weekend / holiday';
      if (!hhmm) return '';
      return hhmm >= wh.start && hhmm < wh.end ? 'In hours' : 'After hours';
    },
  };

  // ------------------------------------------------------------------ dimensions
  const one = (f) => (d) => (d[f] ? [d[f]] : []);
  const typeLabel = (id) => (OPT.types.find((t) => t.id === id) || {}).label || id;
  const DIMS = [
    { id: 'asa', label: 'ASA grade', ordinal: OPT.asa.map((a) => `ASA ${a}`), get: (d) => (d.asa ? [`ASA ${d.asa}`] : []) },
    { id: 'age', label: 'Age range', ordinal: OPT.ageBands.map((b) => b.id), get: (d) => { const b = Derive.ageBand(d); return b ? [b] : []; } },
    { id: 'bmi', label: 'BMI', ordinal: OPT.bmiBands.map((b) => b.id), get: (d) => { const b = Derive.bmiBand(d); return b ? [b] : []; } },
    { id: 'duration', label: 'Duration', ordinal: OPT.durationBands.map((b) => b.id), get: (d) => { const b = Derive.durationBand(d); return b ? [b] : []; } },
    { id: 'timeOfDay', label: 'Time of day', ordinal: OPT.timeOfDay, get: one('timeOfDay') },
    { id: 'gender', label: 'Gender', nominalOrder: OPT.gender, get: one('gender') },
    { id: 'urgency', label: 'Urgency', ordinal: OPT.urgency, get: one('urgency') },
    { id: 'type', label: 'Case type', nominalOrder: OPT.types.map((t) => t.label), get: (d) => (d.type ? [typeLabel(d.type)] : []) },
    { id: 'specialty', label: 'Specialties', get: one('specialty') },
    { id: 'procedure', label: 'Operations', get: (d) => (d.procedure ? [d.procedure.trim()] : []) },
    { id: 'comorbidities', label: 'Comorbidities', multi: true, get: (d) => d.comorbidities || [] },
    { id: 'anaesthesia', label: 'Anaesthesia type', multi: true, get: (d) => d.anaesthesia || [] },
    { id: 'airway', label: 'Airway and equipment', multi: true, get: (d) => [...(d.airway || []), ...(d.laryngoscopy || [])] },
    { id: 'blocks', label: 'Regional blocks', multi: true, get: (d) => d.blocks || [] },
    { id: 'drugsGiven', label: 'Drugs given', multi: true, get: (d) => d.drugsGiven || [] },
    { id: 'complications', label: 'Incidents', multi: true, get: (d) => (d.complications || []).filter((x) => x !== 'None') },
    { id: 'procedures', label: 'Procedures', multi: true, get: (d) => d.procedures || [] },
    { id: 'supervisor', label: 'Supervising doctors', get: one('supervisor') },
    { id: 'surgeon', label: 'Surgeons', get: one('surgeon') },
    { id: 'supervision', label: 'Supervision level', ordinal: OPT.supervision, get: one('supervision') },
  ];

  // ------------------------------------------------------------------ palette (validated, see README)
  const PAL = {
    light: {
      cat: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'],
      other: '#a9a8a1',
      ramp: ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
    },
    dark: {
      cat: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'],
      other: '#6b6a65',
      ramp: ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6'],
    },
  };
  const dark = () => window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches && !matchMedia('print').matches;
  function rampColors(n, pal) {
    if (n === 1) return [pal.ramp[4]];
    return Array.from({ length: n }, (_, i) => pal.ramp[Math.round((i * (pal.ramp.length - 1)) / (n - 1))]);
  }

  // ------------------------------------------------------------------ buckets
  function buckets(period) {
    const now = new Date(); const out = [];
    if (period === 'day') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        out.push({ key: iso(d), short: `${d.getDate()}`, long: `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`, date: d });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push({ key: iso(d).slice(0, 7), short: MON[d.getMonth()], long: `${MON[d.getMonth()]} ${d.getFullYear()}`, date: d });
      }
    }
    return out;
  }
  const bucketKey = (period, dateIso) => (period === 'day' ? dateIso : dateIso.slice(0, 7));

  function niceStep(max) {
    const raw = Math.max(1, max) / 3; const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p; const s = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return Math.max(1, s * p);
  }

  // ------------------------------------------------------------------ chart
  const state = { period: 'month', dim: 'asa', focus: null, sel: null };

  function render(box, allCases) {
    const dim = DIMS.find((d) => d.id === state.dim) || DIMS[0];
    const pal = dark() ? PAL.dark : PAL.light;
    const bks = buckets(state.period);
    const idx = new Map(bks.map((b, i) => [b.key, i]));
    const inWindow = allCases.filter((d) => d.date && idx.has(bucketKey(state.period, d.date)));

    // Series: ordinal dims keep their order; nominal dims take colours from all-time rank so a colour follows its entity.
    const allTime = new Map();
    allCases.forEach((d) => dim.get(d).forEach((v) => allTime.set(v, (allTime.get(v) || 0) + 1)));
    let series; let colors; let otherOn = false;
    if (dim.multi) {
      series = []; colors = [];
    } else if (dim.ordinal) {
      const extra = Array.from(allTime.keys()).filter((k) => !dim.ordinal.includes(k));
      series = dim.ordinal.filter((k) => allTime.has(k)).concat(extra);
      colors = rampColors(series.length, pal);
    } else {
      const ranked = (dim.nominalOrder || []).filter((k) => allTime.has(k))
        .concat(Array.from(allTime.entries()).filter(([k]) => !(dim.nominalOrder || []).includes(k)).sort((a, b) => b[1] - a[1]).map(([k]) => k));
      series = ranked.slice(0, 7); otherOn = ranked.length > 7;
      colors = pal.cat.slice(0, series.length);
    }
    const sIndex = new Map(series.map((s, i) => [s, i]));
    const OTHER = series.length;

    // Count per bucket.
    const n = bks.length; const counts = bks.map(() => new Array(series.length + 1).fill(0));
    const totals = new Map(); let notRecorded = 0; let withValue = 0; const caseTotals = new Array(n).fill(0);
    for (const d of inWindow) {
      const bi = idx.get(bucketKey(state.period, d.date)); caseTotals[bi]++;
      const vals = dim.get(d);
      if (!vals.length) { notRecorded++; continue; }
      withValue++;
      vals.forEach((v) => totals.set(v, (totals.get(v) || 0) + 1));
      if (dim.multi) {
        if (!state.focus || vals.includes(state.focus)) counts[bi][0]++;
      } else {
        const si = sIndex.has(vals[0]) ? sIndex.get(vals[0]) : OTHER; counts[bi][si]++;
      }
    }
    if (dim.multi && state.focus && !totals.has(state.focus)) state.focus = null;
    const stackTotals = counts.map((c) => c.reduce((a, b) => a + b, 0));
    const maxV = Math.max(1, ...stackTotals);
    const step = niceStep(maxV); const yMax = step * Math.ceil(maxV / step);

    // Geometry.
    const W = 340, H = 176, L = 28, R = 6, T = 10, B = 22;
    const pw = W - L - R, ph = H - T - B; const band = pw / n;
    const bw = Math.min(24, Math.max(4, band * (state.period === 'day' ? 0.72 : 0.62)));
    const y = (v) => T + ph - (v / yMax) * ph;

    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(dim.label)} by ${state.period === 'day' ? 'day, last 30 days' : 'month, last 12 months'}">`;
    for (let v = 0; v <= yMax; v += step) {
      svg += `<line class="grid${v === 0 ? ' base' : ''}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="tick" x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`;
    }
    const fillFor = (si) => (dim.multi ? pal.cat[0] : si === OTHER ? pal.other : colors[si]);
    bks.forEach((b, i) => {
      const cx = L + band * i + band / 2; const x = cx - bw / 2;
      const dimmed = state.sel != null && state.sel !== i ? ' dim' : '';
      let yy = y(0); const segs = counts[i].map((v, si) => [v, si]).filter(([v]) => v > 0);
      svg += `<g class="col${dimmed}">`;
      segs.forEach(([v, si], k) => {
        const h = (v / yMax) * ph; const top = k === segs.length - 1; const hh = Math.max(1, h - (top ? 0 : 2));
        const yt = yy - h;
        if (top) {
          const r = Math.min(4, bw / 2, hh);
          svg += `<path fill="${fillFor(si)}" d="M${x} ${yy}V${yt + r}Q${x} ${yt} ${x + r} ${yt}H${x + bw - r}Q${x + bw} ${yt} ${x + bw} ${yt + r}V${yy}Z"/>`;
        } else {
          svg += `<rect fill="${fillFor(si)}" x="${x}" y="${yt + (h - hh)}" width="${bw}" height="${hh}"/>`;
        }
        yy = yt;
      });
      svg += '</g>';
      const showLabel = state.period === 'month' || (n - 1 - i) % 7 === 0;
      if (showLabel) svg += `<text class="tick" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(state.period === 'day' ? `${b.short} ${MON[b.date.getMonth()]}` : b.short)}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${L + band * i}" y="${T}" width="${band}" height="${ph + 4}"><title>${esc(b.long)}: ${stackTotals[i]}</title></rect>`;
    });
    svg += '</svg>';

    // Detail line for the selected column.
    let detail = '';
    if (state.sel != null) {
      const b = bks[state.sel]; const parts = [];
      if (!dim.multi) counts[state.sel].forEach((v, si) => { if (v) parts.push(`${si === OTHER ? 'Other' : series[si]} ${v}`); });
      const what = dim.multi ? (state.focus ? `with ${state.focus}` : `with any ${dim.label.toLowerCase()} recorded`) : '';
      const bits = [`${stackTotals[state.sel]} ${stackTotals[state.sel] === 1 ? 'case' : 'cases'}${what ? ` ${what}` : ''}`];
      if (parts.length) bits.push(parts.join(', '));
      if (!dim.multi && caseTotals[state.sel] !== stackTotals[state.sel]) bits.push(`${caseTotals[state.sel] - stackTotals[state.sel]} not recorded`);
      detail = `<p class="chart-detail"><b>${esc(b.long)}</b>: ${esc(bits.join('. '))}.</p>`;
    } else {
      detail = '<p class="chart-detail muted">Tap a column to see its numbers.</p>';
    }

    // Totals table (the legend and the accessible text view of the chart).
    const windowLabel = state.period === 'day' ? 'last 30 days' : 'last 12 months';
    let table = '';
    if (dim.multi) {
      const rows = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
      table = rows.length ? `<p class="hint">Tap an item to chart it on its own.</p><ul class="legend legend-pick">
        <li><button class="lg-row" data-focus="" aria-pressed="${!state.focus}"><span class="lg-name">Any recorded</span><span class="lg-num">${withValue}</span></button></li>
        ${rows.map(([k, v]) => `<li><button class="lg-row" data-focus="${esc(k)}" aria-pressed="${state.focus === k}"><span class="lg-name">${esc(k)}</span><span class="lg-num">${v}</span><span class="lg-pct">${Math.round((v / Math.max(1, inWindow.length)) * 100)}%</span></button></li>`).join('')}</ul>` : '';
    } else {
      const rows = series.map((s, i) => [s, totals.get(s) || 0, colors[i]]).filter((r) => r[1] > 0);
      if (otherOn) { let o = 0; totals.forEach((v, k) => { if (!sIndex.has(k)) o += v; }); if (o) rows.push(['Other', o, pal.other]); }
      table = rows.length ? `<ul class="legend">${rows.map(([k, v, c]) => `<li><span class="sw" data-c="${c}"></span><span class="lg-name">${esc(k)}</span><span class="lg-num">${v}</span><span class="lg-pct">${Math.round((v / Math.max(1, withValue)) * 100)}%</span></li>`).join('')}</ul>` : '';
    }
    const empty = !inWindow.length ? `<p class="hint">No cases in the ${windowLabel}.</p>` : !withValue ? `<p class="hint">None of these cases has ${esc(dim.label.toLowerCase())} recorded yet.</p>` : '';
    const nr = notRecorded && withValue ? `<p class="hint nr">${notRecorded} ${notRecorded === 1 ? 'case' : 'cases'} without ${esc(dim.label.toLowerCase())} recorded ${dim.multi ? '' : 'are left out of the columns'}.</p>` : '';

    box.innerHTML = `
      <div class="chart-controls">
        <div class="seg" role="group" aria-label="Period">
          <button class="seg-btn" data-period="day" aria-pressed="${state.period === 'day'}">Daily</button>
          <button class="seg-btn" data-period="month" aria-pressed="${state.period === 'month'}">Monthly</button>
        </div>
        <label class="dim-pick"><span class="visually-hidden">Chart by</span>
          <select id="dim-select">${DIMS.map((d) => `<option value="${d.id}" ${d.id === dim.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
      </div>
      <p class="chart-sum"><b>${inWindow.length}</b> ${inWindow.length === 1 ? 'case' : 'cases'} in the ${windowLabel}${dim.multi && state.focus ? `, ${totals.get(state.focus) || 0} with ${esc(state.focus)}` : ''}</p>
      ${svg}
      ${detail}
      ${empty}${table}${nr}`;

    // Swatch colours are set through the DOM (the page's security policy forbids inline style attributes).
    box.querySelectorAll('.sw[data-c]').forEach((s) => { s.style.background = s.dataset.c; });
    box.querySelectorAll('.hit').forEach((h) => {
      const pick = () => { const i = Number(h.dataset.i); state.sel = state.sel === i ? null : i; render(box, allCases); };
      h.addEventListener('click', pick);
    });
    box.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { state.period = b.dataset.period; state.sel = null; render(box, allCases); }));
    box.querySelector('#dim-select').addEventListener('change', (e) => { state.dim = e.target.value; state.focus = null; state.sel = null; render(box, allCases); });
    box.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => { state.focus = b.dataset.focus || null; render(box, allCases); }));
  }

  window.Derive = Derive;
  window.Charts = { render, DIMS };
})();
