// signs.js
async function getJSON(url) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function toast(msg, kind='success') {
  const wrap = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${msg}<button aria-label="Close">×</button>`;
  el.querySelector('button').onclick = () => el.remove();
  wrap.appendChild(el);
  setTimeout(()=>el.remove(), 3800);
}

const normalizeUPC = (s) => {
  let d = String(s||'').replace(/\D/g,'');
  if (!d) return '';
  if (d.length === 12) d = d.slice(0,11); // drop check digit
  return d.padStart(13,'0');
};

function splitUPCs(text) {
  return String(text||'')
    .split(/[\s,]+/g)
    .map(normalizeUPC)
    .filter(Boolean);
}

function money(n) {
  const v = Number(n || 0);
  return v ? `$${v.toFixed(2)}` : '';
}

function fmtDate(d) {
  // Expect YYYY-MM-DD already from your batches editor
  return String(d || '').trim();
}

/**
 * Resolve sign fields from:
 * - master item list (brand, description, reg_price)
 * - optional batch line (promo_price, start_date, end_date)
 */
function resolveFields({ item, source, batchLine, recordType }) {
  const brand = item?.brand || '';
  const desc  = item?.description || '';
  const size  = item?.size || item?.pack || ''; // optional if you later add it to master_items.json

  const reg = Number(item?.reg_price || 0);
  let price = reg;
  let start = '';
  let end = '';

  if (source === 'BATCH' && batchLine) {
    // Try to use the common keys your batch editor produces
    const promo = Number(batchLine.promo_price ?? batchLine.Promo_Price ?? batchLine.promoPrice ?? 0);
    const rt    = String(batchLine.record_type ?? batchLine.RecordType ?? batchLine.recordType ?? '').toUpperCase();

    if (!recordType || !rt || rt === recordType) {
      if (promo > 0) price = promo;
      start = fmtDate(batchLine.start_date ?? batchLine.Start_Date ?? batchLine.startDate);
      end   = fmtDate(batchLine.end_date   ?? batchLine.End_Date   ?? batchLine.endDate);
    }
  }

  return {
    upc: item?.upc || '',
    brand,
    desc,
    size,
    priceText: price ? money(price) : 'PRICE',
    regText: reg ? money(reg) : '',
    dateRange: (start && end) ? `${start} - ${end}` : 'START DATE - END DATE'
  };
}

/* ---------------- TEMPLATE: Co-op Deals 1-up ------------------- */
function buildCoopDeals1Up(fields) {
  const root = document.createElement('div');
  root.className = 'coop1';

  root.innerHTML = `
    <div class="hdr">
      <!-- Put your real header image here if you add it to /public/images -->
      <img src="images/coop_deals_header.png" alt="Co-op Deals">
    </div>

    <div class="brand">${escapeHTML(fields.brand || '"Main item-Brand"')}</div>
    <div class="desc">${escapeHTML(fields.desc || '"Long description" if empty then "Main item-Description"')}</div>
    <div class="size">${escapeHTML(fields.size || '"Main item-Size"')}</div>

    <div class="price">${escapeHTML(fields.priceText || 'PRICE')}</div>

    <div class="regLabel">Reg. Price</div>
    <div class="regPrice">${escapeHTML(fields.regText || '""-Regular-"')}</div>

    <svg class="barcode"></svg>
    <div class="code">${escapeHTML(fields.upc || '"Main code"')}</div>

    <div class="dates">${escapeHTML(fields.dateRange || 'START DATE - END DATE')}</div>
  `;

  // Barcode render
  const svg = root.querySelector('svg.barcode');
  const code = fields.upc || '';
  if (code) {
    try {
      JsBarcode(svg, code, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 40
      });
    } catch (e) {
      // ignore barcode failure
    }
  }
  return root;
}

/* ---------------- MULTI-UP GENERIC CELL TEMPLATE ----------------
   For 16/12/4/2/1 portrait layouts, we start simple:
   - big price
   - brand/desc
   - barcode + upc
   (You can add more templates later)
----------------------------------------------------------------- */
function buildGenericTag(fields) {
  const wrap = document.createElement('div');
  wrap.style.width = '100%';
  wrap.style.height = '100%';
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.justifyContent = 'space-between';
  wrap.style.padding = '0.08in';
  wrap.style.fontFamily = 'system-ui, Arial, sans-serif';

  wrap.innerHTML = `
    <div style="text-align:center;">
      <div style="font-weight:800; font-size:14pt; line-height:1.05;">${escapeHTML(fields.brand || '')}</div>
      <div style="font-size:11pt; color:#444; line-height:1.1;">${escapeHTML(fields.desc || '')}</div>
      <div style="font-size:10pt; color:#666; margin-top:2pt;">${escapeHTML(fields.size || '')}</div>
    </div>

    <div style="text-align:center; font-size:28pt; font-weight:700; margin: 4pt 0;">
      ${escapeHTML(fields.priceText || 'PRICE')}
    </div>

    <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:8pt;">
      <div>
        <svg class="barcode" style="width: 2.1in; height:.55in;"></svg>
        <div style="font-size:8pt; color:#555;">${escapeHTML(fields.upc || '')}</div>
      </div>
      <div style="text-align:right; font-size:8pt; color:#666;">
        ${escapeHTML(fields.dateRange || '')}
      </div>
    </div>
  `;

  const svg = wrap.querySelector('svg.barcode');
  if (fields.upc) {
    try {
      JsBarcode(svg, fields.upc, { format:"CODE128", displayValue:false, margin:0, height:32 });
    } catch {}
  }
  return wrap;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ---------------- MAIN APP ------------------------------------ */
const layoutEl = document.getElementById('layout');
const sourceEl = document.getElementById('source');
const batchControls = document.getElementById('batchControls');
const batchIdEl = document.getElementById('batchId');
const recordTypeEl = document.getElementById('recordType');
const upcListEl = document.getElementById('upcList');
const previewEl = document.getElementById('preview');
const printRoot = document.getElementById('printRoot');

let master = [];
let masterMap = new Map();
let batches = [];

async function loadAll() {
  master = await getJSON('/data/master_items.json');
  masterMap = new Map(master.map(o => [normalizeUPC(o.upc), o]));

  batches = await getJSON('/api/batches');
  batchIdEl.innerHTML = '';
  for (const b of batches) {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name ? `${b.name} (${b.id})` : b.id;
    batchIdEl.appendChild(opt);
  }
}
await loadAll();

sourceEl.addEventListener('change', () => {
  const on = sourceEl.value === 'BATCH';
  batchControls.classList.toggle('hidden', !on);
});

document.getElementById('btnPreview').addEventListener('click', async () => {
  try {
    const upcs = splitUPCs(upcListEl.value);
    if (!upcs.length) return toast('Paste at least 1 UPC.', 'error');

    const layout = layoutEl.value;
    const source = sourceEl.value;
    const batchId = batchIdEl.value;
    const recordType = recordTypeEl.value;

    // Resolve batch lines once (if needed)
    let batch = null;
    if (source === 'BATCH') {
      batch = batches.find(b => String(b.id) === String(batchId));
      if (!batch) return toast('Batch not found.', 'error');
    }

    const resolved = upcs.map(code => {
      const item = masterMap.get(code) || { upc: code, brand:'', description:'', reg_price:0 };
      let batchLine = null;

      if (source === 'BATCH' && batch) {
        batchLine = (batch.lines || []).find(l => normalizeUPC(l.upc || l.UPC || l.code || '') === code) || null;
      }

      const fields = resolveFields({ item, source, batchLine, recordType });
      return { code, item, batchLine, fields };
    });

    // Build screen preview
    previewEl.innerHTML = '';
    for (const r of resolved) {
      const card = document.createElement('div');
      card.className = 'panel';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:.5rem; align-items:center;">
          <div style="font-weight:700;">${escapeHTML(r.fields.brand || '')}</div>
          <div class="badge">${escapeHTML(r.code)}</div>
        </div>
        <div style="margin-top:.5rem; border:1px solid #e7edf3; border-radius:10px; padding:.5rem; background:#fff; overflow:auto;"></div>
      `;
      const inner = card.querySelector('div[style*="border:1px"]');

      // Mini preview element
      const node = (layout === 'coop1')
        ? buildCoopDeals1Up(r.fields)
        : buildGenericTag(r.fields);

      node.style.transformOrigin = 'top left';
      node.style.transform = 'scale(0.25)';
      node.style.marginBottom = '-120px'; // keeps card compact for big 1-up
      inner.appendChild(node);

      previewEl.appendChild(card);
    }

    // Build print output
    buildPrint(resolved.map(r => r.fields));

    toast(`Built ${resolved.length} sign(s).`);
  } catch (e) {
    toast(e.message, 'error');
  }
});

