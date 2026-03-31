// Init colors based on current saved theme
const _initTheme = localStorage.getItem('theme') || 'dark';
Chart.defaults.color       = _initTheme === 'dark' ? '#8892a4' : '#64748b';
Chart.defaults.borderColor = _initTheme === 'dark' ? '#2a2a5044' : '#d1d9e688';
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';

const PALETTE = [
  '#6366f1','#10b981','#f59e0b','#ef4444',
  '#3b82f6','#8b5cf6','#ec4899','#14b8a6',
];

function makeGradient(ctx, color) {
  const g = ctx.createLinearGradient(0, 0, 0, 220);
  g.addColorStop(0, color + '55');
  g.addColorStop(1, color + '00');
  return g;
}

// Hourly colour: night=blue, dawn/dusk=orange, lunch-dip=amber, day=yellow-green
function _hourColor(h, alpha) {
  if (h < 6  || h >= 22) return `rgba(59,130,246,${alpha})`;   // night: blue
  if (h < 8  || h >= 20) return `rgba(251,146,60,${alpha})`;   // dawn/dusk: orange
  if (h === 13)           return `rgba(234,179,8,${alpha})`;    // lunch: amber
  return `rgba(16,185,129,${alpha})`;                           // business: green
}
const HOUR_BG = Array.from({length: 24}, (_, h) => _hourColor(h, 0.70));
const HOUR_BD = Array.from({length: 24}, (_, h) => _hourColor(h, 1.00));

// ── Shared scale defaults ─────────────────────────────────────────────────────
const gridColor = () => Chart.defaults.borderColor;

// ── Timestamp → local label ───────────────────────────────────────────────────
function formatTsLabel(ts, gran) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  if (gran === 'minute' || gran === 'minute10') {
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  if (gran === 'hour') {
    return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}h`;
  }
  // day
  return `${p(d.getDate())}/${p(d.getMonth()+1)}`;
}

function _localDate(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}`;
}

// ── Day markers: returns array of {index, date, isFirst} ─────────────────────
function _buildDayMarkers(data, gran) {
  if (!data || data.length < 2) return [];
  if (gran === 'day') return []; // day granularity: labels already are dates
  const allDates = [...new Set(data.map(d => _localDate(d.ts)))];
  if (allDates.length <= 1) return []; // single day: skip
  const markers = [];
  let prevDate = null;
  data.forEach((d, i) => {
    const dateStr = _localDate(d.ts);
    if (i === 0) {
      markers.push({ index: 0, date: dateStr, isFirst: true });
      prevDate = dateStr;
    } else if (dateStr !== prevDate) {
      markers.push({ index: i, date: dateStr, isFirst: false });
      prevDate = dateStr;
    }
  });
  return markers;
}

