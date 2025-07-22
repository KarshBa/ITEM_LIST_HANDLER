// public/js/item_list.js

const box   = document.getElementById('searchBox');
const btn   = document.getElementById('searchBtn');
const sugg  = document.getElementById('suggestList');
const tbl   = document.getElementById('resultTable');
const info  = document.getElementById('resultInfo');
const exportBtn = document.getElementById('exportBtn');

const debounce = (fn, wait=120) => {
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); };
};

const canonUPC = raw => {
  const d = String(raw||'').replace(/\D/g,'');
  if (!d) return '';
  if (d.length===12) return ('0'+d.slice(0,11)).padStart(13,'0');
  return d.padStart(13,'0');
};

async function fetchSuggestions(q){
  if(!q) return [];
  const res = await fetch(`/api/search-items?term=${encodeURIComponent(q)}&limit=30`);
  if(!res.ok) return [];
  const { results } = await res.json();
  return results;
}

function showSuggestions(list){
  if(!list.length){ sugg.style.display='none'; sugg.innerHTML=''; return; }
  sugg.innerHTML = list.map(r=>{
    const code = r.code || r['Item Code'] || r['UPC'] || r['main code'] || '';
    const brand = r.brand || r['Brand'] || r['main item-brand'] || '';
    const desc  = r.description || r['Description'] || r['main item-description'] || '';
    return `<li data-code="${code}">
              <strong>${brand}</strong> – ${desc}
              <span class="muted" style="float:right">${code}</span>
            </li>`;
  }).join('');
  sugg.style.display='block';
}

const handleInput = debounce(async e=>{
  const q = e.target.value.trim();
  if(!q){ showSuggestions([]); return; }
  const list = await fetchSuggestions(q);
  showSuggestions(list);
}, 150);

box.addEventListener('input', handleInput);

/* Keep dropdown open until we pick */
sugg.addEventListener('mousedown', e=>{
  const li = e.target.closest('li[data-code]');
  if(!li) return;
  e.preventDefault();
  box.value = li.dataset.code;
  sugg.style.display='none';
  performSearch();
});

document.addEventListener('click', e=>{
  if(!sugg.contains(e.target) && e.target!==box){
    sugg.style.display='none';
  }
});

/* trigger on Enter */
box.addEventListener('keydown', e=>{
  if(e.key === 'Enter'){
    e.preventDefault();
    performSearch();
  }
});
btn.addEventListener('click', performSearch);

/* main search -> table */
async function performSearch(){
  const q = box.value.trim();
  if(!q) return;
  let term = q;
  if (/^\d+$/.test(q)) {
    const digits = q.replace(/\D/g,'');
    if (digits.length >= 11) {
      term = canonUPC(digits);
    }
  }

  const res = await fetch(`/api/search-items?term=${encodeURIComponent(term)}&limit=500`);
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
  thead.innerHTML = '<tr>'+keys.map(k=>`<th>${k}</th>`).join('')+'</tr>';

  rows.forEach(r=>{
    const tr = document.createElement('tr');
    keys.forEach(k=>{
      tr.insertAdjacentHTML('beforeend', `<td data-label="${k}">${r[k] ?? ''}</td>`);
    });
    tbody.appendChild(tr);
  });

  info.textContent = `${rows.length} result(s)`;
}

/* export table to CSV */
exportBtn.addEventListener('click', ()=>{
  const rows = [...tbl.querySelectorAll('tr')].map(tr=>
    [...tr.children].map(td => {
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
