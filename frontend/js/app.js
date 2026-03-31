// ── Chart.js globals ──────────────────────────────────────────────────────────
const PALETTE = [
  '#6366f1','#10b981','#f59e0b','#ef4444',
  '#3b82f6','#8b5cf6','#ec4899','#14b8a6',
];
let _ordChartQty = null;
let _ordChartRev = null;
{
  const _t = localStorage.getItem('theme') || 'dark';
  Chart.defaults.color       = _t === 'dark' ? '#8892a4' : '#64748b';
  Chart.defaults.borderColor = _t === 'dark' ? '#2a2a5044' : '#d1d9e688';
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
}

// ── Auth ─────────────────────────────────────────────────────────────────
let _currentUser = null;

function showLoginOverlay() {
  const el = document.getElementById('loginOverlay');
  if (el) el.classList.remove('hidden');
}
function hideLoginOverlay() {
  const el = document.getElementById('loginOverlay');
  if (el) el.classList.add('hidden');
}

async function initAuth() {
  const token = getToken();
  if (!token) { showLoginOverlay(); return; }
  try {
    _currentUser = await api.me();
    onAuthSuccess();
  } catch {
    showLoginOverlay();
  }
}

function onAuthSuccess() {
  hideLoginOverlay();
  const el = document.getElementById('sidebarUsername');
  if (el) el.textContent = _currentUser.username;
  // Show/hide admin-only elements
  document.querySelectorAll('.nav-admin-only').forEach(el => {
    el.style.display = _currentUser.is_admin ? '' : 'none';
  });
}

// Login form
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('[type="submit"]');
      const errEl = document.getElementById('loginError');
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      btn.disabled = true;
      btn.textContent = t('login_loading');
      errEl.textContent = '';
      try {
        const data = await api.login(username, password);
        setToken(data.access_token);
        _currentUser = await api.me();
        onAuthSuccess();
        initApp();
      } catch (err) {
        errEl.textContent = err.message === '401' || err.message.includes('Credencial') || err.message.includes('Login')
          ? t('login_error') : err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = t('login_btn');
      }
    });
  }

  // Show/hide password toggle
  const eye = document.getElementById('btnTogglePass');
  if (eye) eye.addEventListener('click', () => {
    const inp = document.getElementById('loginPass');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // Logout
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    setToken('');
    _currentUser = null;
    showLoginOverlay();
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
  });

  // Auth logout event (triggered by 401)
  window.addEventListener('auth:logout', () => {
    _currentUser = null;
    showLoginOverlay();
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt     = n => Number(n).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = s => new Date(s).toLocaleString('ca-ES', { dateStyle: 'short', timeStyle: 'medium' });

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Template i18n with {var} substitution
function ti(key, vars = {}) {
  let s = t(key);
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', v);
  return s;
}

let toastTimer;
function toast(msg, type = 'info') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function isoToLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function localToISO(val) {
  if (!val) return null;
  return new Date(val).toISOString();
}

// ── Sidebar collapse ──────────────────────────────────────────────────────────
(function () {
  const sidebar = document.querySelector('.sidebar');
  let collapsed = localStorage.getItem('sidebar-collapsed') === '1';

  function apply(animate) {
    if (!animate) sidebar.style.transition = 'none';
    sidebar.classList.toggle('collapsed', collapsed);
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '60px' : '248px');
    const btn = document.getElementById('btnSidebarToggle');
    if (btn) { btn.textContent = collapsed ? '›' : '‹'; btn.title = collapsed ? 'Expandir' : 'Compactar'; }
    if (!animate) requestAnimationFrame(() => { sidebar.style.transition = ''; });
  }

  apply(false); // apply immediately on load (no animation)

  document.getElementById('btnSidebarToggle').addEventListener('click', () => {
    collapsed = !collapsed;
    localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
    apply(true);
  });
})();

// ── Theme ─────────────────────────────────────────────────────────────────────
let _theme = localStorage.getItem('theme') || 'dark';

function applyTheme(theme) {
  _theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  $('btnTheme').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
  Chart.defaults.color       = theme === 'dark' ? '#8892a4' : '#64748b';
  Chart.defaults.borderColor = theme === 'dark' ? '#2a2a5044' : '#d1d9e688';
  [_ordChartQty, _ordChartRev].forEach(c => c?.update());
}

applyTheme(_theme);
$('btnTheme').addEventListener('click', () => applyTheme(_theme === 'dark' ? 'light' : 'dark'));

// ── Language ──────────────────────────────────────────────────────────────────
// applyTranslations() is called AFTER all variables are in scope (see bottom of TRP section)
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => setLang(btn.dataset.lang));
});

// ── Tab navigation ────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'clients')  loadClients();
    if (btn.dataset.tab === 'products') loadProducts();
    if (btn.dataset.tab === 'orders')   loadOrders();
    if (btn.dataset.tab === 'users')    loadUsers();
  });
});

