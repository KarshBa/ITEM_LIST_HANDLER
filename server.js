import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CSV_PATH = path.join(DATA_DIR, 'item_list.csv');
const META_PATH = path.join(DATA_DIR, 'metadata.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const upload = multer({
  dest: 'tmp/',
  fileFilter: (_, file, cb) => {
    if (file.originalname.endsWith('.csv')) cb(null, true);
    else cb(new Error('Only CSV files are allowed'));
  }
});

function getMetadata() {
  if (fs.existsSync(META_PATH)) {
    try { return JSON.parse(fs.readFileSync(META_PATH, 'utf8')); }
    catch { return { uploadedAt: null, count: 0 }; }
  }
  return { uploadedAt: null, count: 0 };
}

app.get('/api/metadata', (req, res) => {
  res.json(getMetadata());
});

app.get('/api/items', (req, res) => {
  if (!fs.existsSync(CSV_PATH)) return res.json([]);
  const results = [];
  fs.createReadStream(CSV_PATH)
    .pipe(csv())
    .on('data', data => results.push(data))
    .on('end', () => res.json(results));
});

app.get('/item_list.csv', (req, res) => {
  if (!fs.existsSync(CSV_PATH)) return res.status(404).send('File not found');
  res.sendFile(CSV_PATH);
});

app.post('/upload', upload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const tmpPath = req.file.path;
  let count = 0;
  fs.createReadStream(tmpPath)
    .pipe(csv())
    .on('data', () => count++)
    .on('end', () => {
      fs.renameSync(tmpPath, CSV_PATH);
      const meta = { uploadedAt: new Date().toISOString(), count };
      fs.writeFileSync(META_PATH, JSON.stringify(meta));
      res.json(meta);
    })
    .on('error', (err) => {
      fs.unlinkSync(tmpPath);
      res.status(500).json({ error: err.message });
    });
});

app.listen(PORT, () => console.log(`Master Item List server running on ${PORT}`));
