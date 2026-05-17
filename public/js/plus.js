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

  const ROWS_PER_COLUMN = 28;
  const COLUMNS_PER_PAGE = 3;
  const ROWS_PER_PAGE = ROWS_PER_COLUMN * COLUMNS_PER_PAGE;

  let html = '';

  grouped.forEach((categories, subdepartment) => {
    categories.forEach((catItems, category) => {
      for (let pageStart = 0; pageStart < catItems.length; pageStart += ROWS_PER_PAGE) {
        const pageItems = catItems.slice(pageStart, pageStart + ROWS_PER_PAGE);

        html += `
          <section class="plu-print-page">
            <section class="plu-subdept-section">
              <h2 class="plu-subdept-title">${escapeHtml(subdepartment)}</h2>
              <div class="plu-columns">
        `;

        for (let col = 0; col < COLUMNS_PER_PAGE; col++) {
          const colItems = pageItems.slice(
            col * ROWS_PER_COLUMN,
            (col + 1) * ROWS_PER_COLUMN
          );

          html += `
            <div class="plu-print-col">
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

          colItems.forEach(item => {
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
            </div>
          `;
        }

        html += `
              </div>
            </section>
          </section>
        `;
      }
    });
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