// ── TRP (Time Range Picker) factory ───────────────────────────────────────────
const PRESETS = [
  { ms: 15 * 60 * 1000,    key: 'qr_15m'  },
  { ms: 30 * 60 * 1000,    key: 'qr_30m'  },
  { ms: 3600 * 1000,       key: 'qr_1h'   },
  { ms: 3 * 3600 * 1000,   key: 'qr_3h'   },
  { ms: 6 * 3600 * 1000,   key: 'qr_6h'   },
  { ms: 12 * 3600 * 1000,  key: 'qr_12h'  },
  { ms: 24 * 3600 * 1000,  key: 'qr_24h'  },
  { ms: 2 * 86400 * 1000,  key: 'qr_2d'   },
  { ms: 5 * 86400 * 1000,  key: 'qr_5d'   },
  { ms: 7 * 86400 * 1000,  key: 'qr_7d'   },
  { ms: 10 * 86400 * 1000, key: 'qr_10d'  },
  { ms: 15 * 86400 * 1000, key: 'qr_15d'  },
  { ms: 30 * 86400 * 1000, key: 'qr_30d'  },
];

function makeTRP(ids, onChange) {
  // ids: { wrapper, panel, triggerBtn, label, presets, startInput, endInput, applyBtn, allBtn, badge, liveHint }
  const el = {};
  for (const [k, id] of Object.entries(ids)) el[k] = $(id);

  let mode = 'relative', relMs = 24 * 3600 * 1000, relKey = 'qr_24h';
  let absStart = null, absEnd = null;

  const params = () => {
    const now = new Date();
    return mode === 'relative'
      ? { start: new Date(now - relMs).toISOString(), end: now.toISOString() }
      : { start: absStart, end: absEnd || now.toISOString() };
  };

  const isLive = () => mode === 'relative' || !absEnd;

  const syncLabel = () => {
    if (mode === 'relative') {
      el.label.textContent = t(relKey);
    } else {
      const f = iso => iso ? isoToLocal(iso).replace('T', ' ') : t('filter_live_ph');
      el.label.textContent = `${f(absStart)} → ${f(absEnd)}`;
    }
    el.badge.classList.toggle('hidden', !isLive());
    el.presets.querySelectorAll('.trp-preset-btn').forEach(b => {
      b.classList.toggle('active', mode === 'relative' && b.dataset.key === relKey);
    });
  };

  const renderPresets = () => {
    el.presets.innerHTML = PRESETS.map(p =>
      `<button class="trp-preset-btn" data-key="${p.key}" data-ms="${p.ms}">${t(p.key)}</button>`
    ).join('');
    el.presets.querySelectorAll('.trp-preset-btn').forEach(b => {
      b.addEventListener('click', () => {
        mode = 'relative'; relMs = +b.dataset.ms; relKey = b.dataset.key;
        syncLabel(); close(); onChange?.();
      });
    });
    syncLabel();
  };

  const open = () => {
    const p = params();
    el.startInput.value = isoToLocal(p.start);
    el.endInput.value   = (mode === 'absolute' && absEnd) ? isoToLocal(absEnd) : '';
    el.liveHint.classList.toggle('hidden', !!el.endInput.value);
    el.panel.style.display = 'flex';
    el.triggerBtn.classList.add('open');
  };

  const close = () => {
    el.panel.style.display = 'none';
    el.triggerBtn.classList.remove('open');
  };

  // Wire events
  el.triggerBtn.addEventListener('click', e => {
    e.stopPropagation();
    el.panel.style.display !== 'none' ? close() : (renderPresets(), open());
  });
  el.endInput.addEventListener('input', () => {
    el.liveHint.classList.toggle('hidden', !!el.endInput.value);
  });
  el.applyBtn.addEventListener('click', () => {
    const sv = el.startInput.value, ev = el.endInput.value;
    mode = 'absolute'; absStart = sv ? localToISO(sv) : null; absEnd = ev ? localToISO(ev) : null;
    syncLabel(); close(); onChange?.();
  });
  el.allBtn.addEventListener('click', async () => {
    try {
      const range = await api.range();
      mode = 'absolute'; absStart = range.has_data ? range.min : null; absEnd = null;
      syncLabel(); close(); onChange?.();
    } catch {}
  });
  document.addEventListener('click', e => {
    if (!el.wrapper.contains(e.target)) close();
  });

  const init = () => {
    mode = 'relative'; relMs = 24 * 3600 * 1000; relKey = 'qr_24h';
    absStart = null; absEnd = null;
    renderPresets(); syncLabel();
  };

  return { params, isLive, init, syncLabel, renderPresets };
}

// Create the orders TRP instance
const ordTRP = makeTRP({
  wrapper:     'ordTrpWrapper',
  panel:       'ordTrpPanel',
  triggerBtn:  'ordBtnTimeRange',
  label:       'ordTimeRangeLabel',
  presets:     'ordTrpPresets',
  startInput:  'ordFilterStart',
  endInput:    'ordFilterEnd',
  applyBtn:    'ordBtnApplyFilter',
  allBtn:      'ordBtnRangeAll',
  badge:       'ordLiveBadge',
  liveHint:    'ordTrpLiveHint',
}, () => { _ordPage = 1; loadOrders(); });

