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

  if(!rows.length){
    info.textContent = 'No results.';
    return;
  }

  ensureColMap(rows[0]);
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
