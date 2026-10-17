/* CaseLog, phone edition. Everything is stored on this device (IndexedDB). No server, no accounts, no outside requests. */
(function () {
  'use strict';

  const APP_VERSION = '2.0';
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLLS = ['cases', 'templates', 'rotations', 'lists'];
  const TYPE = Object.fromEntries(OPT.types.map((t) => [t.id, t]));
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const BACKUP_DAYS = 7;
  const RANGE_LABEL = { all: 'All time', '12m': 'Last 12 months', year: 'This year', custom: 'Custom dates' };

  const state = {
    lastBackup: 0, persisted: null, storageError: false,
    cases: new Map(), templates: new Map(), rotations: new Map(), lists: new Map(),
    view: 'log', filter: 'all', search: '',
    range: 'all', from: '', to: '',
  };

  // ------------------------------------------------------------ utilities
  const today = () => new Date().toLocaleDateString('en-CA');
  const nowHHMM = () => new Date().toTimeString().slice(0, 5);
  const shiftDate = (iso, days) => { const d = parseDate(iso); d.setDate(d.getDate() + days); return d.toLocaleDateString('en-CA'); };
  function parseDate(iso) { const [y, m, d] = (iso || today()).split('-').map(Number); return new Date(y, m - 1, d); }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const live = (coll) => Array.from(state[coll].values()).filter((r) => !r.deleted);
  const liveCases = () => live('cases').map((r) => r.data);
  const has = (arr, v) => Array.isArray(arr) && arr.includes(v);
  const uniq = (arr) => Array.from(new Set(arr));
  const monthsBetween = (a, b) => (a && b ? Math.max(0, (parseDate(b) - parseDate(a)) / 86400000 + 1) / 30.44 : 0);
  const fmt1 = (n) => (Math.round(n * 10) / 10).toString();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  const traineeName = () => ls.get('caselog.name') || '';

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ------------------------------------------------------------ on-device storage
  async function loadLocal() {
    for (const c of COLLS) state[c] = new Map((await Store.getAll(c)).map((r) => [r.id, r]));
    state.lastBackup = await Store.getMeta('lastBackup', 0);
  }

  async function saveRecord(coll, id, data, deleted = false, quiet = false) {
    const prev = state[coll].get(id);
    const rec = { id, data, deleted, updated_at: Math.max(Date.now(), prev ? prev.updated_at + 1 : 0) };
    state[coll].set(id, rec);
    try {
      await Store.put(coll, rec);
    } catch (e) {
      if (prev) state[coll].set(id, prev); else state[coll].delete(id);
      toast('This phone could not save. Check that your iPhone has free storage.');
      throw e;
    }
    if (!quiet) render();
    setBackupPill();
    return rec;
  }

  async function persistStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        state.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
      }
    } catch (e) { state.persisted = null; }
  }

  // ------------------------------------------------------------ backups and exports
  const casesSinceBackup = () => Array.from(state.cases.values()).filter((r) => r.updated_at > state.lastBackup).length;

  function backupStatus() {
    const n = casesSinceBackup();
    const ageDays = state.lastBackup ? (Date.now() - state.lastBackup) / 86400000 : Infinity;
    if (!n) return { status: 'ok', n, ageDays };
    if (ageDays > BACKUP_DAYS) return { status: 'due', n, ageDays };
    return { status: 'pending', n, ageDays };
  }

  function setBackupPill() {
    const pill = $('#backup-pill'); if (!pill) return;
    if (!live('cases').length && !live('rotations').length) { pill.hidden = true; return; }
    const b = backupStatus();
    pill.hidden = false;
    pill.dataset.status = { ok: 'ok', pending: 'offline', due: 'error' }[b.status];
    $('.label', pill).textContent = b.status === 'ok' ? 'Backed up'
      : b.status === 'pending' ? `${b.n} not backed up`
        : state.lastBackup ? `Back up, ${b.n} new` : 'Back up now';
  }

  function lastBackupText() {
    if (!state.lastBackup) return 'You have not backed up yet.';
    const days = Math.floor((Date.now() - state.lastBackup) / 86400000);
    const when = new Date(state.lastBackup).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    return `Last backup ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`} (${when}).`;
  }

  function buildBackup() {
    const out = { format: 'caselog-backup', version: 1, edition: 'phone', exported_at: new Date().toISOString() };
    for (const c of COLLS) out[c] = live(c).map((r) => ({ id: r.id, data: r.data, updated_at: r.updated_at }));
    return out;
  }

  // Share sheet on iPhone ("Save to Files", AirDrop, Mail); a normal download elsewhere.
  // Called straight from a tap, with no waiting in between, so iOS allows the share sheet to open.
  async function shareFile(name, type, text, title) {
    const blob = new Blob([text], { type });
    try {
      const file = new File([blob], name, { type });
      if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title }); return true; } catch (e) {
          if (e && e.name === 'AbortError') return false;
        }
      }
    } catch (e) { /* no File support: download instead */ }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }

  async function backupNow() {
    const text = JSON.stringify(buildBackup());
    const ok = await shareFile(`caselog-backup-${today()}.json`, 'application/json', text, 'CaseLog backup');
    if (!ok) return;
    state.lastBackup = Date.now();
    try { await Store.setMeta('lastBackup', state.lastBackup); } catch (e) { /* the file itself is what matters */ }
    setBackupPill(); render();
    toast('Backup saved');
  }

  async function restoreBackup(e) {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch (err) { data = null; }
    if (!data || data.format !== 'caselog-backup') { toast('That file is not a CaseLog backup.'); return; }
    const nCases = (data.cases || []).length;
    if (!confirm(`Restore ${plural(nCases, 'case', 'cases')} from this backup? It is merged with what is on this phone; where the same case exists, the newer version is kept.`)) return;
    let restored = 0;
    try {
      for (const c of COLLS) {
        const put = [];
        for (const item of data[c] || []) {
          if (!item || typeof item.id !== 'string' || !item.data || typeof item.data !== 'object') continue;
          const ua = Number(item.updated_at) || 0;
          const cur = state[c].get(item.id);
          if (cur && cur.updated_at >= ua) continue;
          const rec = { id: item.id, data: item.data, updated_at: ua, deleted: !!item.deleted };
          state[c].set(rec.id, rec); put.push(rec);
          if (c === 'cases') restored++;
        }
        if (put.length) await Store.putMany(c, put);
      }
    } catch (err) { toast('Restoring stopped part-way. Check free storage and try again.'); render(); return; }
    const exported = Date.parse(data.exported_at) || 0;
    if (exported > state.lastBackup && exported <= Date.now()) {
      state.lastBackup = exported; await Store.setMeta('lastBackup', state.lastBackup).catch(() => {});
    }
    render();
    toast(restored ? `Restored ${plural(restored, 'case', 'cases')}` : 'Nothing new in that backup');
  }

  async function eraseAll() {
    const n = live('cases').length;
    const answer = prompt(`This deletes all ${plural(n, 'case', 'cases')}, templates, rotations and lists from this phone. It cannot be undone, so back up first if you may need them.\n\nType ERASE to confirm.`);
    if ((answer || '').trim().toUpperCase() !== 'ERASE') return;
    await Store.clearAll(); await loadLocal();
    state.view = 'log'; render(); toast('All data erased from this phone');
  }

  // CSV: one row per case, opens in Excel or Numbers.
  const CSV_COLUMNS = [
    ['date', 'Date'], ['timeOfDay', 'Time of day'], ['startTime', 'Start time'], ['type', 'Case type'], ['site', 'Site'],
    ['specialty', 'Specialty'], ['procedure', 'Operation'], ['surgeon', 'Surgeon'], ['urgency', 'Urgency'], ['asa', 'ASA'],
    ['asaE', 'ASA E'], ['gender', 'Gender'], ['ageBand', 'Age range'], ['ageValue', 'Age'], ['ageUnit', 'Age unit'],
    ['weightKg', 'Weight kg'], ['heightCm', 'Height cm'], ['bmiBand', 'BMI range'], ['durationBand', 'Duration'],
    ['durationMin', 'Duration min'], ['comorbidities', 'Comorbidities'], ['supervision', 'Supervision level'],
    ['supervisor', 'Supervising doctor'], ['anaesthesia', 'Anaesthesia'], ['airway', 'Airway'], ['laryngoscopy', 'Laryngoscopy'],
    ['difficultAirway', 'Difficult airway'], ['blocks', 'Nerve blocks'], ['procedures', 'Procedures'], ['drugsGiven', 'Drugs given'],
    ['regularMeds', 'Regular medications and optimisation'], ['allergies', 'Allergies'], ['categories', 'Board categories'],
    ['obstetric', 'Obstetric'], ['icuSupport', 'ICU organ support'], ['icuDiagnosis', 'ICU diagnosis group'],
    ['painSetting', 'Pain setting'], ['complications', 'Incidents'], ['rotation', 'Rotation'], ['teaching', 'Learning point'],
    ['notes', 'Notes'],
  ];
  const medText = (m) => `${m.med || ''}${(m.actions || []).length ? `: ${m.actions.join(', ')}` : ''}${m.note ? ` (${m.note})` : ''}`;
  function csvCell(v) {
    let t;
    if (v == null) t = '';
    else if (typeof v === 'boolean') t = v ? 'Yes' : '';
    else if (Array.isArray(v)) t = v.map((x) => (x && typeof x === 'object' ? medText(x) : String(x))).join('; ');
    else t = String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;            // stop spreadsheets reading text as a formula
    if (/[",\n\r]/.test(t)) t = `"${t.replace(/"/g, '""')}"`;
    return t;
  }
  function buildCsv() {
    const derived = {
      type: (d) => (TYPE[d.type] || {}).label || d.type, ageBand: (d) => Derive.ageBand(d),
      bmiBand: (d) => Derive.bmiBand(d), durationBand: (d) => Derive.durationBand(d),
    };
    const rows = liveCases().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
    const lines = [CSV_COLUMNS.map(([, l]) => csvCell(l)).join(',')];
    for (const d of rows) lines.push(CSV_COLUMNS.map(([k]) => csvCell(derived[k] ? derived[k](d) : d[k])).join(','));
    return `﻿${lines.join('\r\n')}\r\n`;
  }
  const shareCsv = () => shareFile(`caselog-${today()}.csv`, 'text/csv', buildCsv(), 'CaseLog spreadsheet');

  // ------------------------------------------------------------ personal lists
  // Each list = built-in defaults + things you add + everything you have logged before, minus what you removed.
  const LISTS = {
    surgeons: { label: 'Surgeons', defaults: [], sort: 'freq', history: (d) => (d.surgeon ? [d.surgeon] : []) },
    supervisors: { label: 'Supervising doctors', defaults: [], sort: 'freq', history: (d) => (d.supervisor ? [d.supervisor] : []) },
    operations: { label: 'Operations', defaults: [], sort: 'freq', history: (d) => (d.procedure ? [d.procedure.trim()] : []) },
    comorbidities: { label: 'Comorbidities', defaults: OPT.comorbidities, history: (d) => d.comorbidities || [] },
    drugs: { label: 'Drugs given', defaults: OPT.drugs.flatMap((g) => g.items), history: (d) => d.drugsGiven || [] },
    regularMeds: { label: 'Regular medications', defaults: OPT.regularMeds, history: (d) => (d.regularMeds || []).map((m) => m.med) },
    allergies: { label: 'Allergies', defaults: OPT.allergies, history: (d) => d.allergies || [] },
  };

  function listData(key) {
    const r = state.lists.get(`list-${key}`);
    return r && !r.deleted ? r.data : { key, items: [], hidden: [] };
  }

  function candidates(key, filterFn) {
    const L = LISTS[key]; const data = listData(key); const hidden = new Set(data.hidden || []);
    const freq = new Map();
    for (const d of liveCases()) {
      if (filterFn && !filterFn(d)) continue;
      L.history(d).forEach((v) => { if (v) freq.set(v, (freq.get(v) || 0) + 1); });
    }
    const byFreq = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const all = L.sort === 'freq' ? uniq([...byFreq, ...(data.items || [])]) : uniq([...L.defaults, ...(data.items || []), ...byFreq]);
    return all.filter((v) => !hidden.has(v));
  }

  async function addListItem(key, value, quiet) {
    const data = clone(listData(key));
    data.items = data.items || []; data.hidden = (data.hidden || []).filter((x) => x !== value);
    if (!data.items.includes(value) && !LISTS[key].defaults.includes(value)) data.items.push(value);
    await saveRecord('lists', `list-${key}`, data, false, quiet);
  }

  async function hideListItem(key, value) {
    const data = clone(listData(key));
    data.items = (data.items || []).filter((x) => x !== value);
    data.hidden = uniq([...(data.hidden || []), value]);
    await saveRecord('lists', `list-${key}`, data);
  }

  async function restoreListItem(key, value) {
    const data = clone(listData(key));
    data.hidden = (data.hidden || []).filter((x) => x !== value);
    await saveRecord('lists', `list-${key}`, data);
  }

  // ------------------------------------------------------------ install guide (iPhone, in a Safari tab)
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const needsInstall = () => isIOS() && !isStandalone() && ls.get('caselog.browserOK') !== '1';

  $('#use-browser').addEventListener('click', () => { ls.set('caselog.browserOK', '1'); showApp(); });

  function showApp() {
    $('#install').hidden = true; $('#app').hidden = false;
    render();
  }

  // ------------------------------------------------------------ rendering: shell
  const TITLES = { log: 'Logbook', reports: 'Progress', meds: 'Medications', more: 'More' };

  function render() {
    if ($('#app').hidden) return;
    $('#view-title').textContent = TITLES[state.view];
    $$('.tab[data-view]').forEach((t) => t.setAttribute('aria-current', t.dataset.view === state.view ? 'page' : 'false'));
    const v = $('#view');
    if (state.view === 'log') renderLog(v);
    else if (state.view === 'reports') renderReports(v);
    else if (state.view === 'meds') renderMeds(v);
    else renderMore(v);
    setBackupPill();
  }

  $$('.tab[data-view]').forEach((t) => t.addEventListener('click', () => {
    state.view = t.dataset.view; render(); window.scrollTo(0, 0);
  }));
  $('#backup-pill').addEventListener('click', backupNow);
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.view === 'reports') render(); });

  // ------------------------------------------------------------ logbook list
  function caseTitle(d) {
    if (d.procedure) return d.procedure;
    if (d.type === 'icu') return d.icuDiagnosis ? `ICU, ${d.icuDiagnosis.toLowerCase()}` : 'ICU patient';
    if (d.type === 'pain') return d.painSetting || 'Pain review';
    if (d.type === 'obstetric') return d.obstetric || 'Obstetric case';
    return d.specialty || 'Untitled case';
  }

  function ageText(d) {
    if (d.ageValue !== '' && d.ageValue != null) return `${d.ageValue} ${({ y: 'y', m: 'mo', d: 'd' })[d.ageUnit] || 'y'}`;
    return Derive.ageBand(d);
  }

  function caseSub(d) {
    const parts = [];
    if (d.type === 'icu') parts.push(...(d.icuSupport || []).slice(0, 3));
    else parts.push(...(d.anaesthesia || []).slice(0, 2));
    if ((d.blocks || []).length) parts.push(d.blocks.length > 1 ? `${d.blocks.length} blocks` : d.blocks[0]);
    if (has(d.airway, 'ETT') && d.type !== 'icu') parts.push('ETT');
    if (d.asa) parts.push(`ASA ${d.asa}${d.asaE ? 'E' : ''}`);
    const age = ageText(d);
    if (age || d.gender) parts.push([age, d.gender ? d.gender[0] : ''].filter(Boolean).join(' '));
    return parts.join(', ');
  }

  function haystack(d) {
    return [d.procedure, d.specialty, d.notes, d.teaching, d.supervisor, d.surgeon, d.site, d.rotation, d.obstetric, d.icuDiagnosis,
      d.painSetting, ...(d.anaesthesia || []), ...(d.blocks || []), ...(d.procedures || []), ...(d.categories || []),
      ...(d.complications || []), ...(d.icuSupport || []), ...(d.airway || []), ...(d.laryngoscopy || []),
      ...(d.comorbidities || []), ...(d.drugsGiven || []), ...(d.allergies || []), ...(d.regularMeds || []).map((m) => m.med)]
      .join(' ').toLowerCase();
  }

  function sortedCases() {
    return live('cases').sort((a, b) => (b.data.date || '').localeCompare(a.data.date || '') || (b.data.createdAt || 0) - (a.data.createdAt || 0));
  }

  function backupBanner() {
    if (state.storageError) {
      return `<div class="notice notice-danger"><p>This browser is not saving your cases. Open CaseLog from your Home Screen instead.</p></div>`;
    }
    const b = backupStatus();
    if (b.status !== 'due' || live('cases').length < 3) return '';
    const msg = state.lastBackup
      ? `Your last backup was ${Math.floor(b.ageDays)} days ago, and ${plural(b.n, 'case is', 'cases are')} only on this phone.`
      : `Your ${plural(b.n, 'case is', 'cases are')} only on this phone. Save a backup to Files so a lost phone doesn't mean a lost logbook.`;
    return `<div class="notice"><p>${esc(msg)}</p><button class="btn btn-primary btn-sm" data-backup>Back up now</button></div>`;
  }

  function renderLog(v) {
    v.innerHTML = `
      ${backupBanner()}
      <div class="log-tools">
        <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>
          <input type="search" id="search" placeholder="Search procedures, surgeons, drugs, notes" value="${esc(state.search)}" autocomplete="off" aria-label="Search cases"></label>
        <div class="filter-row" role="group" aria-label="Filter by case type">
          <button class="fchip" data-filter="all" aria-pressed="${state.filter === 'all'}">All</button>
          ${OPT.types.map((t) => `<button class="fchip" data-filter="${t.id}" aria-pressed="${state.filter === t.id}"><i class="sw sy-${t.color}"></i>${esc(t.label)}</button>`).join('')}
        </div>
      </div>
      <div id="log-list"></div>`;
    const bb = $('[data-backup]', v); if (bb) bb.addEventListener('click', backupNow);
    $('#search', v).addEventListener('input', (e) => { state.search = e.target.value; renderLogList(); });
    $$('.fchip', v).forEach((b) => b.addEventListener('click', () => {
      state.filter = b.dataset.filter;
      $$('.fchip', v).forEach((x) => x.setAttribute('aria-pressed', x === b));
      renderLogList();
    }));
    renderLogList();
  }

  function renderLogList() {
    const box = $('#log-list'); if (!box) return;
    const q = state.search.trim().toLowerCase();
    const all = sortedCases();
    const list = all.filter((r) => (state.filter === 'all' || r.data.type === state.filter) && (!q || haystack(r.data).includes(q)));
    if (!all.length) {
      box.innerHTML = `<div class="empty"><p class="empty-title">No cases yet</p><p>Tap the plus button to log your first case. Already have a backup? Restore it from More.</p></div>`;
      return;
    }
    if (!list.length) { box.innerHTML = `<div class="empty"><p>No cases match. Try a different word or filter.</p></div>`; return; }
    let html = `<p class="log-count">${list.length} ${list.length === 1 ? 'case' : 'cases'}${list.length !== all.length ? ` of ${all.length}` : ''}</p>`;
    let month = '';
    for (const r of list) {
      const d = r.data; const dt = parseDate(d.date);
      const m = `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
      if (m !== month) { if (month) html += '</ul>'; html += `<h2 class="month">${m}</h2><ul class="case-list">`; month = m; }
      const t = TYPE[d.type] || TYPE.theatre;
      html += `<li><button class="case-row" data-id="${esc(r.id)}">
        <span class="bar sy-${t.color}" aria-hidden="true"></span>
        <span class="case-main"><span class="case-title">${esc(caseTitle(d))}</span><span class="case-sub">${esc(caseSub(d)) || esc(t.label)}</span></span>
        <span class="case-date"><b>${dt.getDate()}</b><small>${DAYS[dt.getDay()]}</small></span>
      </button></li>`;
    }
    html += '</ul>';
    box.innerHTML = html;
    $$('.case-row', box).forEach((b) => b.addEventListener('click', () => openCaseEditor(state.cases.get(b.dataset.id))));
  }

  // ------------------------------------------------------------ new case picker
  // Templates keep the "kind of case"; patient-specific details always start blank.
  const TEMPLATE_SKIP = ['date', 'ageValue', 'ageBand', 'weightKg', 'heightCm', 'bmiBand', 'gender', 'notes', 'teaching',
    'complications', 'createdAt', 'difficultAirway', 'startTime', 'timeOfDay', 'durationMin', 'durationBand', 'comorbidities',
    'regularMeds', 'allergies', 'asa', 'asaE'];
  const templateFields = (d) => Object.fromEntries(Object.entries(d).filter(([k]) => !TEMPLATE_SKIP.includes(k)));

  $('#new-btn').addEventListener('click', openPicker);

  function openPicker() {
    const templates = live('templates').sort((a, b) => (b.data.used || 0) - (a.data.used || 0) || a.data.name.localeCompare(b.data.name));
    const last = sortedCases()[0];
    const panel = $('#action .action-panel');
    panel.innerHTML = `
      <h2 class="action-title">Start a case</h2>
      <div class="action-list">
        <button class="action-item" data-pick="blank"><span class="ai-name">Blank case</span></button>
        ${last ? `<button class="action-item" data-pick="repeat"><span class="ai-name">Repeat last case</span><span class="ai-sub">${esc(caseTitle(last.data))}</span></button>` : ''}
        ${templates.map((t) => {
          const ty = TYPE[t.data.fields.type] || TYPE.theatre;
          return `<button class="action-item" data-pick="tpl" data-id="${esc(t.id)}"><span class="bar sy-${ty.color}" aria-hidden="true"></span><span class="ai-name">${esc(t.data.name)}</span><span class="ai-sub">${esc(caseSub(t.data.fields) || ty.label)}</span></button>`;
        }).join('')}
      </div>
      ${templates.length ? '' : '<p class="action-hint">Save any case as a template and it appears here for two-tap logging.</p>'}
      <button class="btn btn-quiet btn-block" data-close>Cancel</button>`;
    $('#action').hidden = false;
    $$('.action-item', panel).forEach((b) => b.addEventListener('click', () => {
      closePicker();
      if (b.dataset.pick === 'blank') openCaseEditor();
      else if (b.dataset.pick === 'repeat') openCaseEditor(null, templateFields(last.data));
      else {
        const t = state.templates.get(b.dataset.id);
        openCaseEditor(null, clone(t.data.fields));
        saveRecord('templates', t.id, { ...t.data, used: (t.data.used || 0) + 1 }, false, true).catch(() => {});
      }
    }));
    $('.action-item', panel).focus();
  }
  function closePicker() { $('#action').hidden = true; }
  $('#action').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closePicker(); });

  // ------------------------------------------------------------ case editor
  let draft = null; let editingId = null; let overrideIdentifier = false;
  const expanded = new Set();

  function blankCase() {
    const t = today();
    const rot = live('rotations').find((r) => r.data.start <= t && (!r.data.end || r.data.end >= t));
    return {
      date: t, type: 'theatre', site: ls.get('caselog.site') || '', rotation: rot ? rot.data.name : '',
      specialty: '', procedure: '', surgeon: '', urgency: 'Elective', asa: '', asaE: false,
      gender: '', ageBand: '', ageValue: '', ageUnit: 'y', weightKg: '', heightCm: '', bmiBand: '',
      startTime: '', timeOfDay: Derive.timeOfDay(t, nowHHMM()), durationBand: '', durationMin: '',
      comorbidities: [], supervision: '', supervisor: '', anaesthesia: [], airway: [], laryngoscopy: [], difficultAirway: false,
      blocks: [], procedures: [], drugsGiven: [], regularMeds: [], allergies: [], categories: [], obstetric: '',
      icuSupport: [], icuDiagnosis: '', painSetting: '', complications: [], teaching: '', notes: '',
    };
  }

  function chip(value, label, on, attrs = '') {
    return `<button type="button" class="chip" data-value="${esc(value)}" aria-pressed="${on}"${attrs}>${esc(label)}</button>`;
  }

  function chips(field, options, multi, cls = '') {
    const cur = draft[field];
    return `<div class="chips ${cls}" data-field="${field}" data-multi="${multi ? 1 : 0}" role="group">${options.map((o) => {
      const val = typeof o === 'object' ? o.id : o; const label = typeof o === 'object' ? (o.label || o.id) : o;
      return chip(val, label, multi ? has(cur, val) : cur === val);
    }).join('')}</div>`;
  }

  // Chip group drawn from a personal list, with "+ Add" and, for long lists, "Show all".
  const GROUPS = {
    surgeon: () => listGroup('surgeon', 'surgeons', false, 10),
    supervisor: () => listGroup('supervisor', 'supervisors', false, 10),
    comorbidities: () => listGroup('comorbidities', 'comorbidities', true),
    allergies: () => listGroup('allergies', 'allergies', true),
    procedure: () => {
      const bySpec = draft.specialty ? candidates('operations', (d) => d.specialty === draft.specialty) : [];
      const list = uniq([...bySpec, ...candidates('operations')]);
      return listGroup('procedure', 'operations', false, 8, list, true);
    },
    drugsGiven: () => {
      const defaults = new Set(LISTS.drugs.defaults);
      const hidden = new Set(listData('drugs').hidden || []);
      const extras = candidates('drugs').filter((v) => !defaults.has(v));
      return OPT.drugs.map((g) => {
        const items = g.items.filter((v) => !hidden.has(v) || has(draft.drugsGiven, v));
        return items.length ? `<h4 class="flabel flabel-sub">${esc(g.group)}</h4><div class="chips" data-field="drugsGiven" data-multi="1">${items.map((v) => chip(v, v, has(draft.drugsGiven, v))).join('')}</div>` : '';
      }).join('') + `<h4 class="flabel flabel-sub">Your additions</h4><div class="chips" data-field="drugsGiven" data-multi="1">${extras.map((v) => chip(v, v, has(draft.drugsGiven, v))).join('')}${addChip('drugs', 'drugsGiven', true)}</div>`;
    },
    rmPick: () => {
      const meds = uniq([...candidates('regularMeds'), ...draft.regularMeds.map((m) => m.med)]);
      return `<div class="chips">${meds.map((m) => `<button type="button" class="chip" data-rm-pick="${esc(m)}" aria-pressed="${draft.regularMeds.some((x) => x.med === m)}">${esc(m)}</button>`).join('')}${addChip('regularMeds', 'rmPick', true)}</div>`;
    },
  };

  function addChip(listKey, field, multi, fill) {
    return `<button type="button" class="chip chip-add" data-add-list="${listKey}" data-add-field="${field}" data-multi="${multi ? 1 : 0}"${fill ? ' data-fill-mode="1"' : ''}>+ Add</button>`;
  }

  function listGroup(field, listKey, multi, limit, list, fill) {
    const cur = draft[field];
    let items = list || candidates(listKey);
    const selected = multi ? (cur || []) : (cur ? [cur] : []);
    selected.forEach((v) => { if (!items.includes(v) && !fill) items = [v, ...items]; });
    const full = items.length; const showAll = !limit || expanded.has(field) || full <= limit;
    const shown = showAll ? items : items.slice(0, limit);
    const on = (v) => (multi ? has(cur, v) : cur === v);
    const attrs = fill ? ' data-fill="procedure"' : '';
    return `<div class="chips${fill ? ' chips-fill' : ''}" ${fill ? '' : `data-field="${field}" data-multi="${multi ? 1 : 0}"`} role="group">${shown.map((v) => chip(v, v, on(v), attrs)).join('')}${showAll ? '' : `<button type="button" class="chip chip-more" data-expand="${field}">Show all ${full}</button>`}${addChip(listKey, field, multi, fill)}</div>`;
  }

  function wrap(field) { return `<div class="lc-wrap" data-lc="${field}">${GROUPS[field]()}</div>`; }
  function rerender(field) { const w = $(`.lc-wrap[data-lc="${field}"]`); if (w) w.innerHTML = GROUPS[field](); }

  const SHOW = {
    specialty: 'theatre procedure', obstetric: 'obstetric', urgency: 'theatre obstetric procedure', asa: 'theatre obstetric procedure',
    surgeon: 'theatre obstetric procedure', duration: 'theatre obstetric procedure pain',
    anaesthesia: 'theatre obstetric procedure', airway: 'theatre obstetric icu procedure', blocks: 'theatre obstetric procedure pain',
    categories: 'theatre procedure', icu: 'icu', pain: 'pain',
  };
  const FOLD_FIELDS = { airway: ['airway', 'laryngoscopy'], drugs: ['drugsGiven'], meds: ['regularMeds'] };

  function group(key, title, inner, collapsible) {
    const show = SHOW[key] ? ` data-show="${SHOW[key]}"` : '';
    if (!collapsible) return `<section class="fgroup"${show}><h3 class="flabel">${title}</h3>${inner}</section>`;
    return `<details class="fgroup fold" data-fold="${key}"${show}><summary><span class="flabel">${title}</span><span class="fold-count" data-count-for="${key}"></span></summary>${inner}</details>`;
  }

  function medUsual(med) {
    const tally = new Map(); let n = 0;
    for (const r of live('cases')) {
      if (r.id === editingId) continue;
      const m = (r.data.regularMeds || []).find((x) => x.med === med);
      if (!m || !(m.actions || []).length) continue;
      n++; m.actions.forEach((a) => tally.set(a, (tally.get(a) || 0) + 1));
    }
    if (!n) return null;
    const [action, count] = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0];
    return { action, count, n };
  }

  function medRows() {
    if (!draft.regularMeds.length) return '<p class="hint">Tap the medications this patient takes, then how each was managed.</p>';
    return draft.regularMeds.map((m, i) => {
      const u = medUsual(m.med);
      return `<div class="rm-row">
        <div class="rm-head"><span class="rm-name">${esc(m.med)}</span><button type="button" class="link rm-remove" data-rm-remove="${i}" aria-label="Remove ${esc(m.med)}">Remove</button></div>
        ${u && !(m.actions || []).length ? `<button type="button" class="rm-usual" data-rm-usual="${i}" data-action="${esc(u.action)}">Use your usual: ${esc(u.action)} <span>(${u.count} of ${u.n})</span></button>` : ''}
        <div class="chips chips-sm" data-rm-actions="${i}">${OPT.medActions.map((a) => chip(a, a, has(m.actions, a))).join('')}</div>
        <input type="text" class="rm-note" data-rm-note="${i}" value="${esc(m.note || '')}" placeholder="Detail, optional (e.g. last dose 48 h before)" aria-label="Detail for ${esc(m.med)}">
      </div>`;
    }).join('');
  }

  function openCaseEditor(record, preset) {
    editingId = record ? record.id : null;
    overrideIdentifier = false; expanded.clear();
    draft = Object.assign(blankCase(), record ? clone(record.data) : {}, preset || {});
    if (preset) draft.date = today();
    ['comorbidities', 'drugsGiven', 'regularMeds', 'allergies'].forEach((k) => { if (!Array.isArray(draft[k])) draft[k] = []; });
    const rotations = live('rotations').sort((a, b) => (b.data.start || '').localeCompare(a.data.start || ''));
    const bmi = Derive.bmi(draft);
    const sheet = $('#sheet');
    sheet.innerHTML = `<div class="sheet-body">
      <header class="sheet-head">
        <button class="link" data-act="cancel">Cancel</button>
        <h2 id="sheet-title" tabindex="-1">${record ? 'Edit case' : 'New case'}</h2>
        <span class="head-spacer"></span>
      </header>
      <form class="editor" novalidate autocomplete="off">
        <div class="type-row" role="radiogroup" aria-label="Case type">
          ${OPT.types.map((t) => `<button type="button" class="type-label sy-${t.color}" role="radio" data-type="${t.id}" aria-checked="${draft.type === t.id}">${esc(t.label)}</button>`).join('')}
        </div>

        <section class="fgroup date-row">
          <label class="field field-date"><span class="flabel">Date</span><input type="date" data-bind="date" value="${esc(draft.date)}" max="${today()}" required></label>
          <div class="quick-dates"><button type="button" class="chip chip-sm" data-date="0">Today</button><button type="button" class="chip chip-sm" data-date="-1">Yesterday</button></div>
        </section>
        <section class="fgroup tod-row">
          <h3 class="flabel">Time of day</h3>
          <div class="inline-row">${chips('timeOfDay', OPT.timeOfDay, false)}
            <label class="field field-time"><span class="visually-hidden">Start time</span><input type="time" data-bind="startTime" value="${esc(draft.startTime)}" aria-label="Start time, optional"></label></div>
        </section>

        ${group('obstetric', 'Obstetric case', chips('obstetric', OPT.obstetric, false))}
        ${group('specialty', 'Specialty', chips('specialty', OPT.specialties, false, 'chips-scroll'))}
        ${group('icu', 'ICU diagnosis group', chips('icuDiagnosis', OPT.icuDiagnosis, false) + '<h4 class="flabel flabel-sub">Organ support</h4>' + chips('icuSupport', OPT.icuSupport, true))}
        ${group('pain', 'Pain setting', chips('painSetting', OPT.painSetting, false))}

        <section class="fgroup">
          <label class="field"><span class="flabel" data-label-proc>Operation</span>
            <input type="text" data-bind="procedure" value="${esc(draft.procedure)}" enterkeyhint="done" placeholder="Tap below, or type"></label>
          ${wrap('procedure')}
        </section>

        ${group('surgeon', 'Surgeon', wrap('surgeon'))}

        <div class="two-col">
          ${group('urgency', 'Urgency', chips('urgency', OPT.urgency, false))}
          ${group('asa', 'ASA', chips('asa', OPT.asa, false, 'chips-tight') + `<button type="button" class="chip chip-e" data-toggle="asaE" aria-pressed="${!!draft.asaE}">E</button>`)}
        </div>

        <section class="fgroup patient">
          <h3 class="flabel">Patient</h3>
          ${chips('gender', OPT.gender, false)}
          <h4 class="flabel flabel-sub">Age range</h4>
          ${chips('ageBand', OPT.ageBands, false, 'chips-sm')}
          <div class="inline-row exact">
            <label class="field field-num"><span class="flabel">Exact age</span><input type="number" inputmode="decimal" min="0" max="120" step="any" data-bind="ageValue" value="${esc(draft.ageValue)}"></label>
            ${chips('ageUnit', OPT.ageUnits, false, 'chips-tight chips-sm')}
          </div>
          <h4 class="flabel flabel-sub">BMI</h4>
          ${chips('bmiBand', OPT.bmiBands, false, 'chips-sm')}
          <div class="inline-row exact">
            <label class="field field-num"><span class="flabel">Weight kg</span><input type="number" inputmode="decimal" min="0" max="350" step="any" data-bind="weightKg" value="${esc(draft.weightKg)}"></label>
            <label class="field field-num"><span class="flabel">Height cm</span><input type="number" inputmode="decimal" min="30" max="230" step="any" data-bind="heightCm" value="${esc(draft.heightCm)}"></label>
            <span class="bmi-out" id="bmi-out">${bmi ? `BMI ${fmt1(bmi)}` : ''}</span>
          </div>
        </section>

        ${group('comorbidities', 'Comorbidities', wrap('comorbidities'), true)}

        ${group('duration', 'Duration', chips('durationBand', OPT.durationBands, false, 'chips-sm') + `<div class="inline-row exact"><label class="field field-num"><span class="flabel">Minutes</span><input type="number" inputmode="numeric" min="0" max="1440" data-bind="durationMin" value="${esc(draft.durationMin)}"></label></div>`)}

        ${group('supervision', 'Your role', chips('supervision', OPT.supervision, false))}
        ${group('supervisor', 'Supervising doctor', wrap('supervisor'))}
        ${group('anaesthesia', 'Anaesthesia', chips('anaesthesia', OPT.anaesthesia, true))}
        ${group('airway', 'Airway', chips('airway', OPT.airway, true) + '<h4 class="flabel flabel-sub">Laryngoscopy</h4>' + chips('laryngoscopy', OPT.laryngoscopy, true) + `<button type="button" class="chip chip-flag" data-toggle="difficultAirway" aria-pressed="${!!draft.difficultAirway}">Difficult airway</button>`, true)}
        ${group('blocks', 'Regional blocks', chips('blocks', OPT.blocks, true), true)}
        ${group('procedures', 'Procedures and monitoring', chips('procedures', OPT.procedures, true), true)}
        ${group('drugs', 'Drugs given', wrap('drugsGiven'), true)}
        ${group('meds', 'Regular medications and optimisation', `<div id="rm-rows">${medRows()}</div><h4 class="flabel flabel-sub">Add a medication</h4>${wrap('rmPick')}`, true)}
        ${group('allergies', 'Allergies', wrap('allergies'), true)}
        ${group('categories', 'Board categories', chips('categories', OPT.categories, true), true)}
        ${group('complications', 'Incidents', chips('complications', OPT.complications, true), true)}

        <section class="fgroup">
          <div class="two-col">
            <label class="field"><span class="flabel">Site</span><input type="text" data-bind="site" value="${esc(draft.site)}" list="dl-site" autocapitalize="words"></label>
            <label class="field"><span class="flabel">Rotation</span><select data-bind="rotation"><option value="">None</option>${rotations.map((r) => `<option ${r.data.name === draft.rotation ? 'selected' : ''}>${esc(r.data.name)}</option>`).join('')}</select></label>
          </div>
          <datalist id="dl-site">${uniq(liveCases().map((d) => d.site).filter(Boolean)).slice(0, 30).map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        </section>

        <section class="fgroup">
          <label class="field"><span class="flabel">Learning point</span><input type="text" data-bind="teaching" value="${esc(draft.teaching)}" placeholder="One line to remember"></label>
          <label class="field"><span class="flabel">Notes</span><textarea data-bind="notes" rows="3" placeholder="Clinical detail only. No names, file numbers, dates of birth or Emirates ID.">${esc(draft.notes)}</textarea></label>
        </section>

        <div class="editor-extra">
          <button type="button" class="btn btn-quiet" data-act="template">Save as template</button>
          ${record ? '<button type="button" class="btn btn-danger-quiet" data-act="delete">Delete case</button>' : ''}
        </div>
      </form>
      <footer class="sheet-foot">
        <div class="id-warn" id="id-warn" role="alert" hidden></div>
        <button class="btn btn-primary btn-block" data-act="save">Save case</button>
      </footer></div>`;

    openSheet();
    updateEditor();
    wireEditor($('.sheet-body', sheet));
  }

  function updateEditor() {
    const sheet = $('#sheet');
    $$('[data-show]', sheet).forEach((el) => { el.hidden = !el.dataset.show.split(' ').includes(draft.type); });
    $$('.type-label', sheet).forEach((b) => b.setAttribute('aria-checked', b.dataset.type === draft.type));
    const procLabel = { icu: 'Summary', pain: 'Summary' }[draft.type] || 'Operation';
    const pl = $('[data-label-proc]', sheet); if (pl) pl.textContent = procLabel;
    $$('.fold', sheet).forEach((d) => {
      const key = d.dataset.fold; const fields = FOLD_FIELDS[key] || [key];
      let n = fields.reduce((s, f) => s + (draft[f] || []).length, 0);
      if (key === 'airway' && draft.difficultAirway) n += 1;
      if (key === 'complications' && has(draft.complications, 'None')) n -= 1;
      const c = $('.fold-count', d); c.textContent = n > 0 ? String(n) : '';
      if (n > 0 && !d.dataset.touched) d.open = true;
    });
  }

  function refreshChips() {
    $$('#sheet .chips[data-field]').forEach((g) => {
      const field = g.dataset.field; const multi = g.dataset.multi === '1';
      $$('.chip[data-value]', g).forEach((c) => c.setAttribute('aria-pressed', multi ? has(draft[field], c.dataset.value) : draft[field] === c.dataset.value));
    });
    $$('#sheet .chips-fill .chip[data-value]').forEach((c) => c.setAttribute('aria-pressed', draft.procedure === c.dataset.value));
    $$('#sheet [data-rm-pick]').forEach((c) => c.setAttribute('aria-pressed', draft.regularMeds.some((m) => m.med === c.dataset.rmPick)));
  }

  function addTo(field, value) { if (!has(draft[field], value)) draft[field] = [...(draft[field] || []), value]; }
  const EXCLUSIVE = { complications: 'None', allergies: 'No known allergies' };

  function syncDerived(changed) {
    const sheet = $('#sheet');
    if (changed === 'age') { const y = Derive.ageYears(draft); if (y != null) draft.ageBand = Derive.bandFor(OPT.ageBands, y); }
    if (changed === 'bmi') {
      const b = Derive.bmi(draft); $('#bmi-out', sheet).textContent = b ? `BMI ${fmt1(b)}` : '';
      if (b) draft.bmiBand = Derive.bandFor(OPT.bmiBands, b);
    }
    if (changed === 'duration') { const m = parseFloat(draft.durationMin); if (m >= 0) draft.durationBand = Derive.bandFor(OPT.durationBands, m); }
    if (changed === 'time') {
      const t = Derive.timeOfDay(draft.date, draft.startTime);
      if (t) draft.timeOfDay = t;
    }
    refreshChips();
  }

  function rerenderMedRows() { $('#rm-rows').innerHTML = medRows(); rerender('rmPick'); updateEditor(); }

  function wireEditor(body) {
    body.addEventListener('click', async (e) => {
      const add = e.target.closest('.chip-add');
      if (add) {
        const key = add.dataset.addList; const field = add.dataset.addField;
        const value = (prompt(`Add to ${LISTS[key].label.toLowerCase()}`) || '').trim().replace(/\s+/g, ' ');
        if (!value) return;
        try { await addListItem(key, value, true); } catch (err) { return; }
        if (field === 'rmPick') { if (!draft.regularMeds.some((m) => m.med === value)) draft.regularMeds.push({ med: value, actions: [], note: '' }); rerenderMedRows(); return; }
        if (add.dataset.fillMode) { draft.procedure = value; $('[data-bind=procedure]', body).value = value; }
        else if (add.dataset.multi === '1') addTo(field, value);
        else draft[field] = value;
        rerender(field); updateEditor(); return;
      }
      const more = e.target.closest('[data-expand]');
      if (more) { expanded.add(more.dataset.expand); rerender(more.dataset.expand); return; }
      const fill = e.target.closest('[data-fill]');
      if (fill) {
        draft.procedure = draft.procedure === fill.dataset.value ? '' : fill.dataset.value;
        $('[data-bind=procedure]', body).value = draft.procedure; refreshChips(); clearWarn(); return;
      }
      const pick = e.target.closest('[data-rm-pick]');
      if (pick) {
        const med = pick.dataset.rmPick; const i = draft.regularMeds.findIndex((m) => m.med === med);
        if (i >= 0) draft.regularMeds.splice(i, 1); else draft.regularMeds.push({ med, actions: [], note: '' });
        rerenderMedRows(); return;
      }
      const rmRemove = e.target.closest('[data-rm-remove]');
      if (rmRemove) { draft.regularMeds.splice(Number(rmRemove.dataset.rmRemove), 1); rerenderMedRows(); return; }
      const usual = e.target.closest('[data-rm-usual]');
      if (usual) { draft.regularMeds[Number(usual.dataset.rmUsual)].actions = [usual.dataset.action]; rerenderMedRows(); return; }
      const rmAct = e.target.closest('[data-rm-actions] .chip');
      if (rmAct) {
        const m = draft.regularMeds[Number(rmAct.closest('[data-rm-actions]').dataset.rmActions)]; const a = rmAct.dataset.value;
        m.actions = has(m.actions, a) ? m.actions.filter((x) => x !== a) : [...(m.actions || []), a];
        rmAct.setAttribute('aria-pressed', has(m.actions, a));
        const u = rmAct.closest('.rm-row').querySelector('.rm-usual'); if (u) u.remove();
        return;
      }
      const c = e.target.closest('.chips[data-field] .chip[data-value]');
      if (c) {
        const g = c.closest('.chips'); const field = g.dataset.field; const v = c.dataset.value;
        if (g.dataset.multi === '1') {
          const arr = draft[field] || [];
          draft[field] = has(arr, v) ? arr.filter((x) => x !== v) : [...arr, v];
          const ex = EXCLUSIVE[field];
          if (ex) {
            if (v === ex && has(draft[field], ex)) draft[field] = [ex];
            else if (v !== ex) draft[field] = draft[field].filter((x) => x !== ex);
          }
          if (field === 'blocks' && draft.blocks.length) addTo('anaesthesia', 'Nerve block');
        } else {
          draft[field] = draft[field] === v ? '' : v;
          if (field === 'specialty') { if (OPT.specialtyCategory[v] && draft.specialty) addTo('categories', OPT.specialtyCategory[v]); rerender('procedure'); }
          if (field === 'obstetric' && v === 'Labour analgesia' && draft.obstetric) addTo('anaesthesia', 'Epidural');
          if (field === 'ageUnit') { syncDerived('age'); }
          if (field === 'ageBand' && draft.ageValue !== '') { // a tapped band overrides a typed age that disagrees
            const y = Derive.ageYears(draft); if (y != null && Derive.bandFor(OPT.ageBands, y) !== draft.ageBand) { draft.ageValue = ''; $('[data-bind=ageValue]', body).value = ''; }
          }
        }
        refreshChips(); updateEditor(); clearWarn();
        return;
      }
      const tog = e.target.closest('[data-toggle]');
      if (tog) { const k = tog.dataset.toggle; draft[k] = !draft[k]; tog.setAttribute('aria-pressed', draft[k]); updateEditor(); return; }
      const ty = e.target.closest('.type-label');
      if (ty) {
        draft.type = ty.dataset.type;
        if (draft.type === 'obstetric' && !draft.specialty) draft.specialty = 'Obstetrics';
        updateEditor(); return;
      }
      const qd = e.target.closest('[data-date]');
      if (qd) { draft.date = shiftDate(today(), Number(qd.dataset.date)); $('[data-bind=date]', body).value = draft.date; syncDerived('time'); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      e.preventDefault();
      ({ cancel: closeSheet, save: saveCase, delete: deleteCase, template: saveTemplate })[act.dataset.act]();
    });
    body.addEventListener('input', (e) => {
      const note = e.target.dataset.rmNote;
      if (note !== undefined) { draft.regularMeds[Number(note)].note = e.target.value; overrideIdentifier = false; clearWarn(); return; }
      const k = e.target.dataset.bind; if (!k) return;
      draft[k] = e.target.value;
      if (k === 'ageValue') syncDerived('age');
      if (k === 'weightKg' || k === 'heightCm') syncDerived('bmi');
      if (k === 'durationMin') syncDerived('duration');
      if (k === 'startTime' || k === 'date') syncDerived('time');
      if (k === 'procedure') refreshChips();
      if (['procedure', 'notes', 'teaching'].includes(k)) { overrideIdentifier = false; clearWarn(); }
    });
    body.addEventListener('change', (e) => { const k = e.target.dataset.bind; if (k) draft[k] = e.target.value; });
    $$('.fold', body).forEach((d) => d.addEventListener('toggle', () => { d.dataset.touched = '1'; }));
  }

  // Patterns that look like patient identifiers. They block saving until removed or confirmed.
  const ID_PATTERNS = [
    [/\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/, 'an Emirates ID number'],
    [/\b(mrn|file\s*(no|number|#)|hospital\s*(no|number)|patient\s*id|d\.?o\.?b\.?|date of birth)\b/i, 'a file number or date of birth'],
    [/\b\d{1,2}[/.-]\d{1,2}[/.-](19|20)\d{2}\b/, 'a full date (possible date of birth)'],
    [/(\+|00)\s?\d{3}[\s-]?\d{2,}|\b05\d[\s-]?\d{3}[\s-]?\d{4}\b/, 'a phone number'],
    [/\b(mr|mrs|ms|miss|baby|bed)\.?\s+[A-Z][a-z]+/, 'a patient name'],
    [/\b\d{6,}\b/, 'a long number (possible file number)'],
  ];
  function findIdentifier() {
    const texts = [['procedure', draft.procedure], ['notes', draft.notes], ['teaching', draft.teaching],
      ...draft.regularMeds.map((m, i) => [`rm${i}`, m.note])];
    for (const [k, text] of texts) {
      for (const [re, what] of ID_PATTERNS) if (re.test(text || '')) return { field: k, what };
    }
    return null;
  }
  function clearWarn() { const w = $('#id-warn'); if (w) w.hidden = true; }

  async function saveCase() {
    if (!draft.date) { toast('Add the date of the case.'); $('[data-bind=date]').focus(); return; }
    const hit = findIdentifier();
    if (hit && !overrideIdentifier) {
      const where = { notes: 'notes', teaching: 'learning point', procedure: 'operation' }[hit.field] || 'medication detail';
      const w = $('#id-warn');
      w.innerHTML = `<p>The ${where} may contain ${hit.what}. Remove it before saving.</p>
        <div class="warn-actions"><button type="button" class="btn btn-quiet btn-sm" data-warn="edit">Edit</button><button type="button" class="btn btn-quiet btn-sm" data-warn="ok">It is not an identifier</button></div>`;
      w.hidden = false;
      $('[data-warn=edit]', w).onclick = () => {
        const f = hit.field.startsWith('rm') ? $(`[data-rm-note="${hit.field.slice(2)}"]`) : $(`[data-bind=${hit.field}]`);
        const fold = f.closest('details'); if (fold) fold.open = true;
        f.focus(); f.scrollIntoView({ block: 'center' });
      };
      $('[data-warn=ok]', w).onclick = () => { overrideIdentifier = true; clearWarn(); saveCase(); };
      return;
    }
    const data = clone(draft);
    ['procedure', 'notes', 'teaching', 'site'].forEach((k) => { data[k] = (data[k] || '').trim(); });
    data.regularMeds = data.regularMeds.map((m) => ({ med: m.med, actions: m.actions || [], note: (m.note || '').trim() }));
    data.createdAt = data.createdAt || Date.now();
    if (data.site) ls.set('caselog.site', data.site);
    try { await saveRecord('cases', editingId || newId(), data); } catch (e) { return; }
    const wasEditing = editingId;
    closeSheet();
    toast(wasEditing ? 'Case updated' : 'Case saved');
  }

  async function deleteCase() {
    if (!confirm('Delete this case from your logbook?')) return;
    const r = state.cases.get(editingId);
    try { await saveRecord('cases', editingId, r.data, true); } catch (e) { return; }
    closeSheet(); toast('Case deleted');
  }

  async function saveTemplate() {
    const suggestion = draft.procedure || draft.obstetric || draft.specialty || '';
    const name = (prompt('Template name', suggestion) || '').trim();
    if (!name) return;
    try { await saveRecord('templates', newId(), { name, fields: templateFields(clone(draft)), used: 0 }, false, true); } catch (e) { return; }
    toast('Template saved');
  }

  // ------------------------------------------------------------ sheet plumbing
  let lastFocus = null;
  function openSheet() {
    lastFocus = document.activeElement;
    const s = $('#sheet'); s.hidden = false; s.scrollTop = 0;
    document.body.classList.add('locked');
    $('#sheet-title').focus({ preventScroll: true });
  }
  function closeSheet() {
    $('#sheet').hidden = true; $('#sheet').innerHTML = '';
    document.body.classList.remove('locked');
    draft = null; editingId = null;
    render();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#action').hidden) closePicker();
    else if (!$('#sheet').hidden) closeSheet();
  });

  // ------------------------------------------------------------ progress / reports
  function inRange(d) {
    const t = today();
    if (state.range === '12m') return d.date >= shiftDate(t, -365);
    if (state.range === 'year') return d.date >= `${t.slice(0, 4)}-01-01`;
    if (state.range === 'custom') return (!state.from || d.date >= state.from) && (!state.to || d.date <= state.to);
    return true;
  }
  const rangeText = () => `${RANGE_LABEL[state.range]}${state.range === 'custom' ? ` (${state.from || 'start'} to ${state.to || 'today'})` : ''}`;
  const icuMonths = () => live('rotations').filter((r) => r.data.kind === 'ICU').reduce((s, r) => s + monthsBetween(r.data.start, r.data.end || today()), 0);

  function computeCounts(cases) {
    const c = Object.fromEntries(OPT.targets.map((t) => [t.id, 0]));
    for (const d of cases) {
      const age = Derive.ageYears(d); const bi = Derive.ageBandIndex(d); const an = d.anaesthesia || []; const cat = d.categories || [];
      const under = (years, maxBand) => (age != null ? age < years : bi >= 0 && bi <= maxBand);
      if (d.obstetric === 'Labour analgesia') c.labour++;
      if (d.obstetric === 'Caesarean section') c.caesarean++;
      if (under(12, 4)) c.paeds12++;
      if (under(3, 3)) c.paeds3y++;
      if (under(0.25, 1)) c.paeds3m++;
      if (has(cat, 'Cardiac surgery') || has(cat, 'On bypass')) c.cardiac++;
      if (has(cat, 'On bypass')) c.bypass++;
      if (has(cat, 'Major vascular')) c.vascular++;
      if (has(cat, 'Intrathoracic non-cardiac')) c.thoracic++;
      if (has(cat, 'Intracranial open') || has(cat, 'Intracranial endovascular')) c.intracranial++;
      if (has(cat, 'Intracranial open')) c.intracranialOpen++;
      if (has(an, 'Epidural') || has(an, 'CSE')) c.epidural++;
      if (has(an, 'Spinal') || has(an, 'CSE')) c.spinal++;
      if (has(cat, 'Complex life-threatening')) c.complex++;
      if ((d.blocks || []).length) c.blocks++;
      if (d.type === 'pain') c.pain++;
    }
    return c;
  }

  function tally(cases, get, order) {
    const m = new Map();
    for (const d of cases) get(d).forEach((v) => { if (v) m.set(v, (m.get(v) || 0) + 1); });
    const rows = Array.from(m.entries());
    if (order) rows.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    else rows.sort((a, b) => b[1] - a[1]);
    return rows;
  }
  const arr = (f) => (d) => (Array.isArray(d[f]) ? d[f] : d[f] ? [d[f]] : []);

  const BREAKDOWNS = [
    ['Supervision level', (c) => tally(c, arr('supervision'), OPT.supervision)],
    ['ASA grade', (c) => tally(c, (d) => (d.asa ? [`ASA ${d.asa}`] : []), OPT.asa.map((a) => `ASA ${a}`))],
    ['Age range', (c) => tally(c, (d) => [Derive.ageBand(d)], OPT.ageBands.map((b) => b.id))],
    ['Urgency', (c) => tally(c, arr('urgency'), OPT.urgency)],
    ['Time of day', (c) => tally(c, arr('timeOfDay'), OPT.timeOfDay)],
    ['Anaesthesia type', (c) => tally(c, arr('anaesthesia'), OPT.anaesthesia)],
    ['Airway', (c) => tally(c, (d) => [...(d.airway || []), ...(d.laryngoscopy || [])])],
    ['Regional blocks', (c) => tally(c, arr('blocks'))],
    ['Procedures', (c) => tally(c, arr('procedures'))],
    ['Specialties', (c) => tally(c, arr('specialty'))],
    ['Incidents', (c) => tally(c, (d) => (d.complications || []).filter((x) => x !== 'None'))],
  ];

  function barList(rows, total, limit = 30) {
    if (!rows.length) return '<p class="muted">Nothing logged yet.</p>';
    return `<ul class="bars">${rows.slice(0, limit).map(([k, n]) => `<li><span class="b-label">${esc(k)}</span><span class="b-num">${n}</span><progress max="${total}" value="${n}" aria-label="${esc(k)}"></progress></li>`).join('')}</ul>`;
  }

  function rangeChips() {
    return `<div class="range-row" role="group" aria-label="Date range">
        ${Object.entries({ all: 'All time', '12m': '12 months', year: 'This year', custom: 'Custom' }).map(([k, l]) => `<button class="fchip" data-range="${k}" aria-pressed="${state.range === k}">${l}</button>`).join('')}
      </div>
      ${state.range === 'custom' ? `<div class="custom-range"><label class="field"><span class="flabel">From</span><input type="date" id="r-from" value="${esc(state.from)}"></label><label class="field"><span class="flabel">To</span><input type="date" id="r-to" value="${esc(state.to)}"></label></div>` : ''}`;
  }
  function wireRange(v, redraw) {
    $$('[data-range]', v).forEach((b) => b.addEventListener('click', () => { state.range = b.dataset.range; redraw(v); }));
    const f = $('#r-from', v); const to = $('#r-to', v);
    if (f) f.addEventListener('change', () => { state.from = f.value; redraw(v); });
    if (to) to.addEventListener('change', () => { state.to = to.value; redraw(v); });
  }

  function medSummary(cases) {
    const meds = new Map();
    for (const d of cases) {
      for (const m of d.regularMeds || []) {
        const e = meds.get(m.med) || { n: 0, actions: new Map(), entries: [] };
        e.n++; (m.actions || []).forEach((a) => e.actions.set(a, (e.actions.get(a) || 0) + 1));
        e.entries.push({ date: d.date, what: caseTitle(d), actions: m.actions || [], note: m.note || '' });
        meds.set(m.med, e);
      }
    }
    return Array.from(meds.entries()).sort((a, b) => b[1].n - a[1].n)
      .map(([name, e]) => ({ name, n: e.n, entries: e.entries, actions: Array.from(e.actions.entries()).sort((a, b) => b[1] - a[1]) }));
  }

  function renderReports(v) {
    const cases = liveCases().filter(inRange);
    const counts = computeCounts(cases);
    const met = OPT.targets.filter((t) => counts[t.id] >= t.target).length;
    const n = cases.length; const name = traineeName();
    v.innerHTML = `
      ${rangeChips()}
      <div class="print-head">
        <p class="ph-name">${esc(name || 'CaseLog')}</p>
        <p class="ph-meta">Logbook summary, ${esc(rangeText())}. Generated ${new Date().toLocaleDateString('en-GB')}.</p>
      </div>

      <section class="stat-strip">
        <div><b>${n}</b><span>cases</span></div>
        <div><b>${met}<small>/${OPT.targets.length}</small></b><span>minimums met</span></div>
        <div><b>${fmt1(icuMonths())}</b><span>ICU months</span></div>
      </section>

      <section class="panel no-print">
        <h2>Case activity</h2>
        <div id="chart-box"></div>
      </section>

      <section class="panel">
        <h2>Board minimum numbers</h2>
        <p class="hint">NIHS Emirati Board case minimums. Counted from your logged cases in this date range.</p>
        <ul class="targets">${OPT.targets.map((t) => {
          const c = counts[t.id]; const done = c >= t.target;
          return `<li class="${done ? 'done' : ''}"><div class="t-head"><span class="t-label">${esc(t.label)}</span><span class="t-num"><b>${c}</b> of ${t.target}</span></div><progress max="${t.target}" value="${Math.min(c, t.target)}" aria-label="${esc(t.label)}: ${c} of ${t.target}"></progress></li>`;
        }).join('')}</ul>
      </section>

      ${BREAKDOWNS.map(([title, fn]) => `<section class="panel print-only"><h2>${title}</h2>${barList(fn(cases), n)}</section>`).join('')}

      <div class="print-sign"><p>Trainee signature</p><p>Supervisor name and signature</p><p>Date</p></div>

      <div class="report-actions no-print">
        <button class="btn btn-primary" id="share-summary">Share summary</button>
        <button class="btn btn-quiet" id="print-btn">Print</button>
        <button class="btn btn-quiet" id="share-csv">Share spreadsheet</button>
      </div>
      <p class="hint no-print">Share summary makes a file with your numbers and signature lines. Open it from Files to print it or save it as a PDF.</p>`;
    wireRange(v, renderReports);
    Charts.render($('#chart-box', v), liveCases());
    $('#print-btn', v).addEventListener('click', () => window.print());
    $('#share-csv', v).addEventListener('click', shareCsv);
    $('#share-summary', v).addEventListener('click', () => shareFile(`caselog-summary-${today()}.html`, 'text/html', summaryHtml(), 'CaseLog summary'));
  }

  // A self-contained page for signing: opens and prints from Files, Mail or a computer.
  function summaryHtml() {
    const cases = liveCases().filter(inRange);
    const counts = computeCounts(cases); const name = traineeName();
    const met = OPT.targets.filter((t) => counts[t.id] >= t.target).length;
    const table = (title, rows) => (rows.length ? `<h2>${esc(title)}</h2><table>${rows.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="n">${n}</td></tr>`).join('')}</table>` : '');
    const meds = medSummary(cases);
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CaseLog summary${name ? `, ${esc(name)}` : ''}</title>
<style>
body{font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#17211E;margin:24px auto;max-width:720px;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;padding-bottom:3px;border-bottom:1px solid #8a9692}
.meta{color:#5B6964;margin:0 0 12px}table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #D3DBD8;text-align:left;vertical-align:top}
th{font-size:12px;color:#5B6964;font-weight:600}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.met td{font-weight:600}
.stats{display:flex;gap:32px;margin:12px 0 4px}.stats div{font-size:13px;color:#5B6964}.stats b{display:block;font-size:22px;color:#17211E}
.sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:44px}.sign p{border-top:1px solid #17211E;padding-top:4px;font-size:12px}
@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>
<h1>${esc(name || 'CaseLog logbook')}</h1>
<p class="meta">Logbook summary, ${esc(rangeText())}. Generated ${esc(new Date().toLocaleDateString('en-GB'))}.</p>
<div class="stats"><div><b>${cases.length}</b>cases</div><div><b>${met} of ${OPT.targets.length}</b>minimums met</div><div><b>${fmt1(icuMonths())}</b>ICU months</div></div>
<h2>Board minimum numbers (NIHS Emirati Board)</h2>
<table><tr><th>Category</th><th class="n">Logged</th><th class="n">Minimum</th></tr>
${OPT.targets.map((t) => `<tr${counts[t.id] >= t.target ? ' class="met"' : ''}><td>${esc(t.label)}${counts[t.id] >= t.target ? ' (met)' : ''}</td><td class="n">${counts[t.id]}</td><td class="n">${t.target}</td></tr>`).join('')}
</table>
${BREAKDOWNS.map(([title, fn]) => table(title, fn(cases))).join('\n')}
${meds.length ? `<h2>Regular medications managed</h2><table><tr><th>Medication</th><th class="n">Patients</th><th>Management</th></tr>${meds.map((m) => `<tr><td>${esc(m.name)}</td><td class="n">${m.n}</td><td>${esc(m.actions.map(([a, c]) => `${a} ${c}`).join(', ') || 'Not recorded')}</td></tr>`).join('')}</table>` : ''}
<div class="sign"><p>Trainee signature</p><p>Supervisor name and signature</p><p>Date</p></div>
</body></html>`;
  }

  // ------------------------------------------------------------ medications
  function renderMeds(v) {
    const cases = liveCases().filter(inRange).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const meds = medSummary(cases);
    const medRowsHtml = meds.map((e) => `<li><details class="med-row"><summary>
          <span class="mr-name">${esc(e.name)}</span><span class="mr-count">${plural(e.n, 'patient', 'patients')}</span>
          <span class="mr-acts">${e.actions.length ? esc(e.actions.slice(0, 3).map(([a, c]) => `${a} ${c}`).join(', ')) : 'Management not recorded'}</span>
        </summary>
        ${e.actions.length ? `<ul class="bars mr-bars">${e.actions.map(([a, c]) => `<li><span class="b-label">${esc(a)}</span><span class="b-num">${c}</span><progress max="${e.n}" value="${c}" aria-label="${esc(a)}"></progress></li>`).join('')}</ul>` : ''}
        <ul class="mr-entries">${e.entries.slice(0, 25).map((x) => {
          const dt = parseDate(x.date);
          return `<li><span class="mr-date">${dt.getDate()} ${MONTHS[dt.getMonth()].slice(0, 3)}</span><span class="mr-text"><b>${esc(x.what)}</b>${x.actions.length ? `: ${esc(x.actions.join(', '))}` : ''}${x.note ? `. ${esc(x.note)}` : ''}</span></li>`;
        }).join('')}</ul>
      </details></li>`).join('');
    const nMeds = cases.filter((d) => (d.regularMeds || []).length).length;
    v.innerHTML = `
      ${rangeChips()}
      <section class="panel">
        <h2>Regular medications and how you managed them</h2>
        <p class="hint">${meds.length ? `From ${plural(nMeds, 'case', 'cases')}. Tap a medication for your notes on each patient.` : 'Open a case, then Regular medications and optimisation. Each medication you record builds this list.'}</p>
        ${meds.length ? `<ul class="med-list">${medRowsHtml}</ul>` : ''}
      </section>
      <section class="panel"><h2>Drugs you have given</h2>${barList(tally(cases, arr('drugsGiven')), cases.length)}</section>
      <section class="panel"><h2>Allergies recorded</h2>${barList(tally(cases, arr('allergies')), cases.length)}</section>
      <section class="panel"><h2>Comorbidities seen</h2>${barList(tally(cases, arr('comorbidities')), cases.length)}</section>`;
    wireRange(v, renderMeds);
  }

  // ------------------------------------------------------------ more: backup, rotations, lists, templates, erase
  function renderMore(v) {
    const rots = live('rotations').sort((a, b) => (b.data.start || '').localeCompare(a.data.start || ''));
    const tpls = live('templates').sort((a, b) => a.data.name.localeCompare(b.data.name));
    const b = backupStatus();
    const storageLine = state.persisted === true ? 'iOS has marked this logbook as protected storage.'
      : 'Keep regular backups: iOS can clear website data if the phone runs very low on space.';
    v.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2>Backup</h2></div>
        <p class="hint">${esc(lastBackupText())}${b.n ? ` ${plural(b.n, 'case has', 'cases have')} changed since.` : ''} Your cases are stored only on this phone. ${esc(storageLine)}</p>
        <div class="btn-col">
          <button class="btn btn-primary" id="backup-btn">Back up to Files</button>
          <label class="btn btn-quiet file-btn">Restore from a backup<input type="file" id="restore" accept="application/json,.json"></label>
          <button class="btn btn-quiet" id="csv-btn">Share spreadsheet (CSV)</button>
        </div>
        <p class="hint hint-after">Choose Save to Files in the share sheet, and pick iCloud Drive if you use it so the backup also lives off the phone. Restoring merges with what is here, so it is safe to restore the same file twice.</p>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Rotations</h2><button class="btn btn-quiet btn-sm" id="add-rot">Add rotation</button></div>
        <p class="hint">${rots.length ? `${fmt1(icuMonths())} months of ICU logged. Fellowship and EDIC applications ask for this total.` : 'Log each block with its dates. Your ICU months are totalled for fellowship and EDIC applications.'}</p>
        <ul class="simple-list">${rots.map((r) => `<li><button class="row-btn" data-rot="${esc(r.id)}"><span class="rl-main">${esc(r.data.name)}</span><span class="rl-sub">${esc(r.data.kind || '')}${r.data.kind ? ', ' : ''}${esc(r.data.start || '?')} to ${esc(r.data.end || 'now')}, ${fmt1(monthsBetween(r.data.start, r.data.end || today()))} mo</span></button></li>`).join('')}</ul>
      </section>

      <section class="panel">
        <h2>My lists</h2>
        <p class="hint">The choices you tap in each case. Anything you log is added automatically; add or remove items here.</p>
        <ul class="simple-list">${Object.entries(LISTS).map(([k, L]) => `<li><button class="row-btn" data-list="${k}"><span class="rl-main">${esc(L.label)}</span><span class="rl-sub">${plural(candidates(k).length, 'item', 'items')}</span></button></li>`).join('')}</ul>
      </section>

      <section class="panel">
        <h2>Templates</h2>
        <p class="hint">${tpls.length ? 'Shown when you tap the plus button, most used first.' : 'Open any case and choose Save as template.'}</p>
        <ul class="simple-list">${tpls.map((t) => `<li class="tpl-row"><span class="rl-main">${esc(t.data.name)}</span><span class="rl-sub">${t.data.used === 1 ? 'Used once' : `Used ${t.data.used || 0} times`}</span><button class="btn btn-danger-quiet btn-sm" data-del-tpl="${esc(t.id)}">Delete</button></li>`).join('')}</ul>
      </section>

      <section class="panel">
        <h2>Printed summaries</h2>
        <label class="field"><span class="flabel">Your name as it appears on summaries</span><input type="text" id="trainee-name" value="${esc(traineeName())}" autocapitalize="words" autocomplete="name"></label>
      </section>

      <section class="panel">
        <h2>Erase this phone's logbook</h2>
        <p class="hint">Deletes every case, template, rotation and list from this phone. Back up first if you may need them.</p>
        <button class="btn btn-danger-quiet" id="erase-btn">Erase all data</button>
      </section>

      <p class="about">CaseLog ${APP_VERSION}, phone edition. Nothing leaves this phone unless you share a file. No patient names, file numbers, dates of birth or Emirates ID numbers belong in this logbook.</p>`;
    $('#backup-btn', v).addEventListener('click', backupNow);
    $('#csv-btn', v).addEventListener('click', shareCsv);
    $('#restore', v).addEventListener('change', restoreBackup);
    $('#add-rot', v).addEventListener('click', () => openRotationEditor());
    $$('[data-rot]', v).forEach((x) => x.addEventListener('click', () => openRotationEditor(state.rotations.get(x.dataset.rot))));
    $$('[data-list]', v).forEach((x) => x.addEventListener('click', () => openListEditor(x.dataset.list)));
    $$('[data-del-tpl]', v).forEach((x) => x.addEventListener('click', async () => {
      const t = state.templates.get(x.dataset.delTpl);
      if (confirm(`Delete the template "${t.data.name}"?`)) { await saveRecord('templates', t.id, t.data, true).catch(() => {}); toast('Template deleted'); }
    }));
    $('#trainee-name', v).addEventListener('change', (e) => { ls.set('caselog.name', e.target.value.trim()); toast('Name saved'); });
    $('#erase-btn', v).addEventListener('click', eraseAll);
  }

  function openListEditor(key) {
    const L = LISTS[key];
    const draw = () => {
      const items = candidates(key); const hidden = listData(key).hidden || [];
      $('#list-items').innerHTML = items.length ? items.map((x) => `<li><span>${esc(x)}</span><button type="button" class="link link-danger" data-hide="${esc(x)}">Remove</button></li>`).join('') : '<li class="muted">Nothing yet. Add your first item above.</li>';
      $('#list-hidden').innerHTML = hidden.length ? `<h3 class="flabel flabel-sub">Removed</h3><div class="chips">${hidden.map((x) => `<button type="button" class="chip" data-restore="${esc(x)}">Restore ${esc(x)}</button>`).join('')}</div>` : '';
    };
    const sheet = $('#sheet');
    sheet.innerHTML = `<div class="sheet-body">
      <header class="sheet-head"><button class="link" data-act="cancel">Done</button><h2 id="sheet-title" tabindex="-1">${esc(L.label)}</h2><span class="head-spacer"></span></header>
      <form class="editor" novalidate autocomplete="off">
        <div class="add-row"><input type="text" id="list-new" placeholder="Add to ${esc(L.label.toLowerCase())}" autocapitalize="words" aria-label="New item"><button type="submit" class="btn btn-primary">Add</button></div>
        <p class="hint">${L.sort === 'freq' ? 'Most used first.' : 'Built-in items first, then yours.'} Removing an item only hides it from the choices; past cases keep it.</p>
        <ul class="list-items" id="list-items"></ul>
        <div id="list-hidden"></div>
      </form></div>`;
    openSheet(); draw();
    const body = $('.sheet-body', sheet);
    $('form', body).addEventListener('submit', async (e) => {
      e.preventDefault(); const inp = $('#list-new'); const val = inp.value.trim().replace(/\s+/g, ' ');
      if (!val) return;
      try { await addListItem(key, val, true); } catch (err) { return; }
      inp.value = ''; draw(); toast(`Added ${val}`);
    });
    body.addEventListener('click', async (e) => {
      if (e.target.closest('[data-act=cancel]')) { closeSheet(); return; }
      const h = e.target.closest('[data-hide]'); if (h) { await hideListItem(key, h.dataset.hide).catch(() => {}); draw(); return; }
      const r = e.target.closest('[data-restore]'); if (r) { await restoreListItem(key, r.dataset.restore).catch(() => {}); draw(); }
    });
  }

  function openRotationEditor(rec) {
    const d = rec ? clone(rec.data) : { name: '', kind: 'Anaesthesia', start: today(), end: '', site: '', supervisor: '' };
    const sheet = $('#sheet');
    sheet.innerHTML = `<div class="sheet-body">
      <header class="sheet-head"><button class="link" data-act="cancel">Cancel</button><h2 id="sheet-title" tabindex="-1">${rec ? 'Edit rotation' : 'New rotation'}</h2><span class="head-spacer"></span></header>
      <form class="editor" novalidate autocomplete="off">
        <section class="fgroup"><label class="field"><span class="flabel">Name</span><input type="text" name="name" value="${esc(d.name)}" placeholder="e.g. ICU block 1, Kuwait Hospital" required></label></section>
        <section class="fgroup"><h3 class="flabel">Kind</h3><div class="chips" id="rot-kind">${OPT.rotationKinds.map((k) => `<button type="button" class="chip" data-value="${esc(k)}" aria-pressed="${d.kind === k}">${esc(k)}</button>`).join('')}</div></section>
        <div class="two-col">
          <label class="field"><span class="flabel">Start</span><input type="date" name="start" value="${esc(d.start)}"></label>
          <label class="field"><span class="flabel">End</span><input type="date" name="end" value="${esc(d.end)}"></label>
        </div>
        <section class="fgroup">
          <label class="field"><span class="flabel">Site</span><input type="text" name="site" value="${esc(d.site)}"></label>
          <label class="field"><span class="flabel">Educational supervisor</span><input type="text" name="supervisor" value="${esc(d.supervisor)}"></label>
        </section>
        ${rec ? '<div class="editor-extra"><button type="button" class="btn btn-danger-quiet" data-act="delete">Delete rotation</button></div>' : ''}
      </form>
      <footer class="sheet-foot"><button class="btn btn-primary btn-block" data-act="save">Save rotation</button></footer></div>`;
    openSheet();
    $$('#rot-kind .chip', sheet).forEach((c) => c.addEventListener('click', () => {
      d.kind = c.dataset.value; $$('#rot-kind .chip', sheet).forEach((x) => x.setAttribute('aria-pressed', x === c));
    }));
    $('[data-act=cancel]', sheet).addEventListener('click', closeSheet);
    $('[data-act=save]', sheet).addEventListener('click', async () => {
      const f = $('form', sheet);
      Object.assign(d, { name: f.name.value.trim(), start: f.start.value, end: f.end.value, site: f.site.value.trim(), supervisor: f.supervisor.value.trim() });
      if (!d.name || !d.start) { toast('Add a name and a start date.'); return; }
      if (d.end && d.end < d.start) { toast('The end date is before the start date.'); return; }
      try { await saveRecord('rotations', rec ? rec.id : newId(), d, false, true); } catch (e) { return; }
      closeSheet(); toast('Rotation saved');
    });
    const del = $('[data-act=delete]', sheet);
    if (del) del.addEventListener('click', async () => {
      if (!confirm('Delete this rotation? Cases logged against it are kept.')) return;
      try { await saveRecord('rotations', rec.id, rec.data, true, true); } catch (e) { return; }
      closeSheet(); toast('Rotation deleted');
    });
  }

  // ------------------------------------------------------------ start
  async function boot() {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    try { await loadLocal(); } catch (e) { state.storageError = true; }
    persistStorage();
    if (needsInstall()) { $('#install').hidden = false; $('#app').hidden = true; }
    else showApp();
  }
  boot();
})();
