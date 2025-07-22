/* ===== SEARCH / AUTOCOMPLETE / BULK UPC BLOCK ===== */
document.addEventListener('DOMContentLoaded', () => {

  const box   = document.getElementById('searchBox');
  const subEl = document.getElementById('subdeptSelect');
  const sList = document.getElementById('suggestions');
  const bulkBox = document.getElementById('bulkUPCBox');

  async function loadSubdepts(){
    const r = await fetch('/api/subdepartments');
    const { subdepartments } = await r.json();
    subEl.innerHTML = '<option value="">All Sub Depts</option>' +
      subdepartments.map(sd=>`<option value="${sd.value}">${sd.label}</option>`).join('');
  }
  loadSubdepts();

  box.addEventListener('input', debounce(async e=>{
    const q = e.target.value.trim();
    if (!q) { sList.classList.add('hidden'); sList.innerHTML=''; return; }
    const term = /^\d/.test(q) ? canonUPC(q) : q;
    const url  = `/api/search-items?term=${encodeURIComponent(term)}&limit=30&subdept=${encodeURIComponent(subEl.value)}`;
    const r    = await fetch(url);
    const { results } = await r.json();

    sList.innerHTML = results.map(r=>{
      const code = r[guessCol('code', r)];
      const brand= r[guessCol('brand', r)] || '';
      const desc = r[guessCol('desc', r)]  || '';
      return `<li data-code="${code}"><strong>${brand}</strong> – ${desc} <span style="float:right;color:#777;">${code}</span></li>`;
    }).join('');
    sList.classList.toggle('hidden', results.length === 0);
  }, 150));

  sList.addEventListener('mousedown', e=>{
    const li = e.target.closest('li[data-code]');
    if (!li) return;
    e.preventDefault();
    box.value = li.dataset.code;
    performSearch();
    sList.classList.add('hidden');
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