// Hook called by i18n.js applyTranslations() on every language change
function onLangChanged() {
  ordTRP.renderPresets();
}

// Apply static HTML translations (called here, after all TRP vars are in scope)
applyTranslations();

// ── Filter init ───────────────────────────────────────────────────────────────
function initFilter() {
  ordTRP.init();
}

// ── Generator ─────────────────────────────────────────────────────────────────
let generatorRunning = false;

async function syncGeneratorStatus() {
  try {
    const s = await api.genStatus();
    generatorRunning = s.running;
    updateGenUI();
  } catch {}
}

function updateGenUI() {
  const btn    = $('btnGenToggle');
  const status = $('genStatus');
  if (generatorRunning) {
    btn.textContent = t('gen_stop');
    btn.classList.add('btn-running'); btn.classList.remove('btn-success');
    status.textContent = t('gen_running'); status.className = 'gen-status running';
  } else {
    btn.textContent = t('gen_start');
    btn.classList.remove('btn-running'); btn.classList.add('btn-success');
    status.textContent = t('gen_stopped'); status.className = 'gen-status stopped';
  }
}

// Sync min/max inputs → constrain interval value
$('genMin').addEventListener('change', () => {
  const v = parseFloat($('genMin').value) || 0.5;
  $('genInterval').min = v;
  const cur = parseFloat($('genInterval').value) || 15;
  if (cur < v) $('genInterval').value = v;
});
$('genMax').addEventListener('change', () => {
  const v = parseFloat($('genMax').value) || 60;
  $('genInterval').max = v;
  const cur = parseFloat($('genInterval').value) || 15;
  if (cur > v) $('genInterval').value = v;
});

$('btnGenToggle').addEventListener('click', async () => {
  try {
    if (generatorRunning) {
      await api.stopGenerator(); generatorRunning = false; toast(t('toast_gen_stopped'), 'info');
    } else {
      const interval = parseFloat($('genInterval').value) || 2;
      await api.startGenerator(interval); generatorRunning = true; toast(t('toast_gen_started'), 'success');
    }
    updateGenUI();
  } catch (e) { toast(e.message, 'error'); }
});

// ── Reset simulation ──────────────────────────────────────────────────────────
$('btnReset').addEventListener('click', async () => {
  if (!confirm(t('gen_reset_confirm'))) return;
  const wasRunning = generatorRunning;
  try {
    if (wasRunning) await api.stopGenerator();
    await api.resetOrders();
    if (wasRunning) {
      const interval = parseFloat($('genInterval').value) || 2;
      await api.startGenerator(interval);
    }
    generatorRunning = wasRunning; updateGenUI();
    lastOrderId = 0;
    initFilter();
    toast(t('toast_reset_done'), 'success');
    loadOrders();
  } catch (e) { toast(e.message, 'error'); }
});

// ── Nav counts ────────────────────────────────────────────────────────────────
async function _syncNavCounts() {
  try {
    const [clients, products, users] = await Promise.all([
      api.getClients(), api.getProducts(), api.getUsers(),
    ]);
    const ncc = $('navCountClients'); if (ncc) ncc.textContent = clients.length;
    const ncp = $('navCountProducts'); if (ncp) ncp.textContent = products.length;
    const ncu = $('navCountUsers');    if (ncu) ncu.textContent = users.length;
  } catch {}
}

// ── Boot sequence ─────────────────────────────────────────────────────────────
function initApp() {
  initFilter();
  loadOrders();
  syncGeneratorStatus();
  setInterval(syncGeneratorStatus, 5000);
  _syncNavCounts();
  setInterval(_syncNavCounts, 30000);
  setupUserForm();
}

// Start the app only after auth check
window.addEventListener('DOMContentLoaded', () => {
  initAuth().then(() => {
    if (_currentUser) initApp();
  });
});

// ── Orders ────────────────────────────────────────────────────────────────────
let lastOrderId   = 0;
let _ordPage      = 1;
let _ordPageSize  = 50;
let _ordTotal     = 0;
let _ordSelAll    = false;   // true = all filtered IDs in memory
let _ordAllIds    = [];

// Auto-refresh orders every 5s when on orders tab and no selection active
setInterval(async () => {
  if (document.querySelector('.nav-item.active')?.dataset.tab !== 'orders') return;
  if (_ordSelAll) return;  // don't interrupt bulk selection
  try {
    const p = { ...ordTRP.params(), limit: _ordPageSize, offset: (_ordPage - 1) * _ordPageSize };
    const result = await api.getOrders(p);
    if (result.total !== _ordTotal || result.items[0]?.id !== lastOrderId) {
      _ordTotal = result.total;
      const nco = $('navCountOrders'); if (nco) nco.textContent = _ordTotal;
      const prevChecked = new Set(
        [...$('ordersBody').querySelectorAll('.order-check:checked')].map(cb => +cb.value)
      );
      const prevIds = new Set(
        [...$('ordersBody').querySelectorAll('tr[data-id]')].map(tr => +tr.dataset.id)
      );
      const newIds = prevIds.size
        ? new Set(result.items.filter(o => !prevIds.has(o.id)).map(o => o.id))
        : new Set();
      renderOrders(result.items, prevChecked, newIds);
      renderPagination();
      if (result.items.length) lastOrderId = result.items[0].id;
    }
  } catch {}
}, 5000);

