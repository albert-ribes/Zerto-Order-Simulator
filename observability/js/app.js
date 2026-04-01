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

// ── Tab navigation ────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    const section = document.getElementById('tab-' + tab);
    if (section) section.classList.add('active');
  });
});

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
   chartDaily, chartHourly].forEach(c => c?.update());
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

function onLangChanged() {
  dashTRP.renderPresets();
}

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
let _cacheTs    = null;
let _fromCache  = false;
let _noData     = false;

function _saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

function _loadCache() {
  try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function _elapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

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
  _lastOrderId = summary.last_order_id ?? null;
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
  _lastOrderId = null;
  ['statOrders', 'statRevenue', 'statAvgOrders', 'statAvgRev', 'statLastOrder'].forEach(id => {
    const el = $(id);
    if (el) { el.textContent = 'No data'; el.style.color = 'var(--text-muted)'; }
  });
}

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
let _lastOrderId = null;

function _timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s <  60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min ${s % 60}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}min`;
}

function _updateLastOrderStat() {
  const el   = $('statLastOrder');
  const elId = $('statLastOrderId');
  const elTs = $('statLastOrderTs');
  if (!el) return;

  if (_noData) {
    el.textContent = 'No data'; el.style.color = 'var(--text-muted)';
    if (elId) elId.textContent = '–';
    if (elTs) elTs.textContent = '';
    return;
  }
  if (!_lastOrderAt) {
    el.textContent = '–'; el.style.color = '';
    if (elId) elId.textContent = '–';
    if (elTs) elTs.textContent = '';
    return;
  }

  const s = Math.floor((Date.now() - _lastOrderAt.getTime()) / 1000);
  const genMaxSec = 60;
  el.textContent = _timeAgo(_lastOrderAt);
  if (s < genMaxSec)          el.style.color = 'var(--success)';
  else if (s < genMaxSec * 4) el.style.color = 'var(--warning)';
  else                         el.style.color = 'var(--danger)';

  if (elId) elId.textContent = _lastOrderId ? `#${_lastOrderId}` : '';
  if (elTs) {
    const p = n => String(n).padStart(2, '0');
    const d = _lastOrderAt;
    elTs.textContent = `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
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

function _fetchT(url, opts = {}, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' })
    .finally(() => clearTimeout(tid));
}

async function checkInfraStatus() {
  const upd = $('infraUpdated');
  if (upd) upd.textContent = t('status_checked') + ' ' + new Date().toLocaleTimeString();

  await Promise.all([

    (async () => {
      let feDot = 'ok';
      await Promise.all([
        (async () => {
          const t0 = performance.now();
          try {
            const r = await _fetchT('/check/frontend/', { method: 'HEAD' });
            const ms = Math.round(performance.now()-t0);
            _setBadge('tFePing', r.ok ? 'ok' : 'warn', `HTTP ${r.status} · ${ms}ms`);
            if (!r.ok) feDot = 'warn';
          } catch {
            _setBadge('tFePing', 'err', t('status_error'));
            feDot = 'err';
          }
        })(),
        (async () => {
          const t0 = performance.now();
          try {
            const r = await _fetchT('/check/frontend/css/style.css', { method: 'HEAD' });
            _setBadge('tFe0', r.ok ? 'ok' : 'warn', `HTTP ${r.status} · ${Math.round(performance.now()-t0)}ms`);
            if (!r.ok && feDot === 'ok') feDot = 'warn';
          } catch {
            _setBadge('tFe0', 'err', t('status_error'));
            feDot = 'err';
          }
        })(),
        (async () => {
          const t0 = performance.now();
          try {
            const r = await _fetchT('/check/frontend/');
            const ok = r.ok && (r.headers.get('content-type') || '').includes('html');
            _setBadge('tFe1', ok ? 'ok' : 'warn', `HTTP ${r.status} · ${Math.round(performance.now()-t0)}ms`);
            if (!ok && feDot === 'ok') feDot = 'warn';
          } catch {
            _setBadge('tFe1', 'err', t('status_error'));
            feDot = 'err';
          }
        })(),
      ]);
      _setDot('dotFrontend', feDot);
    })(),

    (async () => {
      let beDot = 'ok';
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

// ── System metrics ────────────────────────────────────────────────────────────
function _fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function _setBar(id, pct, invert = false) {
  const el = $(id);
  if (!el) return;
  const p = Math.min(100, Math.max(0, pct));
  el.style.width = p + '%';
  const isHigh = p > 80, isMid = p > 60;
  el.className = 'sys-metric-bar ' + (
    invert
      ? (isHigh ? 'bar--good' : isMid ? 'bar--warn' : 'bar--bad')
      : (isHigh ? 'bar--bad'  : isMid ? 'bar--warn' : 'bar--good')
  );
}

async function checkSystemMetrics() {
  await Promise.all([

    // Frontend sys-probe metrics
    (async () => {
      try {
        const r = await _fetchT('/check/frontend-sys/sys/metrics', {}, 5000);
        if (r.ok) {
          const d = await r.json();
          if (d.status === 'ok') {
            _setBar('sysFeBarCpu', d.cpu_percent);
            if ($('sysFeCpu'))    $('sysFeCpu').textContent    = d.cpu_percent + '%';
            _setBar('sysFeBarMem', d.mem_percent);
            if ($('sysFeMem'))    $('sysFeMem').textContent    = `${d.mem_used_mb.toLocaleString()} / ${d.mem_total_mb.toLocaleString()} MB (${d.mem_percent}%)`;
            _setBar('sysFeBarDisk', d.disk_percent);
            if ($('sysFeDisk'))   $('sysFeDisk').textContent   = `${d.disk_used_gb} / ${d.disk_total_gb} GB (${d.disk_percent}%)`;
            if ($('sysFeUptime')) $('sysFeUptime').textContent = _fmtUptime(d.uptime_s);
            _setDot('sysDotFrontend', d.cpu_percent > 90 || d.mem_percent > 90 || d.disk_percent > 90 ? 'warn' : 'ok');
          } else {
            _setDot('sysDotFrontend', 'err');
          }
        } else {
          _setDot('sysDotFrontend', 'err');
        }
      } catch {
        _setDot('sysDotFrontend', 'err');
      }
    })(),

    // Backend metrics
    (async () => {
      try {
        const r = await _fetchT('/api/system/metrics', {}, 5000);
        if (r.ok) {
          const d = await r.json();
          _setBar('sysBeBarCpu', d.cpu_percent);
          if ($('sysBeCpu'))    $('sysBeCpu').textContent    = d.cpu_percent + '%';
          _setBar('sysBeBarMem', d.mem_percent);
          if ($('sysBeMem'))    $('sysBeMem').textContent    = `${d.mem_used_mb.toLocaleString()} / ${d.mem_total_mb.toLocaleString()} MB (${d.mem_percent}%)`;
          _setBar('sysBeBarDisk', d.disk_percent);
          if ($('sysBeDisk'))   $('sysBeDisk').textContent   = `${d.disk_used_gb} / ${d.disk_total_gb} GB (${d.disk_percent}%)`;
          if ($('sysBeUptime')) $('sysBeUptime').textContent = _fmtUptime(d.uptime_s);
          _setDot('sysDotBackend', d.cpu_percent > 90 || d.mem_percent > 90 || d.disk_percent > 90 ? 'warn' : 'ok');
        } else {
          _setDot('sysDotBackend', 'err');
        }
      } catch {
        _setDot('sysDotBackend', 'err');
      }
    })(),

    // Database sys-probe metrics
    (async () => {
      try {
        const r = await _fetchT('/check/db-sys/sys/metrics', {}, 5000);
        if (r.ok) {
          const d = await r.json();
          if (d.status === 'ok') {
            _setBar('sysDbBarCpu', d.cpu_percent);
            if ($('sysDbCpu'))    $('sysDbCpu').textContent    = d.cpu_percent + '%';
            _setBar('sysDbBarMem', d.mem_percent);
            if ($('sysDbMem'))    $('sysDbMem').textContent    = `${d.mem_used_mb.toLocaleString()} / ${d.mem_total_mb.toLocaleString()} MB (${d.mem_percent}%)`;
            _setBar('sysDbBarDisk', d.disk_percent);
            if ($('sysDbDisk'))   $('sysDbDisk').textContent   = `${d.disk_used_gb} / ${d.disk_total_gb} GB (${d.disk_percent}%)`;
            if ($('sysDbUptime')) $('sysDbUptime').textContent = _fmtUptime(d.uptime_s);
          }
        }
      } catch { /* sys-probe errors handled silently; dot updated by db/metrics below */ }
    })(),

    // Database probe metrics (PostgreSQL stats)
    (async () => {
      try {
        const r = await _fetchT('/check/db/db/metrics', {}, 5000);
        if (r.ok) {
          const d = await r.json();
          if (d.status === 'ok') {
            _setBar('sysDbBarConn', d.connections_percent);
            if ($('sysDbConn'))   $('sysDbConn').textContent   = `${d.total_connections} / ${d.max_connections} (${d.connections_percent}%)`;
            if ($('sysDbActive')) $('sysDbActive').textContent = d.active_connections;
            if ($('sysDbSize'))   $('sysDbSize').textContent   = `${d.db_size_mb} MB`;
            if (d.cache_hit_ratio !== null) {
              _setBar('sysDbBarCache', d.cache_hit_ratio, true);
              if ($('sysDbCache')) $('sysDbCache').textContent = d.cache_hit_ratio + '%';
            }
            if ($('sysDbTx') && d.transactions !== null)
              $('sysDbTx').textContent = d.transactions.toLocaleString();
            _setDot('sysDotDb', d.connections_percent > 80 ? 'warn' : 'ok');
          } else {
            _setDot('sysDotDb', 'err');
          }
        } else {
          _setDot('sysDotDb', 'err');
        }
      } catch {
        _setDot('sysDotDb', 'err');
      }
    })(),

  ]);
}

// ── Zerto ─────────────────────────────────────────────────────────────────────
function _fmtRPO(s) {
  if (s == null) return '–';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}
function _fmtDuration(minutes) {
  if (minutes == null) return '–';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const _VPG_STATUS_CLS = { 1:'zerto-status-ok', 2:'zerto-status-err', 3:'zerto-status-err',
                           4:'zerto-status-warn', 5:'zerto-status-warn', 6:'zerto-status-warn',
                           7:'zerto-status-warn', 8:'zerto-status-ok' };

async function checkZerto() {
  try {
    const r = await _fetchT('/check/zerto/zerto/data', {}, 20000);
    if (!r.ok) return;
    const d = await r.json();

    // Meta
    const metaEl = $('zertoMeta');
    if (metaEl && d.ts) {
      const ts = new Date(d.ts * 1000);
      metaEl.textContent = `${d.vpg_name} · ${ts.toLocaleTimeString()}`;
    }

    // Ransomware
    const banner = $('zertoRansomwareBanner');
    if (banner) banner.classList.toggle('hidden', !d.ransomware);

    // ZVM dots
    for (const zvm of (d.zvms || [])) {
      const key  = zvm.id === 'tec' ? 'Tec' : 'Recovery';
      const dot  = $(`zvmDot${key}`);
      const err  = $(`zvmErr${key}`);
      if (dot) _setDot(dot.id, zvm.status === 'ok' ? 'ok' : 'err');
      if (err) err.textContent = zvm.error ? `(${zvm.error.slice(0, 80)})` : '';
    }

    const zvmWithVpg = (d.zvms || []).find(z => z.vpg);
    if (!zvmWithVpg) return;
    const vpg = zvmWithVpg.vpg;

    // VPG Status
    const stEl = $('zertoVpgStatus');
    if (stEl) {
      stEl.textContent = vpg.status_desc || '–';
      stEl.className   = 'zerto-stat-value ' + (_VPG_STATUS_CLS[vpg.status] || '');
    }
    const subEl = $('zertoVpgSub');
    if (subEl) subEl.textContent = (vpg.sub_status_desc && vpg.sub_status_desc !== 'None')
      ? vpg.sub_status_desc : `${vpg.source_site} → ${vpg.target_site}`;

    // RPO
    const rpoEl = $('zertoRpoActual');
    if (rpoEl) {
      rpoEl.textContent = _fmtRPO(vpg.rpo_actual_s);
      const pct = vpg.rpo_config_s > 0 ? vpg.rpo_actual_s / vpg.rpo_config_s : 0;
      rpoEl.className = 'zerto-stat-value ' + (pct < 0.5 ? 'zerto-status-ok' : pct < 1 ? 'zerto-status-warn' : 'zerto-status-err');
    }
    if ($('zertoRpoConfig')) $('zertoRpoConfig').textContent = _fmtRPO(vpg.rpo_config_s);
    const rpoPct = vpg.rpo_config_s > 0 ? Math.min(100, (vpg.rpo_actual_s / vpg.rpo_config_s) * 100) : 0;
    _setBar('zertoRpoBar', rpoPct, false);  // low actual = good (green)

    // History
    if ($('zertoHistActual')) $('zertoHistActual').textContent = _fmtDuration(vpg.history_actual_m);
    if ($('zertoHistConfig')) $('zertoHistConfig').textContent = _fmtDuration(vpg.history_config_m);
    const histPct = vpg.history_config_m > 0 ? Math.min(100, (vpg.history_actual_m / vpg.history_config_m) * 100) : 0;
    const histBar = $('zertoHistBar');
    if (histBar) { histBar.style.width = histPct + '%'; histBar.className = 'sys-metric-bar bar--good'; }

    // Failsafe
    if ($('zertoFailsafeActual')) $('zertoFailsafeActual').textContent = _fmtDuration(vpg.failsafe_actual_m);
    if ($('zertoFailsafeConfig')) $('zertoFailsafeConfig').textContent = _fmtDuration(vpg.failsafe_config_m);

    // VMs
    const vmsTbody = $('zertoVmsTbody');
    if (vmsTbody) {
      const vms = zvmWithVpg.vms || [];
      vmsTbody.innerHTML = vms.length === 0
        ? `<tr><td colspan="5" class="zerto-empty">–</td></tr>`
        : vms.map(vm => {
            const p   = vpg.rpo_config_s > 0 ? vm.rpo_actual_s / vpg.rpo_config_s : 0;
            const rc  = p < 0.5 ? 'zerto-status-ok' : p < 1 ? 'zerto-status-warn' : 'zerto-status-err';
            const sc  = vm.status === 1 ? 'zerto-status-ok' : vm.status === 0 ? '' : 'zerto-status-err';
            const jnl = vm.journal_mb > 1024 ? (vm.journal_mb/1024).toFixed(1)+'GB' : vm.journal_mb+'MB';
            return `<tr>
              <td><strong>${vm.name}</strong></td>
              <td class="${sc}">${vm.status_desc || vm.status}</td>
              <td class="${rc}">${_fmtRPO(vm.rpo_actual_s)}</td>
              <td>${vm.iops}</td>
              <td>${jnl}</td>
            </tr>`;
          }).join('');
    }

    // Alerts
    const alertsEl = $('zertoAlertsList');
    if (alertsEl) {
      const alerts = (zvmWithVpg.alerts || []).filter(a => !a.dismissed);
      if (alerts.length === 0) {
        alertsEl.innerHTML = `<div class="zerto-empty">${t('zerto_no_alerts')}</div>`;
      } else {
        alertsEl.innerHTML = alerts.map(a => {
          const lvl = (a.level || '').toLowerCase();
          const ts  = a.turned_on ? new Date(a.turned_on).toLocaleString('ca-ES') : '';
          return `<div class="zerto-alert-item">
            <div>
              <span class="zerto-alert-badge zerto-alert-badge--${lvl}">${a.level}</span>
              <div class="zerto-alert-time">${ts}</div>
            </div>
            <div class="zerto-alert-body">${a.description}</div>
          </div>`;
        }).join('');
      }
    }

    // Events
    const evTbody = $('zertoEventsTbody');
    if (evTbody) {
      const events = zvmWithVpg.events || [];
      evTbody.innerHTML = events.length === 0
        ? `<tr><td colspan="4" class="zerto-empty">${t('zerto_no_events')}</td></tr>`
        : events.map(e => {
            const ts  = e.occurred_on ? new Date(e.occurred_on).toLocaleString('ca-ES') : '–';
            const ok  = e.success === true ? ' <span class="zerto-event-ok">✓</span>' : e.success === false ? ' <span class="zerto-event-err">✗</span>' : '';
            return `<tr>
              <td style="white-space:nowrap;font-size:.75rem">${ts}</td>
              <td style="white-space:nowrap;font-size:.75rem">${e.site || '–'}</td>
              <td style="font-size:.8rem">${e.description || '–'}${ok}</td>
              <td style="white-space:nowrap;font-size:.75rem">${(e.user || '').replace(/^\\+/, '')}</td>
            </tr>`;
          }).join('');
    }
  } catch { /* silent */ }
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
  checkSystemMetrics();
  checkZerto();
  setInterval(checkInfraStatus,   INFRA_INTERVAL_MS);
  setInterval(checkSystemMetrics, INFRA_INTERVAL_MS);
  setInterval(checkZerto,         30000);
});
