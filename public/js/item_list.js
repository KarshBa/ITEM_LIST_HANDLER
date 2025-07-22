// public/js/item_list.js

const box        = document.getElementById('searchBox');
const btn        = document.getElementById('searchBtn');
const sugg       = document.getElementById('suggestions');
const tbl        = document.getElementById('resultTable');
const info       = document.getElementById('resultInfo');
const exportBtn  = document.getElementById('exportBtn');
const subSel     = document.getElementById('subdeptSelect');

// --- column map & helpers (used by suggestions) -----------------
let colMap = null;
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
function ensureColMap(row){
  if (colMap) return;
  const keys = Object.keys(row);
  const find = aliases => keys.find(k => aliases.includes(norm(k)));
  colMap = {
    code : find(['upc','code','itemcode','maincode']) || keys[0],
    brand: find(['brand','itembrand','mainitembrand']) || keys[1] || keys[0],
    desc : find(['description','desc','mainitemdescription']) || keys[2] || keys[0]
  };
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// --- dropdown helpers -------------------------------------------
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

const debounce = (fn, wait=120)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait);} };

const canonUPC = raw => {
  const d = String(raw||'').replace(/\D/g,'');
  if (!d) return '';
  if (d.length===12) return ('0'+d.slice(0,11)).padStart(13,'0');
  return d.padStart(13,'0');
};

// normalize fields from arbitrary column names
const UPC_RX   = [/^upc/i, /item.?code/i, /^code$/i];
const BRAND_RX = [/brand/i];
const DESC_RX  = [/desc(ription)?/i];
const SUBD_RX  = [/sub.?department.?description/i];

function pick(obj, regexArr){
  const key = Object.keys(obj).find(k => regexArr.some(rx=>rx.test(k)));
  return key ? obj[key] : '';
}

async function loadSubdepartments(){
  const res = await fetch('/api/subdepartments');
  if(!res.ok) return;
  const { subdepartments } = await res.json();
  subdepartments.forEach(sd=>{
    const opt = document.createElement('option');
    opt.value = sd;
    opt.textContent = sd;
    subSel.appendChild(opt);
  });
}

async function fetchSuggestions(q){
  if(!q) return [];
  let term = q;
  if(/^\d+$/.test(q)){
    const digits = q.replace(/\D/g,'');
    if(digits.length>=11) term = canonUPC(digits);
  }
  const params = new URLSearchParams({
    term,
    limit: 30,
    subdept: subSel.value || ''
  });
  const res = await fetch(`/api/search-items?${params.toString()}`, {cache:'no-store'});
  if(!res.ok) return [];
  const { results } = await res.json();
  return results;
}

const handleInput = debounce(async e=>{
  const q = e.target.value.trim();
  if(!q){ showSuggestions([]); return; }
  const list = await fetchSuggestions(q);
  showSuggestions(list);
}, 150);

box.addEventListener('input', handleInput);

// keep open till pick
sugg.addEventListener('mousedown', e=>{
  const li = e.target.closest('li[data-code]');
  if(!li) return;
  e.preventDefault();
  box.value = li.dataset.code;
  hideSuggestions();;
  performSearch();
});

document.addEventListener('click', e=>{
  if(!sugg.contains(e.target) && e.target!==box){
    hideSuggestions();;
  }
});

box.addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    e.preventDefault();
    performSearch();
  }
});
btn.addEventListener('click', performSearch);

/* ---- main search -> table ---- */
async function performSearch(){
  const q = box.value.trim();
  if(!q) return;

  let term = q;
  if(/^\d+$/.test(q)){
    const digits = q.replace(/\D/g,'');
    if(digits.length>=11) term = canonUPC(digits);
  }

  const params = new URLSearchParams({
    term,
    limit: 500,
    subdept: subSel.value || ''
  });

  const res = await fetch(`/api/search-items?${params.toString()}`, {cache:'no-store'});
  if(!res.ok){ alert('Search failed'); return; }
  const { results } = await res.json();
  renderTable(results);
}

function renderTable(rows){
  const thead = tbl.querySelector('thead');
  const tbody = tbl.querySelector('tbody');
  thead.innerHTML = tbody.innerHTML = '';

  if(!rows.length){
    info.textContent = 'No results.';
    return;
  }

  const keys = Object.keys(rows[0]);
  thead.innerHTML = '<tr>' + keys.map(k=>`<th>${k}</th>`).join('') + '</tr>';

  rows.forEach(r=>{
    const tr = document.createElement('tr');
    keys.forEach(k=>{
      tr.insertAdjacentHTML('beforeend', `<td data-label="${k}">${r[k] ?? ''}</td>`);
    });
    tbody.appendChild(tr);
  });

  info.textContent = `${rows.length} result(s)`;
}

/* export current table */
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

  subEl.addEventListener('change', ()=> performSearch());

  document.getElementById('searchBtn').onclick = performSearch;
  box.addEventListener('keydown', e=>{
    if (e.key === 'Enter') { e.preventDefault(); performSearch(); }
  });

  async function performSearch(){
    const q  = box.value.trim();
    const sd = subEl.value;
    let term = q;
    if (/^\d/.test(q)) term = canonUPC(q);

    const url = `/api/search-items?term=${encodeURIComponent(term)}&limit=500&subdept=${encodeURIComponent(sd)}`;
    const res = await fetch(url);
    if (!res.ok) return alert('Search failed');
    const { results } = await res.json();
    renderTable(results);
    hideSuggestions();
  }

  document.getElementById('bulkUPCBtn').onclick = bulkUPCSearch;
  bulkBox.addEventListener('keydown', e=>{
    if (e.key === 'Enter') { e.preventDefault(); bulkUPCSearch(); }
  });
  async function bulkUPCSearch(){
    const raw = bulkBox.value.trim();
    if (!raw) return;
    const codes = raw.split(/[\s,]+/).filter(Boolean);
    const url   = `/api/bulk-upc?codes=${encodeURIComponent(codes.join(','))}`;
    const r     = await fetch(url);
    if (!r.ok) return alert('Bulk search failed');
    const { results } = await r.json();
    renderTable(results);
  }

  // helpers
  function canonUPC(raw){
    const d = String(raw||'').replace(/\D/g,'');
    if (!d) return '';
    if (d.length === 12) return ('0'+d.slice(0,11)).padStart(13,'0');
    return d.padStart(13,'0');
  }
  function debounce(fn, wait=120){
    let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),wait); };
  }
  function guessCol(type, row){
    const keys = Object.keys(row);
    const n = s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
    const match = {
      code : ['code','itemcode','upc','maincode'],
      brand: ['brand','itembrand'],
      desc : ['description','desc']
    };
    return keys.find(k => match[type].includes(n(k))) || keys[0];
  }

});

/* init */
loadSubdepartments();
