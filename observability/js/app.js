// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = n => Number(n).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  let collapsed = localStorage.getItem('obs-sidebar-collapsed') === '1';

  function apply(animate) {
    if (!animate) sidebar.style.transition = 'none';
    sidebar.classList.toggle('collapsed', collapsed);
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '60px' : '248px');
    const btn = document.getElementById('btnSidebarToggle');
    if (btn) { btn.textContent = collapsed ? '›' : '‹'; btn.title = collapsed ? 'Expandir' : 'Compactar'; }
    if (!animate) requestAnimationFrame(() => { sidebar.style.transition = ''; });
  }

  apply(false);

  document.getElementById('btnSidebarToggle').addEventListener('click', () => {
    collapsed = !collapsed;
    localStorage.setItem('obs-sidebar-collapsed', collapsed ? '1' : '0');
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
  const textColor = theme === 'dark' ? '#8892a4' : '#64748b';
  const gridColor = theme === 'dark' ? '#2a2a5044' : '#d1d9e688';
  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = gridColor;
  [chartTimeline, chartCumulative, chartProductQty, chartProductRev,
   chartDaily, chartHourly].forEach(c => c.update());
}

applyTheme(_theme);
$('btnTheme').addEventListener('click', () => applyTheme(_theme === 'dark' ? 'light' : 'dark'));

// ── Language ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => setLang(btn.dataset.lang));
});

// ── TRP (Time Range Picker) ───────────────────────────────────────────────────
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

const dashTRP = makeTRP({
  wrapper:     'trpWrapper',
  panel:       'trpPanel',
  triggerBtn:  'btnTimeRange',
  label:       'timeRangeLabel',
  presets:     'trpPresets',
  startInput:  'filterStart',
  endInput:    'filterEnd',
  applyBtn:    'btnApplyFilter',
  allBtn:      'btnRangeAll',
  badge:       'liveBadge',
  liveHint:    'trpLiveHint',
}, () => refreshDashboard({ skipCache: true }));

// Hook called by i18n.js on every language change
function onLangChanged() {
  dashTRP.renderPresets();
}

// Apply static HTML translations
applyTranslations();

// ── Filter + refresh ──────────────────────────────────────────────────────────
function initFilter() { dashTRP.init(); }

let _refreshMs = 5000;
let _refreshTimer = null;

function startRefreshTimer() {
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(refreshDashboard, _refreshMs);
}

$('selectRefresh').addEventListener('change', () => {
  _refreshMs = parseInt($('selectRefresh').value, 10);
  startRefreshTimer();
});

// ── Dashboard cache ───────────────────────────────────────────────────────────
const CACHE_KEY = 'obs_dashboard_cache';
let _cacheTs    = null;   // timestamp of last known good data (live or cached)
let _fromCache  = false;  // true when currently showing stale data
let _noData     = false;  // true when there is no data at all (no cache, no live)

function _saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

function _loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function _elapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// Called every second — keeps the "cached · Xs ago" text ticking
function _updateCacheBadge() {
  const el = $('cacheBadge');
  if (!el) return;
  if (!_fromCache || !_cacheTs) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = `📦 cached · ${_elapsed(Date.now() - _cacheTs)}`;
  el.title = `Última càrrega: ${new Date(_cacheTs).toLocaleTimeString()}`;
}

setInterval(_updateCacheBadge, 1000);

function _renderDashboardData(summary, tl, products, daily, hourly) {
  _noData = false;
  ['statOrders','statRevenue','statAvgOrders','statAvgRev','statLastOrder'].forEach(id => {
    const el = $(id); if (el) el.style.color = '';
  });
  $('statOrders').textContent    = summary.total_orders.toLocaleString();
  $('statRevenue').textContent   = '€' + fmt(summary.total_revenue);
  $('statAvgOrders').textContent = summary.avg_orders_per_day?.toLocaleString() ?? '–';
  $('statAvgRev').textContent    = summary.avg_revenue_per_day != null
    ? '€' + fmt(summary.avg_revenue_per_day) : '–';
  _lastOrderAt = summary.last_order_at ? new Date(summary.last_order_at) : null;
  _updateLastOrderStat();
  const tlData = tl.data ?? tl;
  const tlGran = tl.granularity ?? 'minute';
  updateTimeline(tlData, tlGran);
  updateCumulative(tlData, tlGran);
  syncTimelineAxes();
  updateProductCharts(products);
  updateDailyChart(daily);
  updateHourlyChart(hourly);
}