// ── Orders summary charts ─────────────────────────────────────────────────────
_ordChartQty = new Chart(
  $('ordChartProductQty').getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Unitats', data: [],
      backgroundColor: PALETTE, borderRadius: 3, maxBarThickness: 14 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#2a2a5044' },
             ticks: { callback: v => v.toLocaleString(), font: { size: 11 } } },
        y: { grid: { color: '#2a2a5044' },
             ticks: { font: { size: 11 } } },
      },
    },
  }
);

_ordChartRev = new Chart(
  $('ordChartProductRev').getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Ingressos (€)', data: [],
      backgroundColor: PALETTE, borderRadius: 3, maxBarThickness: 14 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#2a2a5044' },
             ticks: { callback: v => '€' + v.toLocaleString(), font: { size: 11 } } },
        y: { grid: { color: '#2a2a5044' },
             ticks: { font: { size: 11 } } },
      },
    },
  }
);

async function _refreshOrdersSummary() {
  try {
    const p = ordTRP.params();
    const [summary, products] = await Promise.all([
      api.summary(p), api.productStats(p),
    ]);
    const ordEl = $('ordStatOrders');
    const revEl = $('ordStatRevenue');
    if (ordEl) { ordEl.textContent = summary.total_orders.toLocaleString(); ordEl.style.color = ''; }
    if (revEl) { revEl.textContent = '€' + fmt(summary.total_revenue); revEl.style.color = ''; }

    // Ordenació independent per a cada gràfica
    const byQty = [...products].sort((a, b) => b.total_quantity - a.total_quantity);
    const byRev = [...products].sort((a, b) => b.total_revenue  - a.total_revenue);

    // Altura dinàmica compacta: 18px per producte + marges, mínim 160px
    const h = Math.max(160, products.length * 18 + 40);
    const qtyWrap = document.getElementById('ordChartProductQty')?.parentElement;
    const revWrap = document.getElementById('ordChartProductRev')?.parentElement;
    if (qtyWrap) qtyWrap.style.height = h + 'px';
    if (revWrap) revWrap.style.height = h + 'px';

    _ordChartQty.data.labels               = byQty.map(p => p.name);
    _ordChartQty.data.datasets[0].data     = byQty.map(p => p.total_quantity);
    _ordChartQty.update('none');

    _ordChartRev.data.labels               = byRev.map(p => p.name);
    _ordChartRev.data.datasets[0].data     = byRev.map(p => p.total_revenue);
    _ordChartRev.update('none');
  } catch {}
}

async function loadOrders() {
  try {
    const p = { ...ordTRP.params(), limit: _ordPageSize, offset: (_ordPage - 1) * _ordPageSize };
    const result = await api.getOrders(p);
    _ordTotal = result.total;
    const nco = $('navCountOrders'); if (nco) nco.textContent = _ordTotal;
    renderOrders(result.items);
    renderPagination();
    if (result.items.length) lastOrderId = result.items[0].id;
    _clearSelection();
    _refreshOrdersSummary();
  } catch (e) { toast(e.message, 'error'); }
}

function renderOrders(orders, restoreChecked = new Set(), newIds = new Set()) {
  $('ordersBody').innerHTML = orders.map(o => `
    <tr data-id="${o.id}" class="${restoreChecked.has(o.id) ? 'row-selected' : ''} ${newIds.has(o.id) ? 'row-new' : ''}">
      <td class="col-check"><input type="checkbox" class="order-check" value="${o.id}" ${restoreChecked.has(o.id) ? 'checked' : ''} /></td>
      <td><span class="badge">#${o.id}</span></td>
      <td>${esc(o.client_name  || '–')}</td>
      <td>${esc(o.product_name || '–')}</td>
      <td>${o.quantity}</td>
      <td>€${fmt(parseFloat(o.unit_price))}</td>
      <td><strong>€${fmt(parseFloat(o.total_price))}</strong></td>
      <td>${fmtDate(o.created_at)}</td>
      <td><div class="td-actions">
        <button class="btn btn-danger" onclick="deleteOrder(${o.id})">✕</button>
      </div></td>
    </tr>`
  ).join('');
  $('ordersBody').querySelectorAll('.order-check').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('tr').classList.toggle('row-selected', cb.checked);
      _updateOrderSelection();
    });
  });
  if (restoreChecked.size) _updateOrderSelection();
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(_ordTotal / _ordPageSize));
  const from = _ordTotal > 0 ? (_ordPage - 1) * _ordPageSize + 1 : 0;
  const to   = Math.min(_ordPage * _ordPageSize, _ordTotal);
  $('paginationInfo').textContent =
    `${t('orders_showing')} ${from}–${to} ${t('orders_of')} ${_ordTotal} ${t('orders_suffix')}`;
  $('pageIndicator').textContent =
    `${t('orders_page_lbl')} ${_ordPage} / ${totalPages}`;
  $('btnPrevPage').disabled = _ordPage <= 1;
  $('btnNextPage').disabled = _ordPage >= totalPages;
}

