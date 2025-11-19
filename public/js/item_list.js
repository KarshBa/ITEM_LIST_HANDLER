// public/js/item_list.js

/* ------------ DOM refs ------------ */
const box        = document.getElementById('searchBox');
const btn        = document.getElementById('searchBtn');
const sugg       = document.getElementById('suggestions');
const tbl        = document.getElementById('resultTable');
const info       = document.getElementById('resultInfo');
const exportBtn  = document.getElementById('exportBtn');
const subSel     = document.getElementById('subdeptSelect');
const bulkBox    = document.getElementById('bulkUPCBox');
const bulkUPCBtn = document.getElementById('bulkUPCBtn');

/* ------------ utils --------------- */
const debounce = (fn, wait=120)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };

const canonUPC = raw => {
  const d = String(raw||'').replace(/\D/g,'');
  if (!d) return '';
  if (d.length === 12) return ('0'+d.slice(0,11)).padStart(13,'0');
  return d.padStart(13,'0');
};

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ---- date helpers for MM/DD/YY sale dates ---- */
// Parse strings like "11/5/25" into a Date (local), or null if invalid
function parseMMDDYY(str){
  if (!str) return null;
  const parts = String(str).trim().split(/[^\d]+/).filter(Boolean);
  if (parts.length !== 3) return null;
  let [m, d, y] = parts.map(Number);
  if (!m || !d || isNaN(y)) return null;
  if (y < 100) y += 2000;          // 25 -> 2025 (tweak if needed)
  return new Date(y, m - 1, d);    // local date (no time normalization yet)
}

