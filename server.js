import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

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
    file.originalname.endsWith('.csv')
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

/* ---------- routes ---------- */
app.get('/api/metadata', (req, res) => res.json(readMeta()));

app.get('/api/items', (req, res) => {
  if (!fs.existsSync(CSV_PATH)) return res.json([]);
  const rows = [];
  fs.createReadStream(CSV_PATH)
    .pipe(csv())
    .on('data', row => rows.push(row))
    .on('end', () => res.json(rows));
});

app.get('/item_list.csv', (req, res) => {
  if (!fs.existsSync(CSV_PATH)) return res.status(404).send('File not found');
  res.sendFile(CSV_PATH);
});

app.post('/upload', upload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const tmpPath   = req.file.path;        // e.g. /var/data/1729971000-item_list.csv
  let   rowCount  = 0;

  fs.createReadStream(tmpPath)
    .pipe(csv())
    .on('data', () => rowCount++)
    .on('end', () => {
      fs.renameSync(tmpPath, CSV_PATH);   // atomic: same filesystem
      const meta = { uploadedAt: new Date().toISOString(), count: rowCount };
      fs.writeFileSync(META_PATH, JSON.stringify(meta));
      res.json(meta);
    })
    .on('error', err => {
      fs.unlinkSync(tmpPath);             // clean up bad upload
      res.status(500).json({ error: err.message });
    });
});

/* ---------- start ---------- */
app.listen(PORT, () => console.log(`Master Item List server running on ${PORT}`));