$('btnPrevPage').addEventListener('click', () => {
  if (_ordPage > 1) { _ordPage--; loadOrders(); }
});
$('btnNextPage').addEventListener('click', () => {
  const totalPages = Math.ceil(_ordTotal / _ordPageSize);
  if (_ordPage < totalPages) { _ordPage++; loadOrders(); }
});
$('ordPageSize').addEventListener('change', () => {
  _ordPageSize = parseInt($('ordPageSize').value);
  _ordPage = 1;
  loadOrders();
});

function _clearSelection() {
  _ordSelAll = false; _ordAllIds = [];
  $('checkAllOrders').checked = false;
  $('checkAllOrders').indeterminate = false;
  $('btnDeleteSelected').style.display = 'none';
  $('selBanner').style.display = 'none';
  $('btnSelectAllFiltered').style.display = 'none';
}

function _updateOrderSelection() {
  if (_ordSelAll) return; // managed separately
  const all     = $('ordersBody').querySelectorAll('.order-check');
  const checked = $('ordersBody').querySelectorAll('.order-check:checked');
  const n = checked.length;

  $('checkAllOrders').checked       = n > 0 && n === all.length;
  $('checkAllOrders').indeterminate = n > 0 && n < all.length;

  const delBtn = $('btnDeleteSelected');
  const banner = $('selBanner');
  const allBtn = $('btnSelectAllFiltered');

  if (n === 0) {
    delBtn.style.display = 'none';
    banner.style.display = 'none';
    allBtn.style.display = 'none';
    return;
  }

  delBtn.style.display = '';
  delBtn.textContent = `${t('btn_delete_selected')} (${n})`;

  banner.style.display = 'flex';
  $('selBannerText').textContent = ti('sel_page_n', { n });

  // Show "select all N" button when full page is checked and more rows exist
  if (n === all.length && _ordTotal > n) {
    allBtn.style.display = '';
    allBtn.textContent = ti('sel_prompt_n', { n: _ordTotal });
  } else {
    allBtn.style.display = 'none';
  }
}

$('checkAllOrders').addEventListener('change', e => {
  const checked = e.target.checked;
  $('ordersBody').querySelectorAll('.order-check').forEach(cb => {
    cb.checked = checked;
    cb.closest('tr').classList.toggle('row-selected', checked);
  });
  _updateOrderSelection();
});

// "Select all N filtered" — fetch all matching IDs
$('btnSelectAllFiltered').addEventListener('click', async () => {
  try {
    _ordAllIds = await api.getOrderIds(ordTRP.params());
    _ordSelAll = true;
    const n = _ordAllIds.length;
    $('selBannerText').textContent = ti('sel_all_n', { n });
    $('btnSelectAllFiltered').style.display = 'none';
    $('btnDeleteSelected').style.display = '';
    $('btnDeleteSelected').textContent = `${t('btn_delete_selected')} (${n})`;
    // Visually check all visible rows
    $('ordersBody').querySelectorAll('.order-check').forEach(cb => {
      cb.checked = true; cb.closest('tr').classList.add('row-selected');
    });
    $('checkAllOrders').checked = true; $('checkAllOrders').indeterminate = false;
  } catch (e) { toast(e.message, 'error'); }
});

$('btnClearSelection').addEventListener('click', () => { _clearSelection(); loadOrders(); });

$('btnDeleteSelected').addEventListener('click', async () => {
  let ids;
  if (_ordSelAll) {
    ids = _ordAllIds;
  } else {
    ids = [...$('ordersBody').querySelectorAll('.order-check:checked')].map(cb => +cb.value);
  }
  if (!ids.length) return;
  if (!confirm(t('delete_selected_confirm'))) return;
  try {
    await api.deleteOrders(ids);
    toast(t('toast_deleted'), 'success');
    _ordPage = 1;
    loadOrders();
  } catch (e) { toast(e.message, 'error'); }
});

window.deleteOrder = async (id) => {
  if (!confirm(t('err_del_order'))) return;
  try {
    await api.deleteOrder(id); toast(t('toast_deleted'), 'success'); loadOrders();
  } catch (e) { toast(e.message, 'error'); }
};

$('btnNewOrder').addEventListener('click', async () => {
  $('orderForm').style.display = 'block';
  await populateOrderDropdowns();
});
$('btnOrderCancel').addEventListener('click', () => { $('orderForm').style.display = 'none'; });