// ── Midnight lines + date badge plugin ───────────────────────────────────────
const midnightPlugin = {
  id: 'midnightLines',
  afterDraw(chart) {
    const markers = chart.data._dayMarkers;
    if (!markers || !markers.length) return;
    const xScale = chart.scales.x;
    const area   = chart.chartArea;
    const ctx    = chart.ctx;
    if (!xScale || !area) return;
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';

    ctx.save();
    markers.forEach(({ index, date, isFirst }) => {
      let x;
      if (isFirst) {
        x = xScale.getPixelForValue(0) + 4;
      } else {
        const xP = xScale.getPixelForValue(index - 1);
        const xC = xScale.getPixelForValue(index);
        if (xP == null || xC == null) return;
        x = (xP + xC) / 2;
      }
      if (x < area.left || x > area.right) return;

      // Dashed vertical line (skip for isFirst — no line before first data point)
      if (!isFirst) {
        ctx.setLineDash([5, 3]);
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = dark ? 'rgba(148,163,184,0.28)' : 'rgba(100,116,139,0.22)';
        ctx.beginPath();
        ctx.moveTo(x, area.top + 20);
        ctx.lineTo(x, area.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Date badge
      ctx.font = 'bold 10px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(date).width;
      const bw = tw + 10, bh = 16;
      const bx = isFirst ? area.left + 2 : x - bw / 2;
      const by = area.top + 2;

      ctx.fillStyle   = dark ? 'rgba(26,26,53,0.92)' : 'rgba(240,242,248,0.92)';
      ctx.strokeStyle = dark ? 'rgba(99,102,241,0.45)' : 'rgba(99,102,241,0.35)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle    = dark ? 'rgba(148,163,184,0.95)' : 'rgba(71,85,105,0.95)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(date, bx + bw / 2, by + bh / 2);
    });
    ctx.restore();
  },
};

// ── Y-axis alignment: force both temporal charts to share identical x-pixels ──
// Strategy: after both charts render synchronously, read their actual chartArea
// coordinates, compute the delta, apply padding correction to chartCumulative,
// and re-render it.  Runs up to 2 passes to handle any second-order drift.
function syncTimelineAxes() {
  _syncPass();
  _syncPass(); // second pass catches any tiny drift from the first correction
}

function _syncPass() {
  const tl = chartTimeline?.chartArea;
  const cu = chartCumulative?.chartArea;
  if (!tl || !cu || !(tl.left > 0)) return;

  const padObj = chartCumulative.options.layout?.padding;
  const curL = (padObj && typeof padObj === 'object') ? (padObj.left  || 0) : 0;
  const curR = (padObj && typeof padObj === 'object') ? (padObj.right || 0) : 0;

  // How much must cumulative move to match timeline?
  const adjL = tl.left  - cu.left;   // > 0 → cu starts too far left
  const adjR = cu.right - tl.right;  // > 0 → cu ends too far right

  if (Math.abs(adjL) < 1 && Math.abs(adjR) < 1) return; // already aligned

  chartCumulative.options.layout = {
    padding: {
      left:  Math.max(0, curL + adjL),
      right: Math.max(0, curR + adjR),
    },
  };
  chartCumulative.update('none'); // synchronous: chartArea is updated immediately
}

// ── Timeline chart (orders/min + revenue) ────────────────────────────────────
const chartTimeline = new Chart(
  document.getElementById('chartTimeline').getContext('2d'), {
    type: 'bar',
    data: { labels: [], _dayMarkers: [], datasets: [
      {
        label: 'Ordres',
        data: [],
        backgroundColor: '#6366f155',
        borderColor: '#6366f1',
        borderWidth: 2,
        borderRadius: 4,
        yAxisID: 'y',
      },
      {
        label: 'Ingressos (€)',
        data: [],
        type: 'line',
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.4,
        yAxisID: 'y2',
      },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12 } },
        midnightLines: {},
      },
      scales: {
        x: { grid: { color: '#2a2a5044' }, ticks: { maxTicksLimit: 12 } },
        y: {
          grid: { color: '#2a2a5044' },
          title: { display: true, text: 'Ordres', color: '#6366f1' },
          position: 'left',
        },
        y2: {
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Ingressos (€)', color: '#10b981' },
          position: 'right',
        },
      },
    },
    plugins: [midnightPlugin],
  }
);

