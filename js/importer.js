/* House Points — reading class lists from CSV, PDF or pasted text.
 * Every source is turned into rows of cells, then columns are mapped
 * (Full name / First name / Surname / Form / House / Year) into students. */
const Importer = (() => {
  const ROLES = [
    { id: 'ignore', label: '— ignore —' },
    { id: 'full',   label: 'Full name' },
    { id: 'first',  label: 'First name' },
    { id: 'last',   label: 'Surname' },
    { id: 'form',   label: 'Form / class' },
    { id: 'house',  label: 'House' },
    { id: 'year',   label: 'Year' },
  ];

  /* ---------- CSV ---------- */
  function detectDelimiter(text) {
    const sample = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 10);
    let best = ',', bestScore = 0;
    for (const d of [',', ';', '\t', '|']) {
      const counts = sample.map(l => splitLine(l, d).length);
      const min = Math.min(...counts);
      const score = min > 1 ? min * 10 + (counts.every(c => c === counts[0]) ? 5 : 0) : 0;
      if (score > bestScore) { best = d; bestScore = score; }
    }
    return bestScore ? best : null;
  }

  function splitLine(line, d) { return parseCSV(line, d)[0] || []; }

  function parseCSV(text, delim = ',') {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell.trim() === '') { q = true; cell = ''; }
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c));
  }

  function textToRows(text) {
    text = text.replace(/^﻿/, '');
    const d = detectDelimiter(text);
    if (d) return parseCSV(text, d);
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => [l]);
  }

  /* ---------- PDF (uses pdf.js, loaded only when needed) ---------- */
  let pdfjsReady = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  function loadPdfJs() {
    if (!pdfjsReady) {
      // Loading the worker on the page too lets pdf.js run without a Web Worker,
      // so PDF import also works when index.html is opened straight from disk.
      pdfjsReady = loadScript('js/vendor/pdf.min.js')
        .then(() => loadScript('js/vendor/pdf.worker.min.js'))
        .then(() => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
          return window.pdfjsLib;
        })
        .catch(e => { pdfjsReady = null; throw e; });
    }
    return pdfjsReady;
  }

  async function pdfToRows(arrayBuffer) {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const rows = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      rows.push(...itemsToRows(content.items));
    }
    return rows;
  }

  // Group text pieces into lines by their vertical position, then split a line
  // into cells at table columns. A column break is where: the gap is wide, a
  // wide blank piece sits between words, or the text starts at an x position
  // that many other lines also start at (i.e. the columns line up).
  function itemsToRows(items) {
    const pieces = items
      .filter(it => typeof it.str === 'string' && it.transform)
      .map(it => ({
        str: it.str, x: it.transform[4], y: it.transform[5],
        w: it.width || 0, h: Math.abs(it.transform[3]) || Math.abs(it.height) || 10,
      }))
      .filter(p => p.str.trim() || p.w > 0);
    pieces.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const p of pieces) {
      const line = lines.find(l => Math.abs(l.y - p.y) <= Math.max(2, p.h * 0.4));
      if (line) line.items.push(p); else lines.push({ y: p.y, items: [p] });
    }
    lines.sort((a, b) => b.y - a.y);
    lines.forEach(l => l.items.sort((a, b) => a.x - b.x));

    // x positions where text starts on many lines = column starts
    const starts = new Map();
    for (const l of lines) {
      const seen = new Set();
      l.items.forEach((it, i) => {
        if (!it.str.trim() || i === 0) return;
        const k = Math.round(it.x / 3);
        if (!seen.has(k)) { seen.add(k); starts.set(k, (starts.get(k) || 0) + 1); }
      });
    }
    const multi = lines.filter(l => l.items.filter(it => it.str.trim()).length > 1).length;
    const colStarts = [...starts.entries()].filter(([, n]) => n >= Math.max(3, multi * 0.3)).map(([k]) => k * 3);
    const isColStart = x => colStarts.some(c => Math.abs(c - x) <= 3);

    return lines.map(l => {
      const cells = [];
      let cur = '', end = null, forceBreak = false;
      for (const it of l.items) {
        if (!it.str.trim()) { if (it.w > it.h * 0.6) forceBreak = true; continue; }
        const gap = end === null ? 0 : it.x - end;
        if (end !== null && (forceBreak || gap > it.h * 0.9 || (isColStart(it.x) && gap > it.h * 0.1))) {
          cells.push(cur.trim()); cur = '';
        } else if (end !== null && gap > it.h * 0.15 && !cur.endsWith(' ') && !it.str.startsWith(' ')) cur += ' ';
        cur += it.str;
        end = it.x + it.w;
        forceBreak = false;
      }
      cells.push(cur.trim());
      return cells.map(c => c.replace(/\s+/g, ' ')).filter(Boolean);
    }).filter(r => r.length);
  }

  /* ---------- reading any file ---------- */
  async function fileToRows(file) {
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    if (isPdf) return { rows: await pdfToRows(await file.arrayBuffer()), source: 'pdf' };
    if (/\.(xlsx?|ods|docx?)$/i.test(file.name)) {
      throw new Error('Please save the spreadsheet as CSV first (File → Save As → CSV), or export the class list as PDF.');
    }
    return { rows: textToRows(await file.text()), source: 'csv' };
  }

  /* ---------- guessing which column is which ---------- */
  const HEADER_WORDS = /\b(name|forename|first|given|surname|last|family|legal|preferred|house|form|reg|tutor|class|group|year|yr|student|pupil)\b/i;

  function headerRole(h) {
    const s = h.toLowerCase();
    if (/house/.test(s)) return 'house';
    if (/surname|last\s*name|family/.test(s)) return 'last';
    if (/forename|first\s*name|given|preferred/.test(s)) return 'first';
    if (/\b(form|reg|tutor|class|group)\b/.test(s)) return 'form';
    if (/\b(year|yr)\b/.test(s) && !/name/.test(s)) return 'year';
    if (/name|student|pupil/.test(s)) return 'full';
    return 'ignore';
  }

  function guessMapping(rows) {
    const width = Math.max(1, ...rows.map(r => r.length));
    // Header row = the first of the first 10 rows where most cells are header words
    let headerRow = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const r = rows[i];
      const hits = r.filter(c => HEADER_WORDS.test(c) && c.length < 30).length;
      const isHeader = r.length === 1 ? /^(student|pupil|full)?\s*names?$/i.test(r[0]) : hits >= 2;
      if (isHeader) { headerRow = i; break; }
    }
    let cols;
    if (headerRow >= 0) {
      cols = Array.from({ length: width }, (_, i) => headerRole(rows[headerRow][i] || ''));
      // keep only the first column for each role
      const seen = new Set();
      cols = cols.map(r => (r !== 'ignore' && seen.has(r) ? 'ignore' : (seen.add(r), r)));
      if (cols.includes('first') && !cols.includes('last') && cols.includes('full')) {
        cols = cols.map(r => (r === 'full' ? 'last' : r));
      }
      if (cols.includes('full') && cols.includes('first') && cols.includes('last')) {
        cols = cols.map(r => (r === 'full' ? 'ignore' : r));
      }
    } else {
      cols = guessFromContent(rows, width);
    }
    return { headerRow, cols };
  }

  function guessFromContent(rows, width) {
    const sample = rows.slice(0, 60);
    const frac = (i, test) => {
      const vals = sample.map(r => r[i]).filter(v => v !== undefined && v !== '');
      return vals.length ? vals.filter(test).length / vals.length : 0;
    };
    const cols = Array(width).fill('ignore');
    for (let i = 0; i < width; i++) {
      if (frac(i, v => !!matchHouse(v)) > 0.6) cols[i] = 'house';
      else if (frac(i, v => /^(y(ea)?r?\s?)?\d{1,2}$/i.test(v)) > 0.6) cols[i] = 'year';
      else if (frac(i, v => /^\d{1,2}\s?[a-z]{1,4}\d?$/i.test(v)) > 0.6) cols[i] = 'form';
    }
    const nameCols = [];
    for (let i = 0; i < width; i++) if (cols[i] === 'ignore' && frac(i, looksLikeNamePart) > 0.5) nameCols.push(i);
    if (nameCols.length === 1) cols[nameCols[0]] = 'full';
    else if (nameCols.length >= 2) {
      const a = nameCols[0], b = nameCols[1];
      const multi = frac(a, v => /[\s,]/.test(v.trim()));
      if (multi > 0.5) cols[a] = 'full';
      else { cols[a] = 'first'; cols[b] = 'last'; }
    }
    return cols;
  }

  /* ---------- names & houses ---------- */
  function matchHouse(v) {
    const s = String(v || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return '';
    const houses = Store.get().houses;
    for (const h of houses) {
      const n = h.name.toLowerCase().replace(/[^a-z]/g, '');
      if (s === n || (s.length >= 3 && (n.startsWith(s) || s.startsWith(n.slice(0, 3))))) return h.id;
    }
    if (s.length === 1) { const h = houses.find(h => h.name[0].toLowerCase() === s); if (h) return h.id; }
    if (/^saph/.test(s)) return 'sapphire';
    return '';
  }

  const JUNK = /\b(printed|total|class list|register|report|date|teacher|school|academy|generated|of \d+)\b/i;

  function looksLikeNamePart(v) {
    const s = String(v || '').trim();
    return s.length >= 2 && s.length <= 60 && /[a-z]/i.test(s) && !/\d/.test(s) &&
      !JUNK.test(s) && !HEADER_WORDS.test(s) && s.split(/\s+/).length <= 5;
  }

  function looksLikeName(s) {
    return looksLikeNamePart(s) && /^[\p{L}][\p{L}'’\-\s.]*$/u.test(s);
  }

  function tidyCase(s) {
    return s.replace(/[\p{L}'’]+/gu, w => {
      const isUpper = w === w.toUpperCase(), isLower = w === w.toLowerCase();
      const mc = w.match(/^(Mc|Mac)(\p{Lu}{2,})$/u);
      if (mc) return mc[1] + mc[2][0] + mc[2].slice(1).toLowerCase();
      if (!isUpper && !isLower) return w; // already mixed case, e.g. McDonald
      let t = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      t = t.replace(/^(O['’])(\p{L})/u, (m, a, b) => a + b.toUpperCase());
      t = t.replace(/^(Mc)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
      return t;
    });
  }

  // "SMITH, John" / "Smith, John" / "SMITH John" → "John Smith"
  function fixOrder(name) {
    let s = name.replace(/^\s*\d+[.)]?\s+/, '').replace(/\s+/g, ' ').trim();
    const comma = s.match(/^([^,]+),\s*(.+)$/);
    if (comma) return `${comma[2]} ${comma[1]}`;
    const words = s.split(' ');
    if (words.length >= 2) {
      const upper = w => /^(Mc|Mac)?[\p{Lu}'’-]{2,}$/u.test(w);
      let k = 0;
      while (k < words.length && upper(words[k])) k++;
      if (k > 0 && k < words.length && !words.slice(k).some(upper)) {
        return [...words.slice(k), ...words.slice(0, k)].join(' ');
      }
    }
    return s;
  }

  function cleanName(name, tidy) {
    const s = fixOrder(name);
    return tidy ? tidyCase(s) : s;
  }

  /* ---------- rows → candidate students ---------- */
  function buildCandidates(rows, mapping, { tidy = true } = {}) {
    const idx = role => mapping.cols.indexOf(role);
    const iFull = idx('full'), iFirst = idx('first'), iLast = idx('last');
    const iForm = idx('form'), iHouse = idx('house'), iYear = idx('year');
    const seen = new Set();
    const out = [];
    rows.forEach((r, i) => {
      if (i <= mapping.headerRow) return;
      let name = '';
      if (iFirst >= 0 || iLast >= 0) {
        const f = iFirst >= 0 ? r[iFirst] || '' : '';
        const l = iLast >= 0 ? r[iLast] || '' : '';
        name = `${f} ${l}`.trim();
        if (iFull >= 0 && !name) name = r[iFull] || '';
      } else if (iFull >= 0) name = r[iFull] || '';
      name = cleanName(name, tidy);
      if (!name) return;
      const house = iHouse >= 0 ? matchHouse(r[iHouse]) : '';
      const form = iForm >= 0 ? (r[iForm] || '').trim() : '';
      const year = iYear >= 0 ? String(r[iYear] || '').replace(/\D/g, '') : '';
      const key = Store.normName(name);
      const dup = seen.has(key);
      seen.add(key);
      const valid = looksLikeName(name);
      const existing = Store.findStudentByName(name);
      out.push({
        name, form, house, year,
        include: valid && !dup,
        status: dup ? 'dup' : existing ? 'existing' : valid ? 'new' : 'odd',
      });
    });
    return out;
  }

  return { ROLES, fileToRows, textToRows, guessMapping, buildCandidates, matchHouse, tidyCase, fixOrder, itemsToRows };
})();