async function populateOrderDropdowns() {
  const [clients, products] = await Promise.all([api.getClients(), api.getProducts()]);
  $('orderClient').innerHTML  = clients.map(c  => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('orderProduct').innerHTML = products.map(p => `<option value="${p.id}">${esc(p.name)} – €${fmt(parseFloat(p.price))}</option>`).join('');
}

$('btnOrderSubmit').addEventListener('click', async () => {
  const data = {
    client_id:  parseInt($('orderClient').value),
    product_id: parseInt($('orderProduct').value),
    quantity:   parseInt($('orderQty').value),
  };
  if (!data.quantity || data.quantity < 1) return toast(t('toast_invalid_qty'), 'error');
  try {
    await api.createOrder(data);
    toast(t('toast_order_created'), 'success');
    $('orderForm').style.display = 'none';
    _ordPage = 1;
    loadOrders();
  } catch (e) { toast(e.message, 'error'); }
});

// ── CSV Import helper ─────────────────────────────────────────────────────────
function setupCsvImport({ btnId, fileId, dropId, resultId, selectBtnId, apiFn, reloadFn }) {
  const btn    = $(btnId);
  const input  = $(fileId);
  const drop   = $(dropId);
  const result = $(resultId);
  const selectBtn = selectBtnId ? $(selectBtnId) : null;

  const doImport = async (file) => {
    if (!file || !file.name.endsWith('.csv')) return toast('Cal seleccionar un fitxer .csv', 'error');
    drop.classList.add('csv-dropzone--loading');
    result.style.display = 'none';
    try {
      const res = await apiFn(file);
      const errHtml = res.errors?.length
        ? `<ul class="csv-errors">${res.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
      result.innerHTML = `
        <span class="csv-stat csv-stat--ok">✓ ${res.inserted} inserits</span>
        <span class="csv-stat csv-stat--skip">⤼ ${res.skipped} ja existents</span>
        ${res.errors?.length ? `<span class="csv-stat csv-stat--err">✗ ${res.errors.length} errors</span>` : ''}
        ${errHtml}`;
      result.style.display = 'flex';
      if (res.inserted > 0) { reloadFn(); toast(`${res.inserted} registres importats`, 'success'); }
      else toast('Cap registre nou importat', 'info');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      drop.classList.remove('csv-dropzone--loading');
      input.value = '';
    }
  };

  btn.addEventListener('click', () => {
    const visible = drop.style.display !== 'none';
    drop.style.display = visible ? 'none' : '';
  });
  if (selectBtn) selectBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => doImport(input.files[0]));

  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.style.display = ''; drop.classList.add('csv-dropzone--over'); });
  drop.addEventListener('dragleave', ()  => drop.classList.remove('csv-dropzone--over'));
  drop.addEventListener('drop',      e => {
    e.preventDefault();
    drop.classList.remove('csv-dropzone--over');
    doImport(e.dataTransfer.files[0]);
  });
}

// ── Clients ───────────────────────────────────────────────────────────────────
function _updateClientSelection() {
  const all     = $('clientsBody').querySelectorAll('.client-check');
  const checked = $('clientsBody').querySelectorAll('.client-check:checked');
  const n = checked.length;
  $('checkAllClients').checked       = n > 0 && n === all.length;
  $('checkAllClients').indeterminate = n > 0 && n < all.length;
  const btn = $('btnDeleteSelectedClients');
  btn.style.display = n > 0 ? '' : 'none';
  if (n > 0) btn.textContent = `${t('btn_delete_selected')} (${n})`;
}

$('checkAllClients').addEventListener('change', e => {
  $('clientsBody').querySelectorAll('.client-check').forEach(cb => {
    cb.checked = e.target.checked;
    cb.closest('tr').classList.toggle('row-selected', e.target.checked);
  });
  _updateClientSelection();
});

$('btnDeleteSelectedClients').addEventListener('click', async () => {
  const ids = [...$('clientsBody').querySelectorAll('.client-check:checked')].map(cb => +cb.value);
  if (!ids.length) return;
  if (!confirm(t('delete_clients_confirm'))) return;
  try {
    await api.deleteClients(ids);
    toast(t('toast_deleted'), 'success');
    loadClients();
  } catch (e) { toast(e.message, 'error'); }
});

async function loadClients() {
  try {
    const clients = await api.getClients();
    const ncc = $('navCountClients'); if (ncc) ncc.textContent = clients.length;
    $('checkAllClients').checked = false;
    $('checkAllClients').indeterminate = false;
    $('btnDeleteSelectedClients').style.display = 'none';
    $('clientsBody').innerHTML = clients.map(c => `
      <tr>
        <td class="col-check"><input type="checkbox" class="client-check" value="${c.id}" /></td>
        <td><span class="badge">#${c.id}</span></td>
        <td>${esc(c.name)}</td>
        <td>${esc(c.email)}</td>
        <td>${fmtDate(c.created_at)}</td>
        <td><div class="td-actions">
          <button class="btn btn-edit"   onclick="editClient(${c.id},'${esc(c.name)}','${esc(c.email)}')">${t('btn_edit')}</button>
          <button class="btn btn-danger" onclick="deleteClient(${c.id})">✕</button>
        </div></td>
      </tr>`
    ).join('');
    $('clientsBody').querySelectorAll('.client-check').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('tr').classList.toggle('row-selected', cb.checked);
        _updateClientSelection();
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}

setupCsvImport({
  btnId: 'btnImportClients', fileId: 'fileClients',
  dropId: 'dropClients',     resultId: 'csvResultClients',
  selectBtnId: 'btnSelectFileClients',
  apiFn: f => api.importClients(f),
  reloadFn: loadClients,
});

$('btnNewClient').addEventListener('click', () => {
  $('clientFormTitle').textContent = t('form_client_new');
  $('clientId').value = ''; $('clientName').value = ''; $('clientEmail').value = '';
  $('clientForm').style.display = 'block';
});
$('btnClientCancel').addEventListener('click', () => { $('clientForm').style.display = 'none'; });

window.editClient = (id, name, email) => {
  $('clientFormTitle').textContent = t('form_client_edit');
  $('clientId').value = id; $('clientName').value = name; $('clientEmail').value = email;
  $('clientForm').style.display = 'block';
  $('clientForm').scrollIntoView({ behavior: 'smooth' });
};

$('btnClientSubmit').addEventListener('click', async () => {
  const id    = $('clientId').value;
  const name  = $('clientName').value.trim();
  const email = $('clientEmail').value.trim();
  if (!name || !email) return toast(t('toast_name_email_req'), 'error');
  try {
    if (id) await api.updateClient(parseInt(id), { name, email });
    else    await api.createClient({ name, email });
    toast(t('toast_saved'), 'success');
    $('clientForm').style.display = 'none';
    loadClients();
  } catch (e) { toast(e.message, 'error'); }
});

window.deleteClient = async (id) => {
  if (!confirm(t('err_del_client'))) return;
  try {
    await api.deleteClient(id); toast(t('toast_deleted'), 'success'); loadClients();
  } catch (e) { toast(e.message, 'error'); }
};

// ── Products ──────────────────────────────────────────────────────────────────
function _updateProductSelection() {
  const all     = $('productsBody').querySelectorAll('.product-check');
  const checked = $('productsBody').querySelectorAll('.product-check:checked');
  const n = checked.length;
  $('checkAllProducts').checked       = n > 0 && n === all.length;
  $('checkAllProducts').indeterminate = n > 0 && n < all.length;
  const btn = $('btnDeleteSelectedProducts');
  btn.style.display = n > 0 ? '' : 'none';
  if (n > 0) btn.textContent = `${t('btn_delete_selected')} (${n})`;
}

$('checkAllProducts').addEventListener('change', e => {
  $('productsBody').querySelectorAll('.product-check').forEach(cb => {
    cb.checked = e.target.checked;
    cb.closest('tr').classList.toggle('row-selected', e.target.checked);
  });
  _updateProductSelection();
});

$('btnDeleteSelectedProducts').addEventListener('click', async () => {
  const ids = [...$('productsBody').querySelectorAll('.product-check:checked')].map(cb => +cb.value);
  if (!ids.length) return;
  if (!confirm(t('delete_products_confirm'))) return;
  try {
    await api.deleteProducts(ids);
    toast(t('toast_deleted'), 'success');
    loadProducts();
  } catch (e) { toast(e.message, 'error'); }
});

async function loadProducts() {
  try {
    const products = await api.getProducts();
    const ncp = $('navCountProducts'); if (ncp) ncp.textContent = products.length;
    $('checkAllProducts').checked = false;
    $('checkAllProducts').indeterminate = false;
    $('btnDeleteSelectedProducts').style.display = 'none';
    $('productsBody').innerHTML = products.map(p => `
      <tr>
        <td class="col-check"><input type="checkbox" class="product-check" value="${p.id}" /></td>
        <td><span class="badge">#${p.id}</span></td>
        <td>${esc(p.name)}</td>
        <td><strong>€${fmt(parseFloat(p.price))}</strong></td>
        <td>${fmtDate(p.created_at)}</td>
        <td><div class="td-actions">
          <button class="btn btn-edit"   onclick="editProduct(${p.id},'${esc(p.name)}',${p.price})">${t('btn_edit')}</button>
          <button class="btn btn-danger" onclick="deleteProduct(${p.id})">✕</button>
        </div></td>
      </tr>`
    ).join('');
    $('productsBody').querySelectorAll('.product-check').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('tr').classList.toggle('row-selected', cb.checked);
        _updateProductSelection();
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}

setupCsvImport({
  btnId: 'btnImportProducts', fileId: 'fileProducts',
  dropId: 'dropProducts',     resultId: 'csvResultProducts',
  selectBtnId: 'btnSelectFileProducts',
  apiFn: f => api.importProducts(f),
  reloadFn: loadProducts,
});

$('btnNewProduct').addEventListener('click', () => {
  $('productFormTitle').textContent = t('form_product_new');
  $('productId').value = ''; $('productName').value = ''; $('productPrice').value = '';
  $('productForm').style.display = 'block';
});
$('btnProductCancel').addEventListener('click', () => { $('productForm').style.display = 'none'; });

window.editProduct = (id, name, price) => {
  $('productFormTitle').textContent = t('form_product_edit');
  $('productId').value = id; $('productName').value = name; $('productPrice').value = price;
  $('productForm').style.display = 'block';
  $('productForm').scrollIntoView({ behavior: 'smooth' });
};

$('btnProductSubmit').addEventListener('click', async () => {
  const id    = $('productId').value;
  const name  = $('productName').value.trim();
  const price = parseFloat($('productPrice').value);
  if (!name || isNaN(price) || price < 0) return toast(t('toast_name_price_req'), 'error');
  try {
    if (id) await api.updateProduct(parseInt(id), { name, price });
    else    await api.createProduct({ name, price });
    toast(t('toast_saved'), 'success');
    $('productForm').style.display = 'none';
    loadProducts();
  } catch (e) { toast(e.message, 'error'); }
});

window.deleteProduct = async (id) => {
  if (!confirm(t('err_del_product'))) return;
  try {
    await api.deleteProduct(id); toast(t('toast_deleted'), 'success'); loadProducts();
  } catch (e) { toast(e.message, 'error'); }
};

// ── Users ─────────────────────────────────────────────────────────────────
let _editingUserId = null;

async function loadUsers() {
  try {
    const users = await api.getUsers();
    const nc = $('navCountUsers');
    if (nc) nc.textContent = users.length;
    const tbody = $('usersBody');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${u.username}</strong></td>
        <td><span class="role-badge ${u.is_admin ? 'role-badge--admin' : 'role-badge--user'}">${u.is_admin ? t('role_admin') : t('role_user')}</span></td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>
        <td><div class="td-actions">
          <button class="btn btn-edit btn-sm" onclick="openUserForm(${u.id})">${t('btn_edit')}</button>
          ${u.id !== (_currentUser && _currentUser.id) ? `<button class="btn btn-danger btn-sm" onclick="deleteUserById(${u.id}, '${u.username}')">${t('btn_delete')}</button>` : ''}
        </div></td>
      </tr>`).join('');
  } catch (e) { console.error(e); }
}

function openUserForm(userId = null) {
  _editingUserId = userId;
  const form = $('userForm');
  const title = $('userFormTitle');
  const ufUsername = $('ufUsername');
  const ufPassword = $('ufPassword');
  const ufIsAdmin = $('ufIsAdmin');
  if (!form) return;

  if (userId) {
    title.textContent = t('users_form_edit');
    // find user from table — just clear fields
    ufUsername.disabled = true;
    ufPassword.placeholder = t('users_pass_hint');
    ufPassword.value = '';
    // get username from row
    const rows = document.querySelectorAll('#usersBody tr');
    rows.forEach(row => {
      // try to match by edit button onclick
      const btn = row.querySelector(`button[onclick="openUserForm(${userId})"]`);
      if (btn) {
        ufUsername.value = row.cells[0].querySelector('strong').textContent;
        ufIsAdmin.checked = row.cells[1].querySelector('.role-badge').classList.contains('role-badge--admin');
      }
    });
  } else {
    title.textContent = t('users_form_add');
    ufUsername.disabled = false;
    ufUsername.value = '';
    ufPassword.value = '';
    ufPassword.placeholder = '';
    ufIsAdmin.checked = false;
  }
  form.style.display = '';
  ufUsername.focus();
}

async function deleteUserById(id, username) {
  if (!confirm(t('users_del_confirm').replace('%s', username))) return;
  try {
    await api.deleteUser(id);
    loadUsers();
  } catch (e) { toast(e.message, 'error'); }
}

// Wire up user form buttons in DOMContentLoaded or after DOM is ready:
function setupUserForm() {
  const btnNew = $('btnNewUser');
  if (btnNew) btnNew.addEventListener('click', () => openUserForm(null));

  const btnSave = $('btnSaveUser');
  if (btnSave) btnSave.addEventListener('click', async () => {
    const username = $('ufUsername').value.trim();
    const password = $('ufPassword').value;
    const is_admin = $('ufIsAdmin').checked;
    try {
      if (_editingUserId) {
        const upd = { is_admin };
        if (password) upd.password = password;
        await api.updateUser(_editingUserId, upd);
      } else {
        if (!username || !password) { toast('Usuari i contrasenya obligatoris', 'error'); return; }
        await api.createUser({ username, password, is_admin });
      }
      $('userForm').style.display = 'none';
      loadUsers();
    } catch (e) { toast(e.message, 'error'); }
  });

  const btnCancel = $('btnCancelUser');
  if (btnCancel) btnCancel.addEventListener('click', () => { $('userForm').style.display = 'none'; });
}

window.openUserForm = openUserForm;
window.deleteUserById = deleteUserById;