// ── Cumulative revenue ────────────────────────────────────────────────────────
const ctxCumul = document.getElementById('chartCumulative').getContext('2d');
const chartCumulative = new Chart(ctxCumul, {
  type: 'line',
  data: { labels: [], _dayMarkers: [], datasets: [{
    label: 'Ingressos acumulats (€)',
    data: [],
    borderColor: '#f59e0b',
    backgroundColor: makeGradient(ctxCumul, '#f59e0b'),
    borderWidth: 2,
    fill: true,
    tension: 0.4,
    pointRadius: 0,
  }]},
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      midnightLines: {},
      tooltip: {
        callbacks: {
          label: (item) => ` €${item.raw.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: '#2a2a5044' }, ticks: { maxTicksLimit: 10 } },
      y: {
        grid: { color: '#2a2a5044' },
        ticks: { callback: v => '€' + v.toLocaleString() },
      },
    },
  },
  plugins: [midnightPlugin],
});

// ── Cumulative delta picker ───────────────────────────────────────────────────
(function () {
  const canvas = document.getElementById('chartCumulative');
  const box    = document.getElementById('cumulDelta');
  if (!canvas || !box) return;

  let _picks = [];

  function _closeDelta() {
    _picks = [];
    _refreshPoints();
    box.style.display = 'none';
    box.innerHTML = '';
  }

  function _refreshPoints() {
    const ds = chartCumulative.data.datasets[0];
    const n  = ds.data.length;
    if (!n) return;
    const radii = Array(n).fill(0);
    const bgs   = Array(n).fill('transparent');
    const bds   = Array(n).fill('transparent');
    _picks.forEach(p => {
      if (p.index < n) { radii[p.index] = 6; bgs[p.index] = '#f59e0b'; bds[p.index] = '#fff'; }
    });
    ds.pointRadius = radii; ds.pointBackgroundColor = bgs;
    ds.pointBorderColor = bds; ds.pointBorderWidth = 2;
    chartCumulative.update('none');
  }

  function _renderDelta() {
    if (_picks.length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }

    const [a, b] = _picks[0].index < _picks[1].index ? [_picks[0], _picks[1]] : [_picks[1], _picks[0]];
    const diff = b.value - a.value;
    const sign = diff >= 0 ? '+' : '';
    const cls  = diff >= 0 ? 'delta-positive' : 'delta-negative';
    const fmtV = v => v.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    box.innerHTML = `
      <div><span class="delta-label">Punt A</span>&nbsp;<strong>${a.label}</strong></div>
      <div style="padding-left:2px"><span class="delta-label">Acumulat</span> <span style="color:var(--warning);font-weight:600">€${fmtV(a.value)}</span></div>
      <div style="margin-top:6px"><span class="delta-label">Punt B</span>&nbsp;<strong>${b.label}</strong></div>
      <div style="padding-left:2px"><span class="delta-label">Acumulat</span> <span style="color:var(--warning);font-weight:600">€${fmtV(b.value)}</span></div>
      <div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--border)">
        <span class="delta-label">Δ Revenue A→B</span><br>
        <span class="delta-value ${cls}">${sign}€${fmtV(diff)}</span>
      </div>
      <button class="delta-close" id="cumulDeltaClose" title="Tancar">✕</button>`;

    box.style.display = 'block';

    document.getElementById('cumulDeltaClose').onclick = (e) => {
      e.stopPropagation();
      _closeDelta();
    };
  }

  canvas.addEventListener('click', (e) => {
    const pts = chartCumulative.getElementsAtEventForMode(e, 'index', { intersect: false }, false);
    if (!pts.length) return;
    const idx   = pts[0].index;
    const ds    = chartCumulative.data.datasets[0];
    const label = chartCumulative.data.labels[idx] ?? idx;
    const value = ds.data[idx] ?? 0;

    // Never remove a pick by clicking — always add/replace.
    // Replace the oldest when already at 2, skip if same index.
    if (_picks.some(p => p.index === idx)) return;
    if (_picks.length >= 2) _picks.shift();
    _picks.push({ index: idx, value, label });

    _refreshPoints();
    // Only show delta once 2 picks exist; never hide from here.
    if (_picks.length === 2) _renderDelta();
  });

  canvas.style.cursor = 'crosshair';

  const _origUpdateCumul = window.updateCumulative;
  if (typeof _origUpdateCumul === 'function') {
    window.updateCumulative = function (...args) {
      _origUpdateCumul.apply(this, args);
      // After data update: refresh pick values from new dataset.
      // Close only if an index is now out of bounds.
      if (_picks.length === 0) return;
      const ds = chartCumulative.data.datasets[0];
      const newPicks = _picks.map(p => {
        if (p.index >= ds.data.length) return null;
        return { ...p, value: ds.data[p.index], label: chartCumulative.data.labels[p.index] ?? p.label };
      });
      if (newPicks.some(p => p === null)) {
        _picks = []; box.style.display = 'none'; box.innerHTML = '';
      } else {
        _picks = newPicks;
        if (_picks.length === 2) _renderDelta();
      }
    };
  }
})();

// ── Product quantity (horizontal bar) ────────────────────────────────────────
const chartProductQty = document.getElementById('chartProductQty')
  ? new Chart(document.getElementById('chartProductQty').getContext('2d'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Unitats', data: [],
        backgroundColor: PALETTE, borderRadius: 3, maxBarThickness: 14 }]},
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
    })
  : null;

// ── Revenue per product (horizontal bar) ─────────────────────────────────────
const chartProductRev = document.getElementById('chartProductRev')
  ? new Chart(document.getElementById('chartProductRev').getContext('2d'), {
      type: 'bar',
      data: { labels: [], datasets: [{
        label: 'Ingressos (€)', data: [], backgroundColor: PALETTE, borderRadius: 4,
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#2a2a5044' }, ticks: { callback: v => '€' + v.toLocaleString() } },
          y: { grid: { color: '#2a2a5044' } },
        },
      },
    })
  : null;

// ── Daily history (orders bar + revenue line, dual axis) ─────────────────────
const chartDaily = new Chart(
  document.getElementById('chartDaily').getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [
      {
        label: 'Ordres',
        data: [],
        backgroundColor: '#6366f155',
        borderColor: '#6366f1',
        borderWidth: 2,
        borderRadius: 4,
        yAxisID: 'y',
        order: 2,
      },
      {
        label: 'Facturació (€)',
        data: [],
        type: 'line',
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: '#f59e0b',
        tension: 0.3,
        yAxisID: 'y2',
        order: 1,
      },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
      scales: {
        x: { grid: { color: '#2a2a5044' } },
        y: {
          grid: { color: '#2a2a5044' },
          title: { display: true, text: 'Ordres', color: '#6366f1' },
          position: 'left',
          ticks: { precision: 0 },
        },
        y2: {
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Facturació (€)', color: '#f59e0b' },
          position: 'right',
          ticks: { callback: v => '€' + v.toLocaleString() },
        },
      },
    },
  }
);

// ── Hourly distribution (24 bars coloured by time-of-day) ────────────────────
const chartHourly = new Chart(
  document.getElementById('chartHourly').getContext('2d'), {
    type: 'bar',
    data: {
      labels: Array.from({length: 24}, (_, h) => `${String(h).padStart(2,'0')}h`),
      datasets: [
        {
          label: 'Ordres',
          data: Array(24).fill(0),
          backgroundColor: HOUR_BG,
          borderColor: HOUR_BD,
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'y',
          order: 2,
        },
        {
          label: 'Facturació (€)',
          data: Array(24).fill(0),
          type: 'line',
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
          yAxisID: 'y2',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12 } },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx === undefined) return;
              const avg = chartHourly._avgCounts?.[idx] ?? 0;
              const avgRev = chartHourly._avgRevs?.[idx] ?? 0;
              return [
                `Mitja/dia ordres: ${avg}`,
                `Mitja/dia €: ${avgRev.toLocaleString()}`,
              ];
            },
          },
        },
      },
      scales: {
        x: { grid: { color: '#2a2a5044' } },
        y: {
          grid: { color: '#2a2a5044' },
          title: { display: true, text: 'Ordres', color: '#8892a4' },
          position: 'left',
          ticks: { precision: 0 },
        },
        y2: {
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Facturació (€)', color: '#f59e0b' },
          position: 'right',
          ticks: { callback: v => '€' + v.toLocaleString() },
        },
      },
    },
  }
);

// ── Update helpers ────────────────────────────────────────────────────────────
function updateTimeline(data, gran) {
  gran = gran || 'minute';
  chartTimeline.data.labels            = data.map(d => formatTsLabel(d.ts, gran));
  chartTimeline.data._dayMarkers       = _buildDayMarkers(data, gran);
  chartTimeline.data.datasets[0].data  = data.map(d => d.count);
  chartTimeline.data.datasets[1].data  = data.map(d => d.revenue);
  chartTimeline.update('none');
}

function updateCumulative(data, gran) {
  gran = gran || 'minute';
  if (!data || !data.length) {
    chartCumulative.data.labels          = [];
    chartCumulative.data._dayMarkers     = [];
    chartCumulative.data.datasets[0].data = [];
    chartCumulative.update('none');
    return;
  }
  let cumsum = 0;
  chartCumulative.data.labels           = data.map(d => formatTsLabel(d.ts, gran));
  chartCumulative.data._dayMarkers      = _buildDayMarkers(data, gran);
  chartCumulative.data.datasets[0].data = data.map(d => {
    cumsum += d.revenue;
    return parseFloat(cumsum.toFixed(2));
  });
  chartCumulative.update('none');
}

function updateProductCharts(data) {
  const h = Math.max(160, data.length * 18 + 40);
  if (chartProductQty) {
    const byQty = [...data].sort((a, b) => b.total_quantity - a.total_quantity);
    const wrap = document.getElementById('chartWrapProductQty');
    if (wrap) wrap.style.height = h + 'px';
    chartProductQty.data.labels           = byQty.map(d => d.name);
    chartProductQty.data.datasets[0].data = byQty.map(d => d.total_quantity);
    chartProductQty.update('none');
  }
  if (chartProductRev) {
    const byRev = [...data].sort((a, b) => b.total_revenue - a.total_revenue);
    const wrap = document.getElementById('chartWrapProductRev');
    if (wrap) wrap.style.height = h + 'px';
    chartProductRev.data.labels           = byRev.map(d => d.name);
    chartProductRev.data.datasets[0].data = byRev.map(d => d.total_revenue);
    chartProductRev.update('none');
  }
}

function updateDailyChart(data) {
  chartDaily.data.labels               = data.map(d => d.date);
  chartDaily.data.datasets[0].data     = data.map(d => d.count);
  chartDaily.data.datasets[1].data     = data.map(d => d.revenue);
  chartDaily.update('none');
}

function updateHourlyChart(data) {
  // Remap UTC hours (from PostgreSQL) to local browser hours
  const utcOffset = -new Date().getTimezoneOffset() / 60; // hours ahead of UTC
  const remapped  = Array.from({length: 24}, () => ({count: 0, revenue: 0, avg_count: 0, avg_revenue: 0}));
  data.forEach(d => {
    const localH = ((d.hour + utcOffset) % 24 + 24) % 24;
    remapped[localH] = { count: d.count, revenue: d.revenue, avg_count: d.avg_count, avg_revenue: d.avg_revenue };
  });
  chartHourly.data.datasets[0].data = remapped.map(d => d.count);
  chartHourly.data.datasets[1].data = remapped.map(d => d.revenue);
  chartHourly._avgCounts = remapped.map(d => d.avg_count);
  chartHourly._avgRevs   = remapped.map(d => d.avg_revenue);
  chartHourly.update('none');
}