// Return a new Date truncated to local midnight
function toDateOnly(dt){
  if (!(dt instanceof Date)) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/* ---- dynamic column map ---- */
let colMap = null;
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
function ensureColMap(row){
  if (colMap) return;
  const keys = Object.keys(row);
  const find = aliases => keys.find(k => aliases.includes(norm(k)));
  colMap = {
    code : find(['upc','code','itemcode','maincode'])                 || keys[0],
    brand: find(['brand','itembrand','mainitembrand'])                || keys[1] || keys[0],
    desc : find(['description','desc','mainitemdescription'])         || keys[2] || keys[0],
    subd : find(['subdepartmentdescription','subdepartment','subdept','sub-department-description'])
  };
}

/* ---- suggestion helpers ---- */
function hideSuggestions(){
  sugg.classList.add('hidden');
  sugg.innerHTML = '';
}
function showSuggestions(list){
  if (!list.length){ hideSuggestions(); return; }
  ensureColMap(list[0]);
  sugg.innerHTML = list.map(r=>{
    const code  = r[colMap.code]  ?? '';
    const brand = r[colMap.brand] ?? '';
    const desc  = r[colMap.desc]  ?? '';
    return `<li data-code="${code}">
              <strong>${escapeHtml(brand) || '(no brand)'}</strong> – ${escapeHtml(desc) || '(no description)'}
              <span class="muted" style="float:right">${code}</span>
            </li>`;
  }).join('');
  sugg.classList.remove('hidden');
}

/* ---- subdept list ---- */
async function loadSubdepartments(){
  const res = await fetch('/api/subdepartments');
  if(!res.ok) return;
  const { subdepartments } = await res.json();
  subSel.innerHTML = '<option value="">All Sub Depts</option>' +
    subdepartments.map(sd=>`<option value="${sd.value || sd}">${sd.label || sd}</option>`).join('');
}

/* ---- fetch suggestions ---- */
async function fetchSuggestions(q){
  if(!q) return [];
  let term = /^\d/.test(q) ? canonUPC(q) : q;

  const params = new URLSearchParams({
    term,
    limit: 30,
    subdept: subSel.value || ''
  });

  const res = await fetch(`/api/search-items?${params.toString()}`, { cache:'no-store' });
  if(!res.ok) return [];
  const { results } = await res.json();
  return results;
}

/* ---- main search ---- */
async function performSearch(){
  const q  = box.value.trim();
  const sd = subSel.value;
  if (!q && !sd){ hideSuggestions(); return; }

  let term = /^\d/.test(q) ? canonUPC(q) : q;

  const params = new URLSearchParams({
    term,
    limit: 500,
    subdept: sd || ''
  });

  const res = await fetch(`/api/search-items?${params.toString()}`, { cache:'no-store' });
  if(!res.ok){ alert('Search failed'); return; }
  const { results } = await res.json();
  renderTable(results);
  hideSuggestions();
}

/* ---- bulk UPC exact ---- */
async function bulkUPCSearch(){
  const raw = (bulkBox?.value || '').trim();
  if (!raw) return;
  const codes = raw.split(/[\s,]+/).filter(Boolean);

  const url = `/api/bulk-upc?codes=${encodeURIComponent(codes.join(','))}`;
  const r   = await fetch(url, { cache:'no-store' });
  if (!r.ok) return alert('Bulk search failed');
  const { results } = await r.json();
  renderTable(results);
}

/* ---- table render ---- */
function renderTable(rows){
  const thead = tbl.querySelector('thead');
  const tbody = tbl.querySelector('tbody');
  thead.innerHTML = tbody.innerHTML = '';

  if (!rows.length){
    info.textContent = 'No results.';
    return;
  }

  ensureColMap(rows[0]);
  const keys = Object.keys(rows[0]);

  // Build header row
  thead.innerHTML = '<tr>' + keys.map(k => `<th>${k}</th>`).join('') + '</tr>';

  // --- column name lookups (case-insensitive) ------------------  // NEW
  const lc = s => s.toLowerCase();

  const notForSaleCol = keys.find(k => lc(k) === 'pos information-not for sale');   // NEW
  const saleStartCol  = keys.find(k => lc(k) === 'price-sale-start');               // NEW
  const saleEndCol    = keys.find(k => lc(k) === 'price-sale-end');                 // NEW
  const mainCodeCol   = keys.find(k => lc(k) === 'main code');                      // NEW
  const aisleCol      = keys.find(k => lc(k) === 'location-aisle');                 // NEW
  const sectionCol    = keys.find(k => lc(k) === 'location-section');               // NEW

  // Today's date (local) normalized to midnight                      // NEW
  const today = toDateOnly(new Date());                               // NEW

  rows.forEach(r => {
    const tr = document.createElement('tr');

    // ---- compute flags for this row ------------------------------  // NEW
    const notForSaleVal = notForSaleCol && r[notForSaleCol] != null
      ? String(r[notForSaleCol]).trim()
      : '';

    const isNotForSale = notForSaleVal === '1';

    let isOnSale = false;
    if (saleStartCol && saleEndCol){
      const startDateRaw = r[saleStartCol];
      const endDateRaw   = r[saleEndCol];

      const start = startDateRaw ? toDateOnly(parseMMDDYY(startDateRaw)) : null;
      const end   = endDateRaw   ? toDateOnly(parseMMDDYY(endDateRaw))   : null;

      if (start && end && today){
        // Inclusive range: start <= today <= end
        if (start.getTime() <= today.getTime() && today.getTime() <= end.getTime()){
          isOnSale = true;
        }
      }
    }

    // Apply row-level classes based on flags                         // NEW
    if (isNotForSale && isOnSale){
      tr.classList.add('row-not-for-sale-on-sale');
    } else if (isNotForSale){
      tr.classList.add('row-not-for-sale');
    } else if (isOnSale){
      tr.classList.add('row-on-sale');
    }

    // Precompute location tooltip (if any)                           // NEW
    const aisle   = aisleCol   ? String(r[aisleCol]   ?? '').trim() : '';
    const section = sectionCol ? String(r[sectionCol] ?? '').trim() : '';
    const locationText = [aisle, section].filter(Boolean).join(' ');
    const locationTooltip = locationText ? `Location: ${locationText}` : '';

    // ---- build cells ----------------------------------------------
    keys.forEach(k => {
      const td = document.createElement('td');
      td.dataset.label = k;
      td.textContent = r[k] ?? '';

      // If this is the "Main code" cell, attach tooltip if we have one
      if (mainCodeCol && k === mainCodeCol && locationTooltip){
        td.title = locationTooltip;                                      // NEW
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  info.textContent = `${rows.length} result(s)`;
}

/* ---- export CSV ---- */
exportBtn.addEventListener('click', ()=>{
  const rows = [...tbl.querySelectorAll('tr')].map(tr =>
    [...tr.children].map(td=>{
      const v = td.textContent.replace(/"/g,'""');
      return /[",\n]/.test(v) ? `"${v}"` : v;
    }).join(',')
  );
  const csv = rows.join('\r\n');
  const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'_');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `search_results_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ---- listeners ---- */
box.addEventListener('input', debounce(async e=>{
  const q = e.target.value.trim();
  if(!q){ hideSuggestions(); return; }
  const list = await fetchSuggestions(q);
  showSuggestions(list);
}, 150));

sugg.addEventListener('mousedown', e=>{
  const li = e.target.closest('li[data-code]');
  if(!li) return;
  e.preventDefault();
  box.value = li.dataset.code;
  performSearch();
  hideSuggestions();
});

document.addEventListener('click', e=>{
  if(!sugg.contains(e.target) && e.target !== box){
    hideSuggestions();
  }
});

box.addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); performSearch(); }
});
btn.addEventListener('click', performSearch);
subSel.addEventListener('change', performSearch);

if (bulkUPCBtn && bulkBox){
  bulkUPCBtn.addEventListener('click', bulkUPCSearch);
  bulkBox.addEventListener('keydown', e=>{
    if(e.key === 'Enter'){ e.preventDefault(); bulkUPCSearch(); }
  });
}

/* ---- init ---- */
loadSubdepartments();
