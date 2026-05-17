// public/js/plus.js

const subSel = document.getElementById('pluSubdeptSelect');
const printBtn = document.getElementById('pluPrintBtn');
const info = document.getElementById('pluInfo');
const printArea = document.getElementById('pluPrintArea');

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function groupItems(items){
  const grouped = new Map();

  items.forEach(item => {
    const sd = item.subdepartment || 'Unassigned Sub-department';
    const cat = item.category || 'Unassigned Category';

    if (!grouped.has(sd)) grouped.set(sd, new Map());
    if (!grouped.get(sd).has(cat)) grouped.get(sd).set(cat, []);

    grouped.get(sd).get(cat).push(item);
  });

  return grouped;
}

function render(items){
  printArea.innerHTML = '';

  if (!items.length){
    info.textContent = 'No PLUs found for this selection.';
    return;
  }

  const grouped = groupItems(items);
  const selectedLabel = subSel.value
    ? subSel.options[subSel.selectedIndex]?.textContent || ''
    : 'All Sub Depts';

  info.textContent = `${items.length} PLU(s) shown — ${selectedLabel}`;

  let html = '';

  grouped.forEach((categories, subdepartment) => {
    html += `
      <section class="plu-subdept-section">
        <h2 class="plu-subdept-title">${escapeHtml(subdepartment)}</h2>
        <div class="plu-columns">
    `;

    categories.forEach((catItems, category) => {
      html += `
        <section class="plu-category-section">
          <h3 class="plu-category-title">${escapeHtml(category)}</h3>
          <table class="plu-table">
            <thead>
              <tr>
                <th>PLU</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
      `;

      catItems.forEach(item => {
        html += `
          <tr>
            <td class="plu-code">${escapeHtml(item.plu)}</td>
            <td>${escapeHtml(item.description)}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </section>
      `;
    });

    html += `
        </div>
      </section>
    `;
  });

  printArea.innerHTML = html;
}

async function loadPLUs(){
  const params = new URLSearchParams();
  if (subSel.value) params.set('subdept', subSel.value);

  info.textContent = 'Loading PLUs…';

  const url = `/api/plus${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok){
    const err = await res.json().catch(() => ({}));
    info.textContent = err.error || 'Failed to load PLUs.';
    return;
  }

  const { items, subdepartments } = await res.json();

  if (subSel.options.length <= 1){
    subSel.innerHTML = '<option value="">All Sub Depts</option>' +
      subdepartments
        .map(sd => `<option value="${escapeHtml(sd.value)}">${escapeHtml(sd.label)}</option>`)
        .join('');
  }

  render(items);
}

subSel.addEventListener('change', loadPLUs);
printBtn.addEventListener('click', () => window.print());

loadPLUs();