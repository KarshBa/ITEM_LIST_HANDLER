import express from 'express';
import fetch   from 'node-fetch';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------
 * Where should we broadcast a “please refresh” ping?
 * Supply a comma-separated list in Render → Environment → Variables, e.g.
 *
 *   DOWNSTREAM_URLS=https://inventory-counts.onrender.com,
 *                   https://inventory-shrink.onrender.com
 * ------------------------------------------------------------------*/
const DOWNSTREAM_URLS = (process.env.DOWNSTREAM_URLS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

async function pingDownstreams() {
  for (const host of DOWNSTREAM_URLS) {
    try {
      const res = await fetch(`${host}/api/refresh-items`, {   // 🔸endpoint that the
        method: 'POST',                                        //    other apps expose
        timeout: 10_000
      });
      console.log(`[Notify] ${host} → ${res.ok ? 'OK' : res.status}`);
    } catch (err) {
      console.warn(`[Notify] ${host} failed:`, err.message);
    }
  }
}

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- paths ---------- */
const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const CSV_PATH  = path.join(DATA_DIR, 'item_list.csv');
const META_PATH = path.join(DATA_DIR, 'metadata.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- multer config ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR),               // <- disk mount
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) =>
    file.originalname.match(/\.(csv|xlsb)$/i)
      ? cb(null, true)
      : cb(new Error('Only CSV files are allowed'))
});

/* ---------- helpers ---------- */
function readMeta() {
  if (fs.existsSync(META_PATH)) {
    try { return JSON.parse(fs.readFileSync(META_PATH, 'utf8')); }
    catch { /* fall through */ }
  }
  return { uploadedAt: null, count: 0 };
}

/* cache: { rows: [...], stamp: '2025-06-26T00:14:…Z' }  */
let itemsCache = null;

async function getAllRows() {
  const meta = readMeta();
  /* reload if cache empty or CSV updated after last cache */
  if (!itemsCache || itemsCache.stamp !== meta.uploadedAt) {
    const rows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(CSV_PATH)
        .pipe(csv())
        .on('data', r => rows.push(r))
        .on('end', resolve)
        .on('error', reject);
    });
    itemsCache = { rows, stamp: meta.uploadedAt };
  }
  return itemsCache.rows;
}

// ---------- search helpers ----------
const canonUPC = raw => {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 12) return ('0' + d.slice(0, 11)).padStart(13, '0');
  return d.padStart(13, '0');
};

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------- routes ---------- */
app.get('/api/metadata', (req, res) => res.json(readMeta()));

