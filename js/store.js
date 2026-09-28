/* House Points — data store.
 * Everything is kept in this browser's localStorage under one key.
 * Nothing is sent anywhere. Use Settings → Backup to keep a copy. */
const Store = (() => {
  const KEY = 'housepoints.v1';

  const DEFAULT_HOUSES = [
    { id: 'amber',    name: 'Amber',    color: '#F2A20C' },
    { id: 'emerald',  name: 'Emerald',  color: '#12955B' },
    { id: 'ruby',     name: 'Ruby',     color: '#C8203A' },
    { id: 'sapphire', name: 'Sapphire', color: '#1F58C4' },
  ];

  const DEFAULT_CATEGORIES = [
    { emoji: '⭐', name: 'Excellent work',  points: 1 },
    { emoji: '💪', name: 'Effort',          points: 1 },
    { emoji: '🤝', name: 'Respect',         points: 1 },
    { emoji: '💛', name: 'Kindness',        points: 1 },
    { emoji: '🙋', name: 'Participation',   points: 1 },
    { emoji: '🤲', name: 'Helping others',  points: 1 },
    { emoji: '🌱', name: 'Resilience',      points: 1 },
    { emoji: '🧭', name: 'Leadership',      points: 2 },
    { emoji: '📚', name: 'Homework',        points: 1 },
  ];

  const DEFAULT_MILESTONES = [
    { points: 25,  name: 'Bronze' },
    { points: 50,  name: 'Silver' },
    { points: 100, name: 'Gold' },
    { points: 200, name: 'Platinum' },
  ];

  let data = null;
  let saveError = null;
  const listeners = new Set();

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function isoDate(d) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  // Academic year starts 1 September.
  function defaultYearStart(now = new Date()) {
    const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-09-01`;
  }

  function defaults() {
    const yearStart = defaultYearStart();
    return {
      version: 1,
      houses: DEFAULT_HOUSES.map(h => ({ ...h })),
      students: [],
      classes: [],
      categories: DEFAULT_CATEGORIES.map(c => ({ id: uid(), ...c })),
      awards: [],
      settings: {
        yearStart,
        termStart: yearStart,
        quietDays: 28,
        maxPoints: 5,
        milestones: DEFAULT_MILESTONES.map(m => ({ ...m })),
        lastBackup: null,
      },
    };
  }

  // Fill in anything missing from older or hand-edited data.
  function normalise(d) {
    const base = defaults();
    const out = { ...base, ...d };
    out.settings = { ...base.settings, ...(d.settings || {}) };
    const houses = Array.isArray(d.houses) ? d.houses : [];
    out.houses = base.houses.map(h => ({ ...h, ...(houses.find(x => x.id === h.id) || {}) }));
    out.students = (d.students || []).map(s => ({
      id: s.id || uid(), name: String(s.name || '').trim(), form: s.form || '', year: s.year || '',
      house: s.house || '', groups: Array.isArray(s.groups) ? s.groups : [], archived: !!s.archived,
      createdAt: s.createdAt || Date.now(),
    }));
    const names = new Set();
    out.classes = [];
    const addCls = (name, createdAt) => {
      name = String(name || '').trim();
      if (name && !names.has(name)) { names.add(name); out.classes.push({ name, createdAt: createdAt || Date.now() }); }
    };
    (Array.isArray(d.classes) ? d.classes : []).forEach(c => addCls(typeof c === 'string' ? c : c.name, c.createdAt));
    out.students.forEach(s => s.groups.forEach(g => addCls(g)));
    out.categories = Array.isArray(d.categories) && d.categories.length ? d.categories : base.categories;
    out.awards = (d.awards || []).filter(a => a && a.studentId);
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? normalise(JSON.parse(raw)) : defaults();
    } catch (e) {
      console.error(e);
      data = defaults();
    }
    return data;
  }

  function save() {
    if (data) syncClasses();
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      saveError = null;
    } catch (e) {
      console.error(e);
      saveError = e;
    }
    listeners.forEach(fn => fn());
  }

  function onChange(fn) { listeners.add(fn); }

  /* ---------- lookups ---------- */
  const get = () => data;
  const house = id => data.houses.find(h => h.id === id);
  const student = id => data.students.find(s => s.id === id);
  const category = id => data.categories.find(c => c.id === id);

  // Classes are stored in their own list (so an empty class can exist before
  // its students are imported) and students carry the names of their classes.
  function syncClasses() {
    const have = new Set(data.classes.map(c => c.name));
    data.students.forEach(s => s.groups.forEach(g => {
      if (!have.has(g)) { have.add(g); data.classes.push({ name: g, createdAt: Date.now() }); }
    }));
  }

  function groups() {
    return data.classes.map(c => c.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function classStudents(name, { archived = false } = {}) {
    return data.students.filter(s => s.groups.includes(name) && (archived || !s.archived));
  }

  function addClass(name) {
    name = String(name || '').trim();
    if (!name) return null;
    if (!data.classes.some(c => c.name === name)) { data.classes.push({ name, createdAt: Date.now() }); save(); }
    return name;
  }

  // Removes the class. With deleteStudents, students who are in no other class
  // are deleted too (with their points); students in other classes are kept.
  function deleteClass(name, { deleteStudents: alsoStudents = false } = {}) {
    const gone = [];
    data.students.forEach(s => {
      if (!s.groups.includes(name)) return;
      s.groups = s.groups.filter(g => g !== name);
      if (alsoStudents && !s.groups.length) gone.push(s.id);
    });
    data.classes = data.classes.filter(c => c.name !== name);
    if (gone.length) {
      const set = new Set(gone);
      data.students = data.students.filter(s => !set.has(s.id));
      data.awards = data.awards.filter(a => !set.has(a.studentId));
    }
    save();
    return gone.length;
  }

  const normName = s => String(s || '').toLowerCase().replace(/[^a-zÀ-ɏ' -]/g, '').replace(/\s+/g, ' ').trim();

  function findStudentByName(name) {
    const n = normName(name);
    return data.students.find(s => normName(s.name) === n);
  }

  /* ---------- periods ---------- */
  const PERIODS = [
    { id: 'week',  label: 'This week' },
    { id: 'month', label: 'This month' },
    { id: 'term',  label: 'This term' },
    { id: 'year',  label: 'This year' },
    { id: 'all',   label: 'All time' },
  ];

  function periodStart(id, now = new Date()) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (id) {
      case 'week': { const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.getTime(); }
      case 'month': return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      case 'term': return dateToMs(data.settings.termStart);
      case 'year': return dateToMs(data.settings.yearStart);
      default: return 0;
    }
  }

  function dateToMs(iso) {
    if (!iso) return 0;
    const [y, m, dd] = iso.split('-').map(Number);
    return new Date(y, m - 1, dd).getTime();
  }

  function awardsSince(ms) { return data.awards.filter(a => a.ts >= ms); }

  /* ---------- totals ---------- */
  function studentTotals(since = 0) {
    const t = new Map();
    for (const a of data.awards) if (a.ts >= since) t.set(a.studentId, (t.get(a.studentId) || 0) + a.points);
    return t;
  }

  function houseTotals(since = 0, filter = null) {
    const totals = Object.fromEntries(data.houses.map(h => [h.id, { points: 0, awards: 0 }]));
    for (const a of data.awards) {
      if (a.ts < since) continue;
      const s = student(a.studentId);
      if (!s || !totals[s.house]) continue;
      if (filter && !filter(s)) continue;
      totals[s.house].points += a.points;
      totals[s.house].awards += 1;
    }
    return totals;
  }

  function lastAwardMap() {
    const m = new Map();
    for (const a of data.awards) if (!m.has(a.studentId) || m.get(a.studentId) < a.ts) m.set(a.studentId, a.ts);
    return m;
  }

  function milestoneFor(points) {
    const ms = [...data.settings.milestones].sort((a, b) => a.points - b.points);
    let current = null, next = null;
    for (const m of ms) { if (points >= m.points) current = m; else { next = m; break; } }
    return { current, next };
  }

  /* ---------- awards ---------- */
  function award(studentIds, { categoryId, points, note, group }) {
    const cat = category(categoryId);
    const batch = uid();
    const ts = Date.now();
    const yearStart = periodStart('year');
    const before = studentTotals(yearStart);
    const created = studentIds.map(id => ({
      id: uid(), batch, ts, studentId: id, points,
      categoryId, category: cat ? cat.name : '', note: note || '', group: group || '',
      house: (student(id) || {}).house || '',
    }));
    data.awards.push(...created);
    save();
    // Milestones crossed this academic year
    const reached = [];
    for (const id of studentIds) {
      const b = before.get(id) || 0, after = b + points;
      const m1 = milestoneFor(b).current, m2 = milestoneFor(after).current;
      if (m2 && (!m1 || m2.points !== m1.points)) reached.push({ student: student(id), milestone: m2 });
    }
    return { batch, count: created.length, reached };
  }

  function undoBatch(batch) {
    data.awards = data.awards.filter(a => a.batch !== batch);
    save();
  }

  function deleteAward(id) {
    data.awards = data.awards.filter(a => a.id !== id);
    save();
  }

  /* ---------- students ---------- */
  function addStudent(s) {
    const rec = {
      id: uid(), name: s.name.trim(), form: (s.form || '').trim(), year: (s.year || '').toString().trim(),
      house: s.house || '', groups: s.groups ? [...new Set(s.groups.filter(Boolean))] : [],
      archived: false, createdAt: Date.now(),
    };
    data.students.push(rec);
    return rec;
  }

  function updateStudent(id, patch) {
    const s = student(id);
    if (!s) return;
    Object.assign(s, patch);
    if (patch.groups) s.groups = [...new Set(patch.groups.filter(Boolean))];
    save();
  }

  function deleteStudents(ids) {
    const set = new Set(ids);
    data.students = data.students.filter(s => !set.has(s.id));
    data.awards = data.awards.filter(a => !set.has(a.studentId));
    save();
  }

  function bulk(ids, fn) {
    ids.forEach(id => { const s = student(id); if (s) fn(s); });
    save();
  }

  // rows: [{name, form, house, year}] — returns counts
  function importStudents(rows, { group }) {
    let added = 0, updated = 0;
    for (const r of rows) {
      const existing = findStudentByName(r.name);
      if (existing) {
        if (!existing.form && r.form) existing.form = r.form;
        if (!existing.year && r.year) existing.year = r.year;
        if (r.house) existing.house = r.house;
        if (group && !existing.groups.includes(group)) existing.groups.push(group);
        existing.archived = false;
        updated++;
      } else {
        addStudent({ ...r, groups: group ? [group] : [] });
        added++;
      }
    }
    save();
    return { added, updated };
  }

  function renameGroup(oldName, newName) {
    if (!newName) { deleteClass(oldName); return; }
    const existing = data.classes.find(c => c.name === newName);
    const cls = data.classes.find(c => c.name === oldName);
    if (cls && !existing) cls.name = newName;
    else data.classes = data.classes.filter(c => c.name !== oldName);
    data.awards.forEach(a => { if (a.group === oldName) a.group = newName; });
    data.students.forEach(s => {
      const i = s.groups.indexOf(oldName);
      if (i >= 0) {
        s.groups.splice(i, 1);
        if (newName && !s.groups.includes(newName)) s.groups.push(newName);
      }
    });
    save();
  }

  /* ---------- settings & backup ---------- */
  function updateSettings(patch) { Object.assign(data.settings, patch); save(); }

  function exportJSON() {
    data.settings.lastBackup = Date.now();
    save();
    return JSON.stringify({ app: 'house-points', exported: new Date().toISOString(), ...data }, null, 2);
  }

  function importJSON(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.students) || !Array.isArray(d.awards)) throw new Error('This file is not a House Points backup.');
    delete d.app; delete d.exported;
    data = normalise(d);
    save();
  }

  function resetAwards() { data.awards = []; save(); }
  function resetAll() { data = defaults(); save(); }

  function loadDemo() {
    const first = ['Aisha','Ben','Chloe','Daniel','Ella','Farhan','Grace','Harry','Isla','Jack','Khadija','Leo','Maya','Noah','Olivia','Priya','Quinn','Ryan','Sofia','Tom','Uma','Victor','Willow','Yusuf','Zara','Adam','Bella','Callum','Deepa','Ethan'];
    const last = ['Ahmed','Brown','Clarke','Davies','Evans','Fisher','Green','Hughes','Iqbal','Jones','Khan','Lewis','Morris','Nowak','Owen','Patel','Quinn','Roberts','Singh','Taylor','Usman','Vaughan','Walker','Young','Zaman','Hall','Wood','Wright','Hussain','King'];
    const houses = data.houses.map(h => h.id);
    const classes = ['10X Physics', '11Y Physics', '9A Science'];
    const forms = ['10X', '11Y', '9A'];
    const ids = [];
    first.forEach((f, i) => {
      const c = i % 3;
      ids.push(addStudent({ name: `${f} ${last[i]}`, form: forms[c], year: forms[c].replace(/\D/g, ''), house: houses[i % 4], groups: [classes[c]] }).id);
    });
    const now = Date.now();
    for (let k = 0; k < 160; k++) {
      const sid = ids[Math.floor(Math.random() * ids.length)];
      const cat = data.categories[Math.floor(Math.random() * data.categories.length)];
      const ts = now - Math.floor(Math.random() * 40) * 86400000 - Math.floor(Math.random() * 8) * 3600000;
      data.awards.push({ id: uid(), batch: uid(), ts, studentId: sid, points: cat.points, categoryId: cat.id, category: cat.name, note: '', group: '', house: student(sid).house });
    }
    save();
  }

  return {
    load, save, get, onChange, uid, isoDate, dateToMs, get saveError() { return saveError; },
    house, student, category, groups, findStudentByName, normName,
    PERIODS, periodStart, awardsSince, studentTotals, houseTotals, lastAwardMap, milestoneFor,
    award, undoBatch, deleteAward,
    addStudent, updateStudent, deleteStudents, bulk, importStudents, renameGroup,
    addClass, deleteClass, classStudents,
    updateSettings, exportJSON, importJSON, resetAwards, resetAll, loadDemo,
  };
})();