function _renderNoData() {
  _noData = true;
  _lastOrderAt = null;
  ['statOrders', 'statRevenue', 'statAvgOrders', 'statAvgRev', 'statLastOrder'].forEach(id => {
    const el = $(id);
    if (el) { el.textContent = 'No data'; el.style.color = 'var(--text-muted)'; }
  });
}

// ── Dashboard polling ─────────────────────────────────────────────────────────
// opts.skipCache = true → on failure show "No data" instead of stale cache
//   (used when the user explicitly changes the time range)
async function refreshDashboard(opts = {}) {
  try {
    const p = dashTRP.params();
    const [summary, tl, products, daily, hourly] = await Promise.all([
      api.summary(p), api.timeline(p), api.productStats(p),
      api.dailyStats(p), api.hourlyStats(p),
    ]);
    _saveCache({ summary, tl, products, daily, hourly });
    _cacheTs   = Date.now();
    _fromCache = false;
    _renderDashboardData(summary, tl, products, daily, hourly);
    _updateCacheBadge();
  } catch {
    const cached = opts.skipCache ? null : _loadCache();
    if (cached) {
      _cacheTs   = cached.ts;
      _fromCache = true;
      const { summary, tl, products, daily, hourly } = cached.data;
      _renderDashboardData(summary, tl, products, daily, hourly);
    } else {
      _fromCache = false;
      _renderNoData();
    }
    _updateCacheBadge();
  }
}

// ── Última ordre ──────────────────────────────────────────────────────────────
let _lastOrderAt = null;