/* ------------------------------------------------------------------ */
/* PAGINATED /api/items                                               */
/* ------------------------------------------------------------------ */
app.get('/api/items', async (req, res) => {
  if (!fs.existsSync(CSV_PATH))
    return res.json({ total: 0, page: 1, pageSize: 0, rows: [] });

  /* ---------- query params ---------- */
  const page     = Math.max(1,  parseInt(req.query.page     || 1,   10));
  const pageSize = Math.max(1,  parseInt(req.query.pageSize || 200, 10));
  const columns  = (req.query.columns || '')                  // optional: keep your column filter
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);

  try {
    /* one-time CSV parse, then cached in memory */
    const allRows = await getAllRows();        // uses itemsCache helper already in your file
    const total   = allRows.length;
    const start   = (page - 1) * pageSize;

    /* slice the page we need */
    let rows = allRows.slice(start, start + pageSize);

    /* column filtering if ?columns= supplied */
    if (columns.length) {
      rows = rows.map(r =>
        Object.fromEntries(Object.entries(r).filter(([k]) => columns.includes(k)))
      );
    }

    res.json({ total, page, pageSize, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/item_list.csv', (req, res) => {
  if (!fs.existsSync(CSV_PATH)) return res.status(404).send('File not found');
  res.sendFile(CSV_PATH);
});

  app.post('/api/sync-items', async (_req, res) => {
  await pingDownstreams();
  res.json({ success: true });
});

app.get('/api/download-items', (req, res) => {
  if (!fs.existsSync(CSV_PATH)) return res.status(404).send('File not found');
  const stamp = new Date().toISOString().slice(0,10).replace(/-/g, '_'); // YYYY_MM_DD
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=item_list_${stamp}.csv`);
  fs.createReadStream(CSV_PATH).pipe(res);
});

app.post('/upload', upload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const tmpPath  = req.file.path;        // lives in DATA_DIR already
  const finalCSV = CSV_PATH;             // /var/data/item_list.csv
  const meta     = { uploadedAt: new Date().toISOString(), count: 0 };

  const ext = path.extname(req.file.originalname).toLowerCase();

  /* ---- 1. If user gave a CSV, just rename ---- */
  if (ext === '.csv') {
    fs.renameSync(tmpPath, finalCSV);    // atomic (same disk)
    /* count rows, then notify */
    fs.createReadStream(finalCSV)
      .pipe(csv())
      .on('data', () => meta.count++)
      .on('end', () => {
        fs.writeFileSync(META_PATH, JSON.stringify(meta));
        itemsCache = null;            // invalidate in-memory cache
        pingDownstreams().catch(console.error);
        res.json(meta);
      })
      .on('error', err => {
        fs.unlinkSync(finalCSV);
        res.status(500).json({ error: err.message });
      });
    return;
  }

  /* ---- 2. If user gave an XLSB ---- */
  try {
    const wb   = XLSX.readFile(tmpPath, { type: 'binary' });
    const ws   = wb.Sheets['DataSheet'];
    if (!ws)   throw new Error('Sheet "DataSheet" not found');
    /* convert worksheet → CSV text */
    const csvText = XLSX.utils.sheet_to_csv(ws, { FS: ',', blankrows: false });
    fs.writeFileSync(finalCSV, csvText);
    fs.unlinkSync(tmpPath);             // discard temp .xlsb

    /* count rows (skip header line if present) */
    meta.count = csvText.trim().split('\n').length - 1;
    fs.writeFileSync(META_PATH, JSON.stringify(meta));
    itemsCache = null;
    pingDownstreams().catch(console.error);
    res.json(meta);
  } catch (err) {
    fs.unlinkSync(tmpPath);
    res.status(500).json({ error: err.message });
  }
});

/* unique Sub-department list for the dropdown */
app.get('/api/subdepartments', async (_req, res) => {
  try {
    const rows = await getAllRows();
    if (!rows.length) return res.json({ subdepartments: [] });

    // detect the subdept column once
    if (!app.locals.subKey) {
      const keys = Object.keys(rows[0]);
      app.locals.subKey =
        keys.find(k => norm(k) === 'subdepartmentdescription') ||
        keys.find(k => norm(k).includes('subdept')) ||
        null;
    }

    const set = new Set();
    if (app.locals.subKey) {
      rows.forEach(r => {
        const v = String(r[app.locals.subKey] || '').trim();
        if (v) set.add(v);
      });
    }
    res.json({ subdepartments: [...set].sort() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* -----------------------------------------------------------
   /api/search-items?term=xxx&limit=50&subdept=Sub Dept Name
   Searches code/brand/description, pads numeric UPCs,
   and (optionally) filters by sub-department.
   ----------------------------------------------------------- */
app.get('/api/search-items', async (req, res) => {
  const term     = String(req.query.term || '').trim();
  const limit    = Math.max(1, Math.min(500, parseInt(req.query.limit || 50, 10)));
  const subdeptQ = String(req.query.subdept || '').toLowerCase();

  if (!term && !subdeptQ) return res.json({ results: [] });

  let rows;
  try {
    rows = await getAllRows();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  if (!rows.length) return res.json({ results: [] });

  // ---------- Column detection (once) ----------
  if (!app.locals.colMap) {
    const keys = Object.keys(rows[0]);
    const pick = (aliases) => keys.find(k => aliases.includes(norm(k)));
    app.locals.colMap = {
      code   : pick(['code','itemcode','upc','maincode','maincode','itemcode']) || keys[0],
      brand  : pick(['brand','mainitembrand','main itembrand']) || keys[1] || keys[0],
      desc   : pick(['description','desc','mainitemdescription','main itemdescription']) || keys[2] || keys[0],
      subdep : pick(['subdepartmentdescription','subdepartment','subdept','subdepartmentnumber']) || null
    };
  }
  const { code, brand, desc, subdep } = app.locals.colMap;

  // ---------- Sub-department filter ----------
  if (subdeptQ && subdep) {
    rows = rows.filter(r => String(r[subdep] || '').toLowerCase() === subdeptQ);
  }

  // ---------- Matching setup ----------
  const isNum     = /^\d+$/.test(term);
  const digits    = term.replace(/\D/g, '');
  const shortNum  = isNum && digits.length < 6;
  const upcNeedle = (!shortNum && isNum) ? canonUPC(digits) : null;
  const qLower    = term.toLowerCase();

  // ---------- Score & filter ----------
  const scored = rows.map(r => {
    const rawCode = String(r[code]  ?? '').trim();
    const rawBr   = String(r[brand] ?? '');
    const rawDesc = String(r[desc]  ?? '');

    const can     = canonUPC(rawCode);
    const br      = rawBr.toLowerCase();
    const ds      = rawDesc.toLowerCase();

    let score = 0;

    if (isNum) {
      if (upcNeedle) {
        if (can === upcNeedle)        score += 100;   // exact UPC
        else if (can.includes(upcNeedle)) score += 50;
      }
      if (shortNum && (can.includes(digits) || rawCode.includes(digits))) score += 25;
    } else {
      if (br === qLower)        score += 30;
      if (ds === qLower)        score += 25;
      if (br.includes(qLower))  score += 15;
      if (ds.includes(qLower))  score += 10;
      if (rawCode.includes(term)) score += 12;
    }

    return { row: r, score };
  })
  // keep rows that matched, or allow pure subdept searches (score===0 but subdept filter applied)
  .filter(o => o.score > 0 || (!term && subdeptQ));

  scored.sort((a, b) => b.score - a.score);

  res.json({ results: scored.slice(0, limit).map(o => o.row) });
});

/* ---------- start ---------- */
app.listen(PORT, () => console.log(`Master Item List server running on ${PORT}`));
