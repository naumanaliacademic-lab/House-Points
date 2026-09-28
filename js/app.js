/* House Points — user interface */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');
  const modal = $('#modal');
  const modalBody = $('#modal-body');
  const DAY = 86400000;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, w, p = w + 's') => `${n} ${n === 1 ? w : p}`;

  /* ---------- UI state (a few choices are remembered on this device) ---------- */
  const UI_KEY = 'housepoints.ui';
  const ui = {
    view: 'award', group: '', house: '', search: '', selected: new Set(),
    reasonId: null, points: 1, note: '',
    boardPeriod: 'term', boardGroup: '',
    stSearch: '', stGroup: '', stHouse: '', stSort: 'name', stShow: 'active', stSelected: new Set(),
    histPeriod: 'all', histGroup: '', histSearch: '', histLimit: 200,
    bannerHidden: false,
  };
  const REMEMBER = ['group', 'reasonId', 'boardPeriod', 'boardGroup', 'stSort'];
  try { Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch (e) { /* ignore */ }
  function rememberUI() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(Object.fromEntries(REMEMBER.map(k => [k, ui[k]])))); } catch (e) { /* ignore */ }
  }

  /* ---------- helpers ---------- */
  const houseColor = id => (Store.house(id) || {}).color || 'var(--muted)';
  const houseName = id => (Store.house(id) || {}).name || 'No house';
  const dot = id => `<span class="dot" style="background:${houseColor(id)}"></span>`;
  const houseTag = id => id ? `<span class="house-tag">${dot(id)}${esc(houseName(id))}</span>` : '<span class="muted">—</span>';
  const byName = (a, b) => a.name.localeCompare(b.name);
  const ordinal = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));

  const fmtDate = ts => new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  const fmtTime = ts => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  function ago(ts) {
    if (!ts) return 'Never';
    const days = Math.floor((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 60) return `${Math.floor(days / 7)} wk ago`;
    return fmtDate(ts);
  }
  function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

  function groupOptions(selected, allLabel = 'All students') {
    return `<option value="">${esc(allLabel)}</option>` +
      Store.groups().map(g => `<option value="${esc(g)}" ${g === selected ? 'selected' : ''}>${esc(g)}</option>`).join('');
  }
  function houseOptions(selected, emptyLabel = '— No house —') {
    return `<option value="">${esc(emptyLabel)}</option>` +
      Store.get().houses.map(h => `<option value="${h.id}" ${h.id === selected ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
  }
  function groupsDatalist() {
    return `<datalist id="groups-dl">${Store.groups().map(g => `<option value="${esc(g)}">`).join('')}</datalist>`;
  }

  function download(name, text, type = 'text/plain') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function toCSV(rows) {
    return rows.map(r => r.map(v => {
      let s = String(v ?? '');
      if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheets treating text as a formula
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');
  }
  const today = () => Store.isoDate(new Date());

  /* ---------- toasts ---------- */
  function toast(msg, { action, onAction, celebrate = false, ms = 5000 } = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (celebrate ? ' celebrate' : '');
    el.innerHTML = `<span class="msg">${msg}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
    if (action) el.querySelector('button').onclick = () => { onAction(); el.remove(); };
    $('#toasts').appendChild(el);
    const all = $$('#toasts .toast');
    all.slice(0, Math.max(0, all.length - 3)).forEach(t => t.remove());
    setTimeout(() => el.remove(), ms);
  }

  /* ---------- modal ---------- */
  function openModal(html, onOpen) {
    modalBody.innerHTML = html;
    if (!modal.open) modal.showModal();
    modalBody.scrollTop = 0;
    $$('[data-close]', modalBody).forEach(b => b.onclick = closeModal);
    if (onOpen) onOpen(modalBody);
  }
  function closeModal() { if (modal.open) modal.close(); }
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  /* ---------- routing ---------- */
  const VIEWS = { award: renderAward, board: renderBoard, students: renderStudents, history: renderHistory, settings: renderSettings };
  function route() {
    const v = location.hash.replace('#', '');
    ui.view = VIEWS[v] ? v : 'award';
    $$('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.view === ui.view));
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    view.classList.remove('has-bar');
    renderBanner();
    VIEWS[ui.view]();
    $('#toasts').classList.toggle('lift', ui.view === 'award' && ui.selected.size > 0);
  }
  function go(v) { if (location.hash === '#' + v) route(); else location.hash = v; }

  /* ---------- banner (backup reminder / save errors) ---------- */
  function renderBanner() {
    const d = Store.get();
    const el = $('#banner');
    if (Store.saveError) {
      el.innerHTML = `<div class="banner error"><b>⚠️ Your last change could not be saved</b> (browser storage is full or blocked). <span class="spacer"></span><button class="btn small" data-act="backup">Download a backup now</button></div>`;
      return;
    }
    if (!ui.bannerHidden && d.awards.length) {
      const since = d.settings.lastBackup || Math.min(...d.awards.map(a => a.ts));
      const days = Math.floor((Date.now() - since) / DAY);
      if (days >= 7) {
        el.innerHTML = `<div class="banner"><span>💾 Your points are saved only in this browser. ${d.settings.lastBackup ? `Last backup was ${days} days ago.` : 'You have not made a backup yet.'}</span><span class="spacer"></span><button class="btn small primary" data-act="backup">Download backup</button><button class="btn small" data-act="hide-banner">Later</button></div>`;
        return;
      }
    }
    el.innerHTML = '';
  }

  /* =====================================================================
     AWARD
     ===================================================================== */
  function visibleAwardStudents() {
    const q = ui.search.trim().toLowerCase();
    return Store.get().students
      .filter(s => !s.archived)
      .filter(s => !ui.group || s.groups.includes(ui.group))
      .filter(s => !ui.house || s.house === ui.house || (ui.house === 'none' && !s.house))
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.form.toLowerCase().includes(q))
      .sort(byName);
  }

  function emptyStudentsHTML() {
    return `<div class="card empty">
      <div class="big-emoji">🏠</div>
      <h2>Add your students to get started</h2>
      <p class="muted">Import a class list from a CSV or PDF file, paste a list of names, or add students one at a time.</p>
      <div class="row" style="justify-content:center">
        <button class="btn primary big" data-act="import">Import class list</button>
        <button class="btn big" data-act="add-student">Add a student</button>
      </div>
      <p class="small muted" style="margin-top:1rem">Just exploring? <button class="link-btn" data-act="demo">Load demo data</button> (you can delete it later in Settings).</p>
    </div>`;
  }

  function renderAward() {
    const d = Store.get();
    if (!d.students.some(s => !s.archived)) { view.innerHTML = emptyStudentsHTML(); return; }
    if (ui.group && !Store.groups().includes(ui.group)) ui.group = '';
    if (!Store.category(ui.reasonId)) { ui.reasonId = d.categories[0] && d.categories[0].id; ui.points = (d.categories[0] || {}).points || 1; }
    // Drop selections of students that no longer exist
    ui.selected.forEach(id => { const s = Store.student(id); if (!s || s.archived) ui.selected.delete(id); });

    view.innerHTML = `
      <div class="section-head">
        <h1>Award points</h1><span class="spacer"></span>
        <button class="btn small" data-act="select-shown">Select all shown</button>
      </div>
      <div class="toolbar">
        <select id="aw-group" aria-label="Class">${groupOptions(ui.group)}</select>
        <div class="chips" id="aw-house">
          <button class="chip ${!ui.house ? 'on' : ''}" data-house="">All houses</button>
          ${d.houses.map(h => `<button class="chip ${ui.house === h.id ? 'on' : ''}" data-house="${h.id}">${dot(h.id)}${esc(h.name)}</button>`).join('')}
        </div>
        <input type="search" id="aw-search" placeholder="Search name or form…" value="${esc(ui.search)}" autocomplete="off">
      </div>
      <div class="student-grid" id="aw-grid"></div>
      <div class="award-bar" id="aw-bar">
        <div class="inner">
          <div class="row"><span class="sel-count" id="aw-count"></span><span class="spacer"></span><button class="link-btn" data-act="clear-sel">Clear selection</button></div>
          <div class="reasons" id="aw-reasons">
            ${d.categories.map(c => `<button class="chip ${c.id === ui.reasonId ? 'on' : ''}" data-cat="${c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}
          </div>
          <div class="bottom">
            <div class="stepper" aria-label="Points">
              <button type="button" data-step="-1" aria-label="Fewer points">−</button>
              <output id="aw-pts"></output>
              <button type="button" data-step="1" aria-label="More points">+</button>
            </div>
            <input type="text" id="aw-note" placeholder="Note (optional)" maxlength="140" value="${esc(ui.note)}">
            <button class="btn primary big" id="aw-go">Award</button>
          </div>
        </div>
      </div>`;

    $('#aw-group').onchange = e => { ui.group = e.target.value; rememberUI(); updateGrid(); };
    $('#aw-house').onclick = e => {
      const b = e.target.closest('[data-house]'); if (!b) return;
      ui.house = b.dataset.house;
      $$('#aw-house .chip').forEach(c => c.classList.toggle('on', c === b));
      updateGrid();
    };
    const search = $('#aw-search');
    search.oninput = () => { ui.search = search.value; updateGrid(); };
    search.onkeydown = e => {
      if (e.key !== 'Enter') return;
      const vis = visibleAwardStudents();
      if (vis.length === 1) { toggleSelect(vis[0].id); search.value = ui.search = ''; updateGrid(); }
    };
    $('#aw-grid').onclick = e => {
      const card = e.target.closest('.student-card'); if (!card) return;
      toggleSelect(card.dataset.id);
      card.classList.toggle('sel', ui.selected.has(card.dataset.id));
    };
    $('#aw-reasons').onclick = e => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      ui.reasonId = b.dataset.cat;
      ui.points = Store.category(ui.reasonId).points || 1;
      rememberUI();
      $$('#aw-reasons .chip').forEach(c => c.classList.toggle('on', c === b));
      updateBar();
    };
    $$('#aw-bar [data-step]').forEach(b => b.onclick = () => {
      const max = Store.get().settings.maxPoints || 5;
      ui.points = Math.min(max, Math.max(1, ui.points + Number(b.dataset.step)));
      updateBar();
    });
    $('#aw-note').oninput = e => { ui.note = e.target.value; };
    $('#aw-note').onkeydown = e => { if (e.key === 'Enter') doAward(); };
    $('#aw-go').onclick = doAward;

    updateGrid();
    updateBar();
  }

  function toggleSelect(id) {
    if (ui.selected.has(id)) ui.selected.delete(id); else ui.selected.add(id);
    updateBar();
  }

  function updateGrid() {
    const grid = $('#aw-grid'); if (!grid) return;
    const list = visibleAwardStudents();
    const yearTotals = Store.studentTotals(Store.periodStart('year'));
    grid.innerHTML = list.length ? list.map(s => `
      <button class="student-card ${ui.selected.has(s.id) ? 'sel' : ''}" data-id="${s.id}" style="--house:${houseColor(s.house)}" aria-pressed="${ui.selected.has(s.id)}">
        <span class="tick" aria-hidden="true">✓</span>
        <span class="nm">${esc(s.name)}</span>
        <span class="meta"><span>${esc(s.form || houseName(s.house))}</span><span class="pts">${yearTotals.get(s.id) || 0}</span></span>
      </button>`).join('')
      : `<p class="muted" style="grid-column:1/-1">No students match. ${ui.search ? 'Try a different search.' : ''}</p>`;
  }

  function updateBar() {
    const bar = $('#aw-bar'); if (!bar) return;
    const n = ui.selected.size;
    bar.classList.toggle('show', n > 0);
    view.classList.toggle('has-bar', n > 0);
    $('#toasts').classList.toggle('lift', n > 0);
    $('#aw-count').textContent = `${plural(n, 'student')} selected`;
    $('#aw-pts').textContent = plural(ui.points, 'point');
    $('#aw-go').textContent = `Award ${plural(ui.points, 'pt')}${n > 1 ? ` × ${n}` : ''}`;
  }

  function doAward() {
    const ids = [...ui.selected];
    if (!ids.length) return;
    const cat = Store.category(ui.reasonId);
    if (!cat) { toast('Pick a reason first.'); return; }
    const res = Store.award(ids, { categoryId: cat.id, points: ui.points, note: ui.note.trim(), group: ui.group });
    // flash the cards
    ids.forEach(id => {
      const card = $(`.student-card[data-id="${id}"]`);
      if (card) { const f = document.createElement('span'); f.className = 'flash'; f.textContent = `+${ui.points}`; card.appendChild(f); }
    });
    const names = ids.map(id => Store.student(id).name.split(' ')[0]);
    const who = names.length <= 3 ? names.join(', ') : `${names.length} students`;
    ui.selected.clear();
    ui.note = '';
    $('#aw-note').value = '';
    setTimeout(() => { updateGrid(); }, 900);
    updateBar();
    toast(`${cat.emoji} +${ui.points} for ${esc(who)} — ${esc(cat.name)}`, {
      action: 'Undo', ms: 8000,
      onAction: () => { Store.undoBatch(res.batch); toast('Undone.'); if (ui.view === 'award') updateGrid(); },
    });
    res.reached.forEach(r => toast(`🎉 ${esc(r.student.name)} reached <b>${esc(r.milestone.name)}</b> (${r.milestone.points} points this year)!`, { celebrate: true, ms: 9000 }));
    renderBanner();
  }

  /* =====================================================================
     LEADERBOARD
     ===================================================================== */
  function rankHouses(since, groupFilter) {
    const totals = Store.houseTotals(since, groupFilter ? s => s.groups.includes(groupFilter) : null);
    const list = Store.get().houses.map(h => ({ ...h, ...totals[h.id] })).sort((a, b) => b.points - a.points);
    list.forEach((h, i) => { h.rank = i > 0 && h.points === list[i - 1].points ? list[i - 1].rank : i + 1; });
    return list;
  }

  function renderBoard() {
    const d = Store.get();
    if (ui.boardGroup && !Store.groups().includes(ui.boardGroup)) ui.boardGroup = '';
    const since = Store.periodStart(ui.boardPeriod);
    const periodLabel = Store.PERIODS.find(p => p.id === ui.boardPeriod).label;
    const inGroup = s => !ui.boardGroup || s.groups.includes(ui.boardGroup);
    const houses = rankHouses(since, ui.boardGroup);
    const max = Math.max(1, ...houses.map(h => h.points));

    const awards = Store.awardsSince(since).filter(a => { const s = Store.student(a.studentId); return s && inGroup(s); });
    const totals = new Map();
    awards.forEach(a => totals.set(a.studentId, (totals.get(a.studentId) || 0) + a.points));
    const top = [...totals.entries()].map(([id, pts]) => ({ s: Store.student(id), pts })).filter(x => x.s && !x.s.archived)
      .sort((a, b) => b.pts - a.pts || byName(a.s, b.s)).slice(0, 10);

    const reasons = new Map();
    awards.forEach(a => reasons.set(a.category || 'Other', (reasons.get(a.category || 'Other') || 0) + a.points));
    const reasonList = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const rMax = Math.max(1, ...reasonList.map(r => r[1]));

    const quietDays = d.settings.quietDays || 28;
    const last = Store.lastAwardMap();
    const cutoff = Date.now() - quietDays * DAY;
    const quiet = d.students.filter(s => !s.archived && inGroup(s) && (last.get(s.id) || 0) < cutoff).sort(byName);

    view.innerHTML = `
      <div class="section-head">
        <h1>Leaderboard</h1><span class="spacer"></span>
        <button class="btn" data-act="display">📺 Show on big screen</button>
      </div>
      <div class="toolbar">
        <div class="segmented" id="bd-period">
          ${Store.PERIODS.map(p => `<button class="${p.id === ui.boardPeriod ? 'on' : ''}" data-period="${p.id}">${p.label}</button>`).join('')}
        </div>
        <select id="bd-group" aria-label="Class">${groupOptions(ui.boardGroup, 'All my students')}</select>
      </div>
      <div class="houses">
        ${houses.map(h => `
          <div class="house-card ${h.id}" style="--house:${h.color}">
            ${h.rank === 1 && h.points > 0 ? '<span class="crown" aria-hidden="true">👑</span>' : ''}
            <div class="rank">${ordinal(h.rank)}</div>
            <div class="hname">${esc(h.name)}</div>
            <div class="total">${h.points}</div>
            <div class="sub">points · ${plural(h.awards, 'award')}</div>
            <div class="bar"><i style="width:${(h.points / max) * 100}%"></i></div>
          </div>`).join('')}
      </div>
      <div class="two-col">
        <div class="card">
          <h2>Top students · ${esc(periodLabel.toLowerCase())}</h2>
          ${top.length ? `<ol class="rank-list">${top.map((x, i) => `
            <li><span class="n">${i + 1}</span>${dot(x.s.house)}<span class="nm">${esc(x.s.name)} <span class="muted small">${esc(x.s.form)}</span></span><span class="v">${x.pts}</span></li>`).join('')}</ol>`
            : '<p class="muted">No points awarded in this period yet.</p>'}
        </div>
        <div style="display:grid;gap:1rem">
          <div class="card">
            <h2>Points given for</h2>
            ${reasonList.length ? `<ul class="rank-list">${reasonList.map(([name, v]) => {
              const c = d.categories.find(c => c.name === name);
              return `<li><span class="nm" style="flex:0 0 40%">${esc(c ? c.emoji : '•')} ${esc(name)}</span><span class="hbar"><i style="width:${(v / rMax) * 100}%"></i></span><span class="v">${v}</span></li>`;
            }).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}
          </div>
          <div class="card">
            <h2>Not recognised in the last ${quietDays} days</h2>
            ${quiet.length ? `<p class="muted small">${plural(quiet.length, 'student')} — tap a name to award them points.</p>
              <div class="quiet-list">${quiet.slice(0, 60).map(s => `<button class="chip" data-quiet="${s.id}">${dot(s.house)}${esc(s.name)}</button>`).join('')}
              ${quiet.length > 60 ? `<span class="muted small">+${quiet.length - 60} more</span>` : ''}</div>`
              : '<p class="muted">Everyone has been recognised recently. 🎉</p>'}
          </div>
        </div>
      </div>`;

    $('#bd-period').onclick = e => { const b = e.target.closest('[data-period]'); if (!b) return; ui.boardPeriod = b.dataset.period; rememberUI(); renderBoard(); };
    $('#bd-group').onchange = e => { ui.boardGroup = e.target.value; rememberUI(); renderBoard(); };
    view.querySelectorAll('[data-quiet]').forEach(b => b.onclick = () => {
      ui.selected = new Set([b.dataset.quiet]); ui.search = ''; ui.house = ''; ui.group = '';
      go('award');
    });
  }

  /* ---------- big-screen display ---------- */
  function showDisplay() {
    const el = $('#display');
    const since = Store.periodStart(ui.boardPeriod);
    const houses = rankHouses(since, ui.boardGroup);
    const max = Math.max(1, ...houses.map(h => h.points));
    const order = Store.get().houses.map(h => houses.find(x => x.id === h.id));
    const label = Store.PERIODS.find(p => p.id === ui.boardPeriod).label;
    el.innerHTML = `
      <div class="d-head"><h1>House Points</h1><span class="when">${esc(label)}${ui.boardGroup ? ' · ' + esc(ui.boardGroup) : ''}</span>
        <button class="d-close" id="d-close">Close ✕</button></div>
      <div class="d-cols">${order.map(h => `
        <div class="d-col" style="--house:${h.color}">
          <div class="d-val">${h.points}</div>
          <div class="d-bar" data-h="${Math.max(2, (h.points / max) * 100)}"></div>
          <div class="d-name">${esc(h.name)}</div>
          <div class="d-rank">${ordinal(h.rank)}${h.rank === 1 && h.points > 0 ? ' 👑' : ''}</div>
        </div>`).join('')}</div>`;
    el.hidden = false;
    const close = () => { el.hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
    $('#d-close').onclick = close;
    el.onkeydown = e => { if (e.key === 'Escape') close(); };
    el.tabIndex = -1; el.focus();
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$('.d-bar', el).forEach(b => { b.style.height = `calc(${b.dataset.h / 100} * (100vh - 22rem))`; });
    }));
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) $('#display').hidden = true; });

  /* =====================================================================
     STUDENTS
     ===================================================================== */
  function filteredStudents() {
    const q = ui.stSearch.trim().toLowerCase();
    const yearT = Store.studentTotals(Store.periodStart('year'));
    const allT = Store.studentTotals(0);
    const last = Store.lastAwardMap();
    const list = Store.get().students
      .filter(s => (ui.stShow === 'archived') === s.archived)
      .filter(s => !ui.stGroup || s.groups.includes(ui.stGroup))
      .filter(s => !ui.stHouse || s.house === ui.stHouse || (ui.stHouse === 'none' && !s.house))
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.form.toLowerCase().includes(q))
      .map(s => ({ s, year: yearT.get(s.id) || 0, all: allT.get(s.id) || 0, last: last.get(s.id) || 0 }));
    const sorters = {
      name: (a, b) => byName(a.s, b.s),
      points: (a, b) => b.year - a.year || byName(a.s, b.s),
      quiet: (a, b) => a.last - b.last || byName(a.s, b.s),
      form: (a, b) => a.s.form.localeCompare(b.s.form, undefined, { numeric: true }) || byName(a.s, b.s),
      house: (a, b) => houseName(a.s.house).localeCompare(houseName(b.s.house)) || byName(a.s, b.s),
    };
    return list.sort(sorters[ui.stSort] || sorters.name);
  }

  function renderStudents() {
    const d = Store.get();
    if (!d.students.length) { view.innerHTML = `<div class="section-head"><h1>Students</h1></div>` + emptyStudentsHTML(); return; }
    if (ui.stGroup && !Store.groups().includes(ui.stGroup)) ui.stGroup = '';
    const archivedCount = d.students.filter(s => s.archived).length;
    view.innerHTML = `
      <div class="section-head">
        <h1>Students <span class="muted" style="font-weight:500">(${d.students.filter(s => !s.archived).length})</span></h1>
        <span class="spacer"></span>
        <button class="btn" data-act="add-student">＋ Add student</button>
        <button class="btn primary" data-act="import">Import CSV / PDF</button>
      </div>
      <div class="toolbar">
        <input type="search" id="st-search" placeholder="Search name or form…" value="${esc(ui.stSearch)}">
        <select id="st-group" aria-label="Class">${groupOptions(ui.stGroup, 'All classes')}</select>
        <select id="st-house" aria-label="House">
          <option value="">All houses</option>
          ${d.houses.map(h => `<option value="${h.id}" ${ui.stHouse === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
          <option value="none" ${ui.stHouse === 'none' ? 'selected' : ''}>No house set</option>
        </select>
        <select id="st-sort" aria-label="Sort">
          <option value="name">Sort: name</option>
          <option value="points">Sort: most points this year</option>
          <option value="quiet">Sort: longest without points</option>
          <option value="form">Sort: form</option>
          <option value="house">Sort: house</option>
        </select>
        ${archivedCount ? `<select id="st-show" aria-label="Show"><option value="active">Current students</option><option value="archived" ${ui.stShow === 'archived' ? 'selected' : ''}>Archived (${archivedCount})</option></select>` : ''}
      </div>
      <div id="st-bulk"></div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th class="chk"><input type="checkbox" id="st-all" aria-label="Select all"></th>
            <th>Name</th><th>Form</th><th>House</th><th>Classes</th>
            <th class="num">This year</th><th class="num">All time</th><th>Last award</th>
          </tr></thead>
          <tbody id="st-body"></tbody>
        </table>
      </div>
      ${groupsDatalist()}`;

    $('#st-sort').value = ui.stSort;
    $('#st-search').oninput = e => { ui.stSearch = e.target.value; updateStudentRows(); };
    $('#st-group').onchange = e => { ui.stGroup = e.target.value; ui.stSelected.clear(); updateStudentRows(); };
    $('#st-house').onchange = e => { ui.stHouse = e.target.value; updateStudentRows(); };
    $('#st-sort').onchange = e => { ui.stSort = e.target.value; rememberUI(); updateStudentRows(); };
    if ($('#st-show')) $('#st-show').onchange = e => { ui.stShow = e.target.value; ui.stSelected.clear(); updateStudentRows(); };
    $('#st-all').onchange = e => {
      const ids = filteredStudents().map(x => x.s.id);
      ui.stSelected = new Set(e.target.checked ? ids : []);
      updateStudentRows();
    };
    $('#st-body').onclick = e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      if (e.target.matches('input[type=checkbox]')) {
        if (e.target.checked) ui.stSelected.add(tr.dataset.id); else ui.stSelected.delete(tr.dataset.id);
        renderBulk();
        return;
      }
      if (e.target.closest('td.chk')) return;
      openStudent(tr.dataset.id);
    };
    updateStudentRows();
  }

  function updateStudentRows() {
    const body = $('#st-body'); if (!body) return;
    const rows = filteredStudents();
    const valid = new Set(rows.map(r => r.s.id));
    ui.stSelected.forEach(id => { if (!valid.has(id)) ui.stSelected.delete(id); });
    body.innerHTML = rows.length ? rows.map(({ s, year, all, last }) => `
      <tr class="clickable" data-id="${s.id}">
        <td class="chk"><input type="checkbox" ${ui.stSelected.has(s.id) ? 'checked' : ''} aria-label="Select ${esc(s.name)}"></td>
        <td><b>${esc(s.name)}</b></td>
        <td>${esc(s.form)}</td>
        <td>${houseTag(s.house)}</td>
        <td class="small muted">${esc(s.groups.join(', '))}</td>
        <td class="num"><b>${year}</b></td>
        <td class="num">${all}</td>
        <td class="small ${last ? '' : 'muted'}">${ago(last)}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="muted">No students match.</td></tr>`;
    $('#st-all').checked = rows.length > 0 && rows.every(r => ui.stSelected.has(r.s.id));
    renderBulk();
  }

  function renderBulk() {
    const el = $('#st-bulk'); if (!el) return;
    const ids = [...ui.stSelected];
    if (!ids.length) { el.innerHTML = ''; return; }
    const archived = ui.stShow === 'archived';
    el.innerHTML = `<div class="bulk-bar">
      <b>${ids.length} selected</b>
      <select id="bk-house"><option value="">Set house…</option>${Store.get().houses.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}<option value="none">No house</option></select>
      <span class="row" style="gap:.3rem"><input type="text" id="bk-group" list="groups-dl" placeholder="Class name" style="width:140px"><button class="btn small" id="bk-addgroup">Add to class</button></span>
      ${ui.stGroup ? `<button class="btn small" id="bk-rmgroup">Remove from ${esc(ui.stGroup)}</button>` : ''}
      <button class="btn small" id="bk-award">Award points</button>
      <span class="spacer"></span>
      <button class="btn small" id="bk-archive">${archived ? 'Restore' : 'Archive'}</button>
      <button class="btn small danger" id="bk-delete">Delete</button>
    </div>`;
    const done = msg => { toast(msg); renderStudents(); };
    $('#bk-house').onchange = e => {
      const h = e.target.value === 'none' ? '' : e.target.value;
      Store.bulk(ids, s => { s.house = h; });
      done(`House updated for ${plural(ids.length, 'student')}.`);
    };
    $('#bk-addgroup').onclick = () => {
      const g = $('#bk-group').value.trim(); if (!g) { $('#bk-group').focus(); return; }
      Store.bulk(ids, s => { if (!s.groups.includes(g)) s.groups.push(g); });
      done(`Added ${plural(ids.length, 'student')} to ${esc(g)}.`);
    };
    if ($('#bk-rmgroup')) $('#bk-rmgroup').onclick = () => {
      const g = ui.stGroup;
      Store.bulk(ids, s => { s.groups = s.groups.filter(x => x !== g); });
      ui.stSelected.clear();
      done(`Removed ${plural(ids.length, 'student')} from ${esc(g)}.`);
    };
    $('#bk-award').onclick = () => { ui.selected = new Set(ids); ui.group = ''; ui.house = ''; ui.search = ''; go('award'); };
    $('#bk-archive').onclick = () => {
      Store.bulk(ids, s => { s.archived = !archived; });
      ui.stSelected.clear();
      done(archived ? `Restored ${plural(ids.length, 'student')}.` : `Archived ${plural(ids.length, 'student')}. Their points still count for their house.`);
    };
    $('#bk-delete').onclick = () => {
      if (!confirm(`Delete ${plural(ids.length, 'student')} and all their points? This cannot be undone.\n\nTip: use Archive instead for students who have left — their points keep counting for their house.`)) return;
      Store.deleteStudents(ids);
      ui.stSelected.clear();
      done(`Deleted ${plural(ids.length, 'student')}.`);
    };
  }

  /* ---------- student details ---------- */
  function studentForm(s, groups) {
    return `
      <div class="grid-2">
        <label class="field">Name<input type="text" id="sm-name" value="${esc(s.name)}" autocomplete="off" required></label>
        <label class="field">House<select id="sm-house">${houseOptions(s.house)}</select></label>
        <label class="field">Form / tutor group<input type="text" id="sm-form" value="${esc(s.form)}" placeholder="e.g. 10X"></label>
        <label class="field">Year<input type="text" id="sm-year" value="${esc(s.year)}" placeholder="e.g. 10" inputmode="numeric"></label>
      </div>
      <div style="margin-top:.9rem">
        <div class="small muted" style="font-weight:600;margin-bottom:.3rem">Classes</div>
        <div class="row" id="sm-groups"></div>
        <div class="row" style="margin-top:.4rem;gap:.3rem">
          <input type="text" id="sm-newgroup" list="groups-dl" placeholder="Add to class, e.g. 10X Physics" style="flex:1">
          <button class="btn small" id="sm-addgroup" type="button">Add</button>
        </div>
      </div>
      ${groupsDatalist()}`;
  }

  function bindGroupEditor(groups) {
    const draw = () => {
      $('#sm-groups').innerHTML = groups.length
        ? groups.map((g, i) => `<span class="group-chip">${esc(g)}<button type="button" data-rm="${i}" aria-label="Remove ${esc(g)}">×</button></span>`).join('')
        : '<span class="muted small">Not in any class yet.</span>';
      $$('#sm-groups [data-rm]').forEach(b => b.onclick = () => { groups.splice(Number(b.dataset.rm), 1); draw(); });
    };
    const add = () => {
      const g = $('#sm-newgroup').value.trim();
      if (g && !groups.includes(g)) groups.push(g);
      $('#sm-newgroup').value = '';
      draw();
    };
    $('#sm-addgroup').onclick = add;
    $('#sm-newgroup').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    draw();
    return () => { add(); return groups; };
  }

  function readStudentForm(getGroups) {
    return {
      name: $('#sm-name').value.replace(/\s+/g, ' ').trim(),
      house: $('#sm-house').value,
      form: $('#sm-form').value.trim(),
      year: $('#sm-year').value.trim(),
      groups: getGroups(),
    };
  }

  function openAddStudent() {
    const blank = { name: '', house: '', form: '', year: '' };
    const groups = ui.stGroup ? [ui.stGroup] : ui.group ? [ui.group] : [];
    openModal(`
      <div class="modal-head"><h2>Add a student</h2><button class="btn icon" data-close aria-label="Close">✕</button></div>
      ${studentForm(blank, groups)}
      <div class="modal-foot">
        <button class="btn" data-close>Cancel</button>
        <button class="btn" id="sm-save-another">Save &amp; add another</button>
        <button class="btn primary" id="sm-save">Save</button>
      </div>`, () => {
      const getGroups = bindGroupEditor(groups);
      const save = again => {
        const v = readStudentForm(getGroups);
        if (!v.name) { $('#sm-name').focus(); return; }
        if (Store.findStudentByName(v.name) && !confirm(`There is already a student called ${v.name}. Add another one?`)) return;
        Store.addStudent(v);
        Store.save();
        toast(`Added ${esc(v.name)}.`);
        if (again) { $('#sm-name').value = ''; $('#sm-name').focus(); } else closeModal();
        render();
      };
      $('#sm-save').onclick = () => save(false);
      $('#sm-save-another').onclick = () => save(true);
      $('#sm-name').onkeydown = e => { if (e.key === 'Enter') save(true); };
      setTimeout(() => $('#sm-name').focus(), 50);
    });
  }

  function openStudent(id) {
    const s = Store.student(id); if (!s) return;
    const groups = [...s.groups];
    const awards = Store.get().awards.filter(a => a.studentId === id).sort((a, b) => b.ts - a.ts);
    const sum = since => awards.filter(a => a.ts >= since).reduce((t, a) => t + a.points, 0);
    const year = sum(Store.periodStart('year'));
    const { current, next } = Store.milestoneFor(year);
    openModal(`
      <div class="modal-head">${dot(s.house)}<h2>${esc(s.name)}</h2><button class="btn icon" data-close aria-label="Close">✕</button></div>
      <div class="stats">
        <div class="stat"><div class="v">${sum(Store.periodStart('term'))}</div><div class="l">This term</div></div>
        <div class="stat"><div class="v">${year}</div><div class="l">This year</div></div>
        <div class="stat"><div class="v">${sum(0)}</div><div class="l">All time</div></div>
      </div>
      <p>${current ? `🏅 <b>${esc(current.name)}</b> reached this year.` : 'No milestone yet this year.'}
         ${next ? `<span class="muted">${next.points - year} more for ${esc(next.name)}.</span>` : ''}</p>
      ${studentForm(s, groups)}
      <h3 style="margin-top:1.1rem">Recent awards</h3>
      ${awards.length ? `<div>${awards.slice(0, 25).map(a => `
        <div class="hist-item">
          <span class="time">${new Date(a.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          <span class="what">${esc(a.category)}${a.note ? ` <span class="muted small">— ${esc(a.note)}</span>` : ''}</span>
          <span class="plus">+${a.points}</span>
          <button class="btn icon small" data-del-award="${a.id}" aria-label="Remove this award">✕</button>
        </div>`).join('')}${awards.length > 25 ? `<p class="muted small">…and ${awards.length - 25} older awards (see History).</p>` : ''}</div>`
        : '<p class="muted">No points yet.</p>'}
      <div class="modal-foot">
        <button class="btn danger" id="sm-delete">Delete</button>
        <button class="btn" id="sm-archive">${s.archived ? 'Restore student' : 'Archive (left)'}</button>
        <span class="spacer"></span>
        <button class="btn" id="sm-award">Award points</button>
        <button class="btn primary" id="sm-save">Save</button>
      </div>`, () => {
      const getGroups = bindGroupEditor(groups);
      $('#sm-save').onclick = () => {
        const v = readStudentForm(getGroups);
        if (!v.name) { $('#sm-name').focus(); return; }
        Store.updateStudent(id, v);
        toast('Saved.');
        closeModal(); render();
      };
      $('#sm-award').onclick = () => {
        ui.selected = new Set([id]); ui.group = ''; ui.house = ''; ui.search = '';
        closeModal(); go('award');
      };
      $('#sm-archive').onclick = () => {
        Store.updateStudent(id, { archived: !s.archived });
        toast(s.archived ? 'Restored.' : `Archived ${esc(s.name)}. Their points still count for ${esc(houseName(s.house))}.`);
        closeModal(); render();
      };
      $('#sm-delete').onclick = () => {
        if (!confirm(`Delete ${s.name} and all ${plural(awards.length, 'award')}? This cannot be undone.`)) return;
        Store.deleteStudents([id]);
        toast(`Deleted ${esc(s.name)}.`);
        closeModal(); render();
      };
      $$('[data-del-award]', modalBody).forEach(b => b.onclick = () => {
        if (!confirm('Remove this award?')) return;
        Store.deleteAward(b.dataset.delAward);
        openStudent(id); render();
      });
    });
  }

  /* =====================================================================
     IMPORT
     ===================================================================== */
  const im = { rows: [], mapping: null, candidates: [], source: '', fileName: '', tidy: true, group: '', house: '', form: '' };

  function openImport() {
    openModal(`
      <div class="modal-head"><h2>Import students</h2><button class="btn icon" data-close aria-label="Close">✕</button></div>
      <div class="drop" id="im-drop" tabindex="0" role="button">
        <div style="font-size:2rem">📄</div>
        <b>Choose a CSV or PDF class list</b><br><span class="muted small">or drag and drop it here</span>
      </div>
      <p class="small muted" style="margin-top:.8rem">
        Best results: export a class list from your school system (SIMS, Arbor, Bromcom…) as <b>CSV</b>.
        PDF lists work too. Excel files: use <i>File → Save As → CSV</i> first.
        Students already on your list are matched by name, so nobody is added twice.
      </p>
      <details style="margin-top:.6rem">
        <summary style="cursor:pointer;font-weight:600">…or paste a list of names</summary>
        <p class="small muted" style="margin:.5rem 0">One student per line. You can copy columns straight from a spreadsheet (e.g. name, form, house).</p>
        <textarea id="im-paste" placeholder="Aisha Khan&#10;Ben Taylor&#10;SMITH, Chloe"></textarea>
        <div class="row end" style="margin-top:.5rem"><button class="btn primary" id="im-paste-go">Continue</button></div>
      </details>`, () => {
      const drop = $('#im-drop');
      drop.onclick = () => $('#file-import').click();
      drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file-import').click(); } };
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) readImportFile(e.dataTransfer.files[0]); };
      $('#im-paste-go').onclick = () => {
        const t = $('#im-paste').value;
        if (!t.trim()) { $('#im-paste').focus(); return; }
        startMapping(Importer.textToRows(t), 'paste', 'Pasted list');
      };
    });
  }

  $('#file-import').onchange = e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) readImportFile(f);
  };

  async function readImportFile(file) {
    const drop = $('#im-drop');
    if (drop) drop.innerHTML = `<div style="font-size:2rem">⏳</div><b>Reading ${esc(file.name)}…</b>`;
    try {
      const { rows, source } = await Importer.fileToRows(file);
      if (!rows.length) throw new Error(source === 'pdf'
        ? 'No text found in this PDF. If it is a scanned image, the names cannot be read — try exporting the list as CSV instead.'
        : 'The file looks empty.');
      startMapping(rows, source, file.name);
    } catch (err) {
      console.error(err);
      openImport();
      toast(`⚠️ ${esc(err.message || 'Could not read that file.')}`, { ms: 9000 });
    }
  }

  function startMapping(rows, source, fileName) {
    im.rows = rows;
    im.source = source;
    im.fileName = fileName;
    im.mapping = Importer.guessMapping(rows);
    im.tidy = true;
    im.house = ''; im.form = '';
    const stem = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();
    im.group = ui.stGroup || ui.group || (source === 'paste' ? '' : stem.slice(0, 40));
    im.candidates = Importer.buildCandidates(im.rows, im.mapping, { tidy: im.tidy });
    renderMapping();
  }

  function renderMapping() {
    const width = im.mapping.cols.length;
    const hdr = im.mapping.headerRow >= 0 ? im.rows[im.mapping.headerRow] : null;
    const firstData = im.rows[im.mapping.headerRow + 1] || [];
    const colLabel = i => hdr && hdr[i] ? hdr[i] : `Column ${i + 1}${firstData[i] ? ` (“${firstData[i].slice(0, 18)}”)` : ''}`;
    const hasName = ['full', 'first', 'last'].some(r => im.mapping.cols.includes(r));

    openModal(`
      <div class="modal-head"><h2>Check the list</h2><button class="btn icon" data-close aria-label="Close">✕</button></div>
      <p class="muted small" style="margin-top:-.4rem">From <b>${esc(im.fileName)}</b> · ${plural(im.rows.length, 'line')} read.
        Untick anything that is not a student (titles, page numbers…). You can edit names before importing.</p>
      ${width > 1 || hdr ? `
        <div class="small" style="font-weight:700">What is in each column?</div>
        <div class="map-row">${im.mapping.cols.map((role, i) => `
          <label><span title="${esc(colLabel(i))}">${esc(colLabel(i))}</span>
            <select data-col="${i}">${Importer.ROLES.map(r => `<option value="${r.id}" ${r.id === role ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
          </label>`).join('')}</div>` : ''}
      ${!hasName ? '<p class="banner error" style="margin:0 0 .8rem">Choose which column holds the student names.</p>' : ''}
      <div class="grid-2" style="margin-bottom:.8rem">
        <label class="field">Add everyone to class<input type="text" id="im-group" list="groups-dl" value="${esc(im.group)}" placeholder="e.g. 10X Physics (optional)"></label>
        <label class="field">House for anyone without one<select id="im-house">${houseOptions(im.house, '— Leave blank —')}</select></label>
        <label class="field">Form for anyone without one<input type="text" id="im-form" value="${esc(im.form)}" placeholder="e.g. 10X (optional)"></label>
        <label class="field" style="flex-direction:row;align-items:center;gap:.5rem;margin-top:1.3rem"><input type="checkbox" id="im-tidy" ${im.tidy ? 'checked' : ''}> Tidy capitals (SMITH → Smith)</label>
      </div>
      <div class="preview-wrap">
        <table>
          <thead><tr><th class="chk"><input type="checkbox" id="im-all" aria-label="Select all"></th><th>Name</th><th>Form</th><th>House</th><th></th></tr></thead>
          <tbody id="im-body"></tbody>
        </table>
      </div>
      ${groupsDatalist()}
      <div class="modal-foot">
        <button class="btn" id="im-back">← Choose another file</button>
        <span class="spacer"></span>
        <button class="btn primary" id="im-go"></button>
      </div>`, () => {
      $$('[data-col]', modalBody).forEach(sel => sel.onchange = () => {
        const i = Number(sel.dataset.col);
        // one column per role (except ignore)
        if (sel.value !== 'ignore') im.mapping.cols = im.mapping.cols.map((r, j) => (j !== i && r === sel.value ? 'ignore' : r));
        im.mapping.cols[i] = sel.value;
        im.candidates = Importer.buildCandidates(im.rows, im.mapping, { tidy: im.tidy });
        renderMapping();
      });
      $('#im-tidy').onchange = e => { im.tidy = e.target.checked; im.candidates = Importer.buildCandidates(im.rows, im.mapping, { tidy: im.tidy }); drawPreview(); };
      $('#im-group').oninput = e => { im.group = e.target.value; };
      $('#im-house').onchange = e => { im.house = e.target.value; drawPreview(); };
      $('#im-form').oninput = e => { im.form = e.target.value; };
      $('#im-all').onchange = e => { im.candidates.forEach(c => { c.include = e.target.checked && !!c.name.trim(); }); drawPreview(); };
      $('#im-back').onclick = openImport;
      $('#im-go').onclick = finishImport;
      $('#im-body').addEventListener('input', e => {
        const tr = e.target.closest('tr[data-i]'); if (!tr) return;
        const c = im.candidates[Number(tr.dataset.i)];
        const f = e.target.dataset.f;
        if (f === 'include') c.include = e.target.checked;
        else c[f] = e.target.value;
        if (f === 'include') tr.classList.toggle('off', !c.include);
        updateImportButton();
      });
      drawPreview();
    });
  }

  function drawPreview() {
    const badge = {
      new: '<span class="badge new">New</span>',
      existing: '<span class="badge">Already added — will update</span>',
      dup: '<span class="badge warn">Repeated in list</span>',
      odd: '<span class="badge warn">Check this</span>',
    };
    $('#im-body').innerHTML = im.candidates.length ? im.candidates.map((c, i) => `
      <tr data-i="${i}" class="${c.include ? '' : 'off'}">
        <td class="chk"><input type="checkbox" data-f="include" ${c.include ? 'checked' : ''} aria-label="Include"></td>
        <td style="min-width:180px"><input type="text" data-f="name" value="${esc(c.name)}"></td>
        <td style="width:90px"><input type="text" data-f="form" value="${esc(c.form)}" placeholder="${esc(im.form)}"></td>
        <td style="width:130px"><select data-f="house">${houseOptions(c.house, im.house ? `(${houseName(im.house)})` : '—')}</select></td>
        <td>${badge[c.status] || ''}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="muted">No names found. Check the column choices above.</td></tr>';
    updateImportButton();
  }

  function updateImportButton() {
    const n = im.candidates.filter(c => c.include && c.name.trim()).length;
    const btn = $('#im-go');
    if (!btn) return;
    btn.textContent = `Import ${plural(n, 'student')}`;
    btn.disabled = n === 0;
    const all = $('#im-all');
    if (all) all.checked = n > 0 && im.candidates.every(c => c.include || !c.name.trim());
  }

  function finishImport() {
    const rows = im.candidates.filter(c => c.include && c.name.trim()).map(c => ({
      name: c.name.replace(/\s+/g, ' ').trim(),
      form: c.form.trim() || im.form.trim(),
      house: c.house || im.house,
      year: c.year || ((c.form || im.form).match(/^\d{1,2}/) || [''])[0],
    }));
    const group = im.group.trim();
    const { added, updated } = Store.importStudents(rows, { group });
    closeModal();
    const noHouse = rows.filter(r => !r.house).length;
    toast(`✅ Imported: ${plural(added, 'new student')}${updated ? `, ${updated} already on your list` : ''}${group ? ` · class “${esc(group)}”` : ''}.`, { ms: 7000 });
    if (noHouse) toast(`${plural(noHouse, 'student')} ${noHouse === 1 ? 'has' : 'have'} no house yet — select them on the Students page and use “Set house”.`, { ms: 9000 });
    if (group) { ui.stGroup = group; ui.group = group; }
    if (noHouse) { ui.stHouse = 'none'; go('students'); } else { ui.stHouse = ''; go(ui.view === 'students' ? 'students' : 'award'); }
  }

  /* =====================================================================
     HISTORY
     ===================================================================== */
  function renderHistory() {
    const d = Store.get();
    if (ui.histGroup && !Store.groups().includes(ui.histGroup)) ui.histGroup = '';
    view.innerHTML = `
      <div class="section-head">
        <h1>History</h1><span class="spacer"></span>
        <button class="btn" data-act="export-awards">⬇︎ Export CSV</button>
      </div>
      <div class="toolbar">
        <div class="segmented" id="hi-period">
          ${Store.PERIODS.map(p => `<button class="${p.id === ui.histPeriod ? 'on' : ''}" data-period="${p.id}">${p.label}</button>`).join('')}
        </div>
        <select id="hi-group" aria-label="Class">${groupOptions(ui.histGroup, 'All classes')}</select>
        <input type="search" id="hi-search" placeholder="Search student, reason or note…" value="${esc(ui.histSearch)}">
      </div>
      <div id="hi-list"></div>`;
    $('#hi-period').onclick = e => { const b = e.target.closest('[data-period]'); if (!b) return; ui.histPeriod = b.dataset.period; ui.histLimit = 200; renderHistory(); };
    $('#hi-group').onchange = e => { ui.histGroup = e.target.value; drawHistory(); };
    $('#hi-search').oninput = e => { ui.histSearch = e.target.value; drawHistory(); };
    $('#hi-list').onclick = e => {
      const del = e.target.closest('[data-del-award]');
      if (del) {
        if (!confirm('Remove this award?')) return;
        Store.deleteAward(del.dataset.delAward); drawHistory(); return;
      }
      if (e.target.closest('[data-more]')) { ui.histLimit += 300; drawHistory(); return; }
      const who = e.target.closest('[data-student]');
      if (who) openStudent(who.dataset.student);
    };
    drawHistory();
    if (!d.awards.length) $('#hi-list').innerHTML = '<div class="card empty"><div class="big-emoji">🕘</div><p class="muted">Points you award will appear here.</p></div>';
  }

  function historyAwards() {
    const since = Store.periodStart(ui.histPeriod);
    const q = ui.histSearch.trim().toLowerCase();
    return Store.get().awards
      .filter(a => a.ts >= since)
      .map(a => ({ a, s: Store.student(a.studentId) }))
      .filter(({ s }) => s && (!ui.histGroup || s.groups.includes(ui.histGroup)))
      .filter(({ a, s }) => !q || s.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.note.toLowerCase().includes(q))
      .sort((x, y) => y.a.ts - x.a.ts);
  }

  function drawHistory() {
    const el = $('#hi-list'); if (!el) return;
    const all = historyAwards();
    const list = all.slice(0, ui.histLimit);
    if (!all.length) { el.innerHTML = '<p class="muted">No awards match.</p>'; return; }
    const total = all.reduce((t, x) => t + x.a.points, 0);
    let html = `<p class="muted small">${plural(all.length, 'award')} · ${plural(total, 'point')}</p>`;
    let lastDay = '';
    const todayStart = startOfDay(Date.now());
    for (const { a, s } of list) {
      const dayStart = startOfDay(a.ts);
      const label = dayStart === todayStart ? 'Today' : dayStart === todayStart - DAY ? 'Yesterday' : fmtDate(a.ts);
      if (label !== lastDay) { html += `<div class="day-head">${label}</div>`; lastDay = label; }
      html += `<div class="hist-item">
        <span class="time">${fmtTime(a.ts)}</span>${dot(s.house)}
        <span class="what"><button class="link-btn nm" style="text-decoration:none;color:inherit;font-weight:700" data-student="${s.id}">${esc(s.name)}</button>
          <span class="muted small"> · ${esc(a.category)}${a.note ? ` — ${esc(a.note)}` : ''}</span></span>
        <span class="plus">+${a.points}</span>
        <button class="btn icon small" data-del-award="${a.id}" aria-label="Remove this award">✕</button>
      </div>`;
    }
    if (all.length > list.length) html += `<div class="row" style="justify-content:center;margin-top:.8rem"><button class="btn" data-more>Show more</button></div>`;
    el.innerHTML = html;
  }

  /* =====================================================================
     SETTINGS
     ===================================================================== */
  function renderSettings() {
    const d = Store.get();
    const st = d.settings;
    const groups = Store.groups();
    const counts = Object.fromEntries(groups.map(g => [g, d.students.filter(s => !s.archived && s.groups.includes(g)).length]));
    view.innerHTML = `
      <div class="section-head"><h1>Settings</h1></div>
      <div class="settings-grid">
        <div class="card">
          <h2>Reasons for points</h2>
          <p class="muted small">Shown as buttons when awarding. The number is the default points for that reason.</p>
          <div id="set-cats">${d.categories.map(c => `
            <div class="cat-row" data-id="${c.id}">
              <input type="text" class="emoji" data-f="emoji" value="${esc(c.emoji)}" maxlength="4" aria-label="Emoji">
              <input type="text" data-f="name" value="${esc(c.name)}" aria-label="Reason">
              <input type="number" data-f="points" value="${c.points}" min="1" max="${st.maxPoints || 5}" aria-label="Points">
              <button class="btn icon small danger" data-rm-cat aria-label="Delete reason">✕</button>
            </div>`).join('')}</div>
          <button class="btn small" id="set-addcat">＋ Add reason</button>
        </div>

        <div class="card">
          <h2>Houses</h2>
          <div id="set-houses">${d.houses.map(h => `
            <div class="house-row" data-id="${h.id}">
              <input type="color" data-f="color" value="${esc(h.color)}" aria-label="${esc(h.name)} colour">
              <input type="text" data-f="name" value="${esc(h.name)}" aria-label="House name">
            </div>`).join('')}</div>

          <h2 style="margin-top:1.2rem">Dates</h2>
          <div class="grid-2">
            <label class="field">Academic year starts<input type="date" id="set-year" value="${esc(st.yearStart)}"></label>
            <label class="field">This term started<input type="date" id="set-term" value="${esc(st.termStart)}"></label>
          </div>
          <p class="muted small" style="margin-top:.4rem">Update “This term started” at the start of each term so the termly leaderboard resets.</p>
          <div class="grid-2">
            <label class="field">“Not recognised” after (days)<input type="number" id="set-quiet" value="${st.quietDays}" min="1" max="365"></label>
            <label class="field">Most points in one award<input type="number" id="set-max" value="${st.maxPoints}" min="1" max="50"></label>
          </div>
        </div>

        <div class="card">
          <h2>Milestones</h2>
          <p class="muted small">Celebrated when a student reaches these points in an academic year.</p>
          <div id="set-ms">${[...st.milestones].sort((a, b) => a.points - b.points).map((m, i) => `
            <div class="ms-row" data-i="${i}">
              <input type="number" data-f="points" value="${m.points}" min="1" aria-label="Points">
              <input type="text" data-f="name" value="${esc(m.name)}" aria-label="Milestone name">
              <button class="btn icon small danger" data-rm-ms aria-label="Delete milestone">✕</button>
            </div>`).join('')}</div>
          <button class="btn small" id="set-addms">＋ Add milestone</button>

          <h2 style="margin-top:1.2rem">Classes</h2>
          ${groups.length ? `<ul class="rank-list">${groups.map(g => `
            <li><span class="nm">${esc(g)}</span><span class="muted small">${plural(counts[g], 'student')}</span>
              <button class="btn small" data-rename-group="${esc(g)}">Rename</button>
              <button class="btn small danger" data-rm-group="${esc(g)}">Remove</button></li>`).join('')}</ul>`
            : '<p class="muted">No classes yet. Classes are created when you import a list or add a student to one.</p>'}
        </div>

        <div class="card">
          <h2>Backup &amp; export</h2>
          <p>Your students and points are saved <b>only in this browser on this device</b>. Clearing browser data or changing device will lose them, so download a backup now and then.</p>
          <p class="muted small">Last backup: ${st.lastBackup ? `${fmtDate(st.lastBackup)} at ${fmtTime(st.lastBackup)}` : 'never'}.</p>
          <div class="row">
            <button class="btn primary" data-act="backup">💾 Download backup</button>
            <button class="btn" id="set-restore">Restore from backup…</button>
          </div>
          <div class="row" style="margin-top:.6rem">
            <button class="btn" id="set-exp-students">⬇︎ Students (CSV)</button>
            <button class="btn" data-act="export-awards">⬇︎ All awards (CSV)</button>
          </div>
          <p class="muted small" style="margin-top:.6rem">A backup file can be restored on another computer or phone to move your data there.</p>

          <h2 style="margin-top:1.2rem;color:var(--danger)">Start again</h2>
          <div class="row">
            <button class="btn danger" id="set-newyear">New year: clear all points</button>
            <button class="btn danger" id="set-wipe">Delete everything</button>
          </div>
          <p class="muted small" style="margin-top:.5rem">Both download a backup first, just in case.</p>
        </div>
      </div>`;

    // reasons
    $('#set-cats').addEventListener('change', e => {
      const row = e.target.closest('.cat-row'); if (!row) return;
      const c = Store.category(row.dataset.id); const f = e.target.dataset.f;
      if (f === 'points') c.points = Math.max(1, Math.min(st.maxPoints || 5, Number(e.target.value) || 1));
      else c[f] = e.target.value.trim() || (f === 'emoji' ? '⭐' : 'Reason');
      Store.save(); toast('Saved.', { ms: 1500 });
    });
    $('#set-cats').addEventListener('click', e => {
      const b = e.target.closest('[data-rm-cat]'); if (!b) return;
      if (d.categories.length <= 1) { toast('You need at least one reason.'); return; }
      const id = b.closest('.cat-row').dataset.id;
      d.categories = d.categories.filter(c => c.id !== id);
      Store.save(); renderSettings();
    });
    $('#set-addcat').onclick = () => {
      d.categories.push({ id: Store.uid(), emoji: '⭐', name: 'New reason', points: 1 });
      Store.save(); renderSettings();
      const inputs = $$('#set-cats .cat-row input[data-f=name]');
      const last = inputs[inputs.length - 1]; last.focus(); last.select();
    };
    // houses
    $('#set-houses').addEventListener('change', e => {
      const row = e.target.closest('.house-row'); if (!row) return;
      const h = Store.house(row.dataset.id);
      h[e.target.dataset.f] = e.target.value.trim() || h[e.target.dataset.f];
      Store.save(); toast('Saved.', { ms: 1500 });
    });
    // dates & numbers
    $('#set-year').onchange = e => { if (e.target.value) Store.updateSettings({ yearStart: e.target.value }); toast('Saved.', { ms: 1500 }); };
    $('#set-term').onchange = e => { if (e.target.value) Store.updateSettings({ termStart: e.target.value }); toast('Saved.', { ms: 1500 }); };
    $('#set-quiet').onchange = e => { Store.updateSettings({ quietDays: Math.max(1, Number(e.target.value) || 28) }); toast('Saved.', { ms: 1500 }); };
    $('#set-max').onchange = e => { Store.updateSettings({ maxPoints: Math.max(1, Number(e.target.value) || 5) }); toast('Saved.', { ms: 1500 }); };
    // milestones
    const sortedMs = () => [...st.milestones].sort((a, b) => a.points - b.points);
    $('#set-ms').addEventListener('change', e => {
      const row = e.target.closest('.ms-row'); if (!row) return;
      const list = sortedMs(); const m = list[Number(row.dataset.i)];
      if (e.target.dataset.f === 'points') m.points = Math.max(1, Number(e.target.value) || 1);
      else m.name = e.target.value.trim() || 'Milestone';
      Store.updateSettings({ milestones: list }); renderSettings();
    });
    $('#set-ms').addEventListener('click', e => {
      if (!e.target.closest('[data-rm-ms]')) return;
      const list = sortedMs(); list.splice(Number(e.target.closest('.ms-row').dataset.i), 1);
      Store.updateSettings({ milestones: list }); renderSettings();
    });
    $('#set-addms').onclick = () => {
      const list = sortedMs();
      const top = list.length ? list[list.length - 1].points : 0;
      list.push({ points: top ? top * 2 : 25, name: 'New milestone' });
      Store.updateSettings({ milestones: list }); renderSettings();
    };
    // classes
    $$('[data-rename-group]').forEach(b => b.onclick = () => {
      const old = b.dataset.renameGroup;
      const name = prompt(`Rename class “${old}” to:`, old);
      if (name && name.trim() && name.trim() !== old) { Store.renameGroup(old, name.trim()); renderSettings(); }
    });
    $$('[data-rm-group]').forEach(b => b.onclick = () => {
      const g = b.dataset.rmGroup;
      if (!confirm(`Remove the class “${g}”? The students and their points are kept.`)) return;
      Store.renameGroup(g, ''); renderSettings();
    });
    // backup / export
    $('#set-restore').onclick = () => $('#file-restore').click();
    $('#set-exp-students').onclick = exportStudents;
    $('#set-newyear').onclick = () => {
      if (!confirm('Clear ALL points for every student? Students and classes are kept.\n\nA backup will be downloaded first.')) return;
      doBackup(); Store.resetAwards(); toast('All points cleared. A backup was downloaded.'); render();
    };
    $('#set-wipe').onclick = () => {
      if (!confirm('Delete ALL students, points and settings from this browser?\n\nA backup will be downloaded first.')) return;
      doBackup(); Store.resetAll(); ui.selected.clear(); ui.stSelected.clear(); toast('Everything deleted. A backup was downloaded.'); render();
    };
  }

  $('#file-restore').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      if (!confirm('Replace everything in this browser with the backup? Anything not in the backup will be lost.')) return;
      Store.importJSON(text);
      ui.selected.clear(); ui.stSelected.clear();
      toast('✅ Backup restored.');
      render();
    } catch (err) {
      toast(`⚠️ ${esc(err.message || 'Could not read that backup file.')}`, { ms: 8000 });
    }
  };

  function doBackup() {
    download(`house-points-backup-${today()}.json`, Store.exportJSON(), 'application/json');
    ui.bannerHidden = false;
  }

  function exportStudents() {
    const yearT = Store.studentTotals(Store.periodStart('year'));
    const allT = Store.studentTotals(0);
    const rows = [['Name', 'Form', 'Year', 'House', 'Classes', 'Points this year', 'Points all time', 'Archived']];
    [...Store.get().students].sort(byName).forEach(s => rows.push([s.name, s.form, s.year, s.house ? houseName(s.house) : '', s.groups.join('; '), yearT.get(s.id) || 0, allT.get(s.id) || 0, s.archived ? 'yes' : '']));
    download(`house-points-students-${today()}.csv`, '﻿' + toCSV(rows), 'text/csv');
  }

  function exportAwards() {
    const rows = [['Date', 'Time', 'Student', 'Form', 'House', 'Points', 'Reason', 'Note', 'Class']];
    [...Store.get().awards].sort((a, b) => a.ts - b.ts).forEach(a => {
      const s = Store.student(a.studentId) || {};
      const d = new Date(a.ts);
      rows.push([Store.isoDate(d), fmtTime(a.ts), s.name || '', s.form || '', houseName(s.house || a.house), a.points, a.category, a.note, a.group]);
    });
    download(`house-points-awards-${today()}.csv`, '﻿' + toCSV(rows), 'text/csv');
  }

  /* ---------- global buttons ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    switch (b.dataset.act) {
      case 'import': openImport(); break;
      case 'add-student': openAddStudent(); break;
      case 'demo': Store.loadDemo(); toast('Demo data loaded. Delete it any time in Settings → Delete everything.', { ms: 7000 }); render(); break;
      case 'display': showDisplay(); break;
      case 'backup': doBackup(); toast('💾 Backup downloaded.'); renderBanner(); if (ui.view === 'settings') renderSettings(); break;
      case 'hide-banner': ui.bannerHidden = true; renderBanner(); break;
      case 'export-awards': exportAwards(); break;
      case 'clear-sel': ui.selected.clear(); $$('.student-card.sel').forEach(c => c.classList.remove('sel')); updateBar(); break;
      case 'select-shown': visibleAwardStudents().forEach(s => ui.selected.add(s.id)); updateGrid(); updateBar(); break;
    }
  });

  /* ---------- start ---------- */
  Store.load();
  window.addEventListener('hashchange', route);
  route();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