document.getElementById('btnPrint').addEventListener('click', () => {
  window.print();
});

function buildPrint(fieldsList) {
  printRoot.innerHTML = '';

  const layout = layoutEl.value;

  if (layout === 'coop1') {
    // One per page, LANDSCAPE (11 x 8.5)
    for (const f of fieldsList) {
      const page = document.createElement('div');
      page.className = 'print-page page-landscape';
      page.style.width = '11in';
      page.style.height = '8.5in';

      const sign = buildCoopDeals1Up(f);
      // Make it fill the landscape page
      sign.style.width = '11in';
      sign.style.height = '8.5in';

      page.appendChild(sign);
      printRoot.appendChild(page);
    }
    return;
  }

  // Multi-up portrait pages
  const perPage = (layout === '16') ? 16
                : (layout === '12') ? 12
                : (layout === '4')  ? 4
                : (layout === '2')  ? 2
                : 1;

  const className = (layout === '16') ? 'l16'
                  : (layout === '12') ? 'l12'
                  : (layout === '4')  ? 'l4'
                  : (layout === '2')  ? 'l2'
                  : 'l1p';

  for (let i = 0; i < fieldsList.length; i += perPage) {
    const page = document.createElement('div');
    page.className = 'print-page';

    const grid = document.createElement('div');
    grid.className = `layout ${className}`;

    const slice = fieldsList.slice(i, i + perPage);
    for (const f of slice) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.appendChild(buildGenericTag(f));
      grid.appendChild(cell);
    }

    // If last page not full, fill empty cells so grid prints evenly
    for (let k = slice.length; k < perPage; k++) {
      const blank = document.createElement('div');
      blank.className = 'cell';
      grid.appendChild(blank);
    }

    page.appendChild(grid);
    printRoot.appendChild(page);
  }
}