function _timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s <  60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min ${s % 60}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}min`;
}

function _updateLastOrderStat() {
  const el = $('statLastOrder');
  if (!el) return;
  if (_noData)       { el.textContent = 'No data'; el.style.color = 'var(--text-muted)'; return; }
  if (!_lastOrderAt) { el.textContent = '–'; el.style.color = ''; return; }
  // Use a fixed genMax reference of 60s since we don't have the control here
  const s = Math.floor((Date.now() - _lastOrderAt.getTime()) / 1000);
  const genMaxSec = 60;
  el.textContent = _timeAgo(_lastOrderAt);
  if (s < genMaxSec)          el.style.color = 'var(--success)';
  else if (s < genMaxSec * 4) el.style.color = 'var(--warning)';
  else                         el.style.color = 'var(--danger)';
}

setInterval(_updateLastOrderStat, 1000);

// ── Infra status ──────────────────────────────────────────────────────────────
function _setBadge(id, state, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `infra-test-badge infra-test-badge--${state}`;
}
function _setDot(id, state) {
  const el = $(id);
  if (el) el.className = `infra-dot infra-dot--${state}`;
}

// fetch amb timeout curt per detectar serveis caiguts ràpidament
function _fetchT(url, opts = {}, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' })
    .finally(() => clearTimeout(tid));
}

async function checkInfraStatus() {
  const upd = $('infraUpdated');
  if (upd) upd.textContent = t('status_checked') + ' ' + new Date().toLocaleTimeString();

  // ── Els tres serveis es comproven en paral·lel ────────────────────────────
  await Promise.all([

    // ── Frontend ─────────────────────────────────────────────────────────────
    (async () => {
      let feDot = 'ok';
      await Promise.all([
        // Ping HEAD
        (async () => {
          const t0 = performance.now();
          try {
            const r = await _fetchT('/check/frontend/', { method: 'HEAD' });
            _setBadge('tFePing', r.ok ? 'ok' : 'warn', `HTTP ${r.status} · ${Math.round(performance.now()-t0)}ms`);
            if (!r.ok) feDot = 'warn';
          } catch { _setBadge('tFePing', 'err', t('status_error')); feDot = 'err'; }
        })(),
        // Static asset
        (async () => {
          const t0 = performance.now();
          try {
            const r = await _fetchT('/check/frontend/css/style.css', { method: 'HEAD' });
            _setBadge('tFe0', r.ok ? 'ok' : 'warn', `HTTP ${r.status} · ${Math.round(performance.now()-t0)}ms`);
            if (!r.ok && feDot === 'ok') feDot = 'warn';
          } catch { _setBadge('tFe0', 'err', t('status_error')); feDot = 'err'; }
        })(),
        // HTML
        (async () => {
          const t0 = performance.now();
          try {
            const r = await _fetchT('/check/frontend/');
            const ok = r.ok && (r.headers.get('content-type') || '').includes('html');
            _setBadge('tFe1', ok ? 'ok' : 'warn', `HTTP ${r.status} · ${Math.round(performance.now()-t0)}ms`);
            if (!ok && feDot === 'ok') feDot = 'warn';
          } catch { _setBadge('tFe1', 'err', t('status_error')); feDot = 'err'; }
        })(),
      ]);
      _setDot('dotFrontend', feDot);
    })(),

    // ── Backend ───────────────────────────────────────────────────────────────
    (async () => {
      let beDot = 'ok';
      // Ping i genStatus en paral·lel; pong depèn del ping
      const [pingResult, genResult] = await Promise.all([
        (async () => {
          const t0 = performance.now();
          try {
            const r = await _fetchT('/api/ping');
            const ms = Math.round(performance.now()-t0);
            const data = await r.json().catch(() => null);
            _setBadge('tBePing', r.ok ? 'ok' : 'warn', `HTTP ${r.status} · ${ms}ms`);
            if (!r.ok) beDot = 'warn';
            return data;
          } catch { _setBadge('tBePing', 'err', t('status_error')); beDot = 'err'; return null; }
        })(),
        (async () => {
          const t0 = performance.now();
          try {
            await _fetchT('/api/generator/status');
            _setBadge('tBe1', 'ok', `HTTP 200 · ${Math.round(performance.now()-t0)}ms`);
            return true;
          } catch { _setBadge('tBe1', 'warn', t('status_error')); return false; }
        })(),
      ]);
      // Functional pong (sincròn, usa el resultat del ping)
      if (pingResult !== null) {
        const ok = pingResult?.pong === true;
        _setBadge('tBe0', ok ? 'ok' : 'warn', ok ? `pong ✓` : t('status_error'));
        if (!ok && beDot === 'ok') beDot = 'warn';
      } else {
        _setBadge('tBe0', 'err', t('status_error')); beDot = 'err';
      }
      if (!genResult && beDot === 'ok') beDot = 'warn';
      _setDot('dotBackend', beDot);
    })(),

    // ── Database ──────────────────────────────────────────────────────────────
    (async () => {
      let dbDot = 'ok';
      const t0 = performance.now();
      let dbData = null;
      try {
        const r = await _fetchT('/check/db/db/ping');
        const ms = Math.round(performance.now()-t0);
        dbData = await r.json().catch(() => null);
        _setBadge('tDbPing', r.ok ? 'ok' : 'err', `HTTP ${r.status} · ${ms}ms`);
        if (!r.ok) dbDot = 'err';
      } catch { _setBadge('tDbPing', 'err', t('status_error')); dbDot = 'err'; }

      if (dbData?.status === 'ok') {
        _setBadge('tDb0', 'ok', `${t('status_online')} · ${dbData.tcp_ms ?? '?'}ms`);
        _setBadge('tDb1', 'ok', `ok · ${dbData.sql_ms ?? '?'}ms`);
      } else {
        _setBadge('tDb0', 'err', t('status_unreachable')); dbDot = 'err';
        _setBadge('tDb1', 'err', t('status_error'));        dbDot = 'err';
      }
      _setDot('dotDatabase', dbDot);
    })(),

  ]);
}

// ── Digital clock ─────────────────────────────────────────────────────────────
(function () {
  const el = $('digitalClock');
  if (!el) return;
  function _tick() {
    const now = new Date();
    const p   = n => String(n).padStart(2, '0');
    const hms = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    const dmy = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${String(now.getFullYear()).slice(-2)}`;
    el.textContent = `${hms}  ${dmy}`;
  }
  _tick();
  setInterval(_tick, 1000);
})();

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initFilter();
  refreshDashboard();
  startRefreshTimer();
  const INFRA_INTERVAL_MS = 5000;
  const badge = $('infraRefreshBadge');
  if (badge) badge.textContent = `↻ ${INFRA_INTERVAL_MS / 1000}s`;
  checkInfraStatus();
  setInterval(checkInfraStatus, INFRA_INTERVAL_MS);
});
