const TabBookings = (() => {
  const RANGE_OPTIONS = [
    { key: "last15m", minutes: 15 },
    { key: "last30m", minutes: 30 },
    { key: "last1h", minutes: 60 },
    { key: "last3h", minutes: 180 },
    { key: "last6h", minutes: 360 },
    { key: "last12h", minutes: 720 },
    { key: "last24h", minutes: 1440 },
    { key: "last2d", minutes: 2880 },
    { key: "last5d", minutes: 7200 },
    { key: "lastWeek", minutes: 10080 },
    { key: "last10d", minutes: 14400 },
    { key: "last15d", minutes: 21600 },
    { key: "last30d", minutes: 43200 },
    { key: "allData", minutes: null },
  ];

  let selectedRange = RANGE_OPTIONS.find((r) => r.key === "last24h");
  let timelineChart = null;
  let cumulativeChart = null;
  let hourlyChart = null;
  let freshness = null;
  let lastBookingAt = null;
  let cumulativeSelectedPoints = []; // Punto A y Punto B para el delta
  let currentFromIso = new Date(0).toISOString(); // rango activo actual

  function chartColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      primary: styles.getPropertyValue("--primary").trim(),
      green: styles.getPropertyValue("--accent-green").trim(),
      text: styles.getPropertyValue("--text-muted").trim(),
      grid: styles.getPropertyValue("--chart-grid").trim(),
    };
  }

  function buildRangeMenu() {
    const picker = document.getElementById("rangePicker");
    const trigger = document.getElementById("rangeTrigger");

    const menu = document.createElement("div");
    menu.className = "range-picker__menu";
    menu.id = "rangeMenu";

    RANGE_OPTIONS.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "range-picker__option" + (opt.key === selectedRange.key ? " range-picker__option--active" : "");
      btn.dataset.rangeKey = opt.key;
      btn.textContent = I18n.t(`range.${opt.key}`);
      btn.addEventListener("click", () => {
        selectedRange = opt;
        document.getElementById("rangeLabel").textContent = I18n.t(`range.${opt.key}`);
        menu.classList.remove("range-picker__menu--open");
        menu.querySelectorAll(".range-picker__option").forEach((o) =>
          o.classList.toggle("range-picker__option--active", o.dataset.rangeKey === opt.key)
        );
        loadAll();
      });
      menu.appendChild(btn);
    });

    picker.appendChild(menu);

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("range-picker__menu--open");
    });
    document.addEventListener("click", () => menu.classList.remove("range-picker__menu--open"));

    document.addEventListener("i18n:changed", () => {
      document.getElementById("rangeLabel").textContent = I18n.t(`range.${selectedRange.key}`);
      menu.querySelectorAll(".range-picker__option").forEach((btn) => {
        btn.textContent = I18n.t(`range.${btn.dataset.rangeKey}`);
      });
    });
  }

  function formatExactElapsed(ms) {
    const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function urgencyClass(totalMinutes) {
    if (totalMinutes >= 5) return "kpi-card__value--danger";
    if (totalMinutes >= 3) return "kpi-card__value--warning";
    return "kpi-card__value--accent";
  }

  function renderLastBooking() {
    const el = document.getElementById("kpiLastBooking");
    if (!lastBookingAt) {
      el.textContent = "—";
      el.className = "kpi-card__value";
      return;
    }
    const elapsedMs = Date.now() - lastBookingAt.getTime();
    el.textContent = formatExactElapsed(elapsedMs);
    el.className = `kpi-card__value ${urgencyClass(elapsedMs / 60000)}`;
  }

  // Recalcula el contador cada segundo, independientemente del ciclo de
  // refresco de 5s de la API — así el color y el texto son exactos.
  setInterval(renderLastBooking, 1000);

  function fmtEur(value) {
    return `€${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function renderDeltaPanel() {
    const panel = document.getElementById("deltaPanel");
    if (!panel) return;

    if (cumulativeSelectedPoints.length === 0) {
      panel.innerHTML = "";
      panel.style.display = "none";
      return;
    }

    const a = cumulativeSelectedPoints[0];
    const b = cumulativeSelectedPoints[1] || null;

    let html = `
      <div class="delta-point">
        <span class="delta-point__label">Punto A · ${a.label}</span>
        <span class="delta-point__value" style="color:#60a5fa">${fmtEur(a.value)}</span>
      </div>`;

    if (b) {
      const delta = b.value - a.value;
      html += `
        <div class="delta-point">
          <span class="delta-point__label">Punto B · ${b.label}</span>
          <span class="delta-point__value" style="color:#f472b6">${fmtEur(b.value)}</span>
        </div>
        <div class="delta-result">
          <span class="delta-result__label">Δ Revenue A → B</span>
          <span class="delta-result__value">+${fmtEur(delta)}</span>
        </div>`;
    } else {
      html += `
        <div class="delta-point">
          <span class="delta-point__label" style="color:var(--text-muted);font-size:12px">
            Haz clic en otro punto para calcular el delta
          </span>
        </div>`;
    }

    panel.innerHTML = html;
    panel.style.display = "grid";
  }

  async function loadKpis(fromIso) {
    try {
      const summary = await Api.business.kpiSummary(fromIso);
      document.getElementById("kpiTotalBookings").textContent = summary.total_bookings.toLocaleString();
      document.getElementById("kpiTotalRevenue").textContent =
        `€${summary.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      document.getElementById("kpiAvgPerDay").textContent = Math.round(summary.avg_bookings_per_day).toLocaleString();

      lastBookingAt = summary.last_booking_at ? new Date(summary.last_booking_at) : null;
      renderLastBooking();
      return true;
    } catch (err) {
      // No se sobrescriben los valores anteriores: se quedan en pantalla
      // los últimos datos buenos, y el freshness badge pasa a "cached".
      console.error("Error cargando KPIs:", err);
      return false;
    }
  }

  function formatAxisLabel(date) {
    // Con rangos largos (>24h o "todos los datos") se incluye la fecha;
    // con rangos cortos basta con la hora.
    const spansMultipleDays = selectedRange.minutes === null || selectedRange.minutes > 1440;
    return spansMultipleDays
      ? date.toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Agrupa puntos en buckets de N minutos para que las barras sean
  // individualmente visibles aunque haya muchos datos.
  function aggregateBuckets(points, bucketMinutes) {
    if (bucketMinutes <= 1) return points;
    const bucketMs = bucketMinutes * 60000;
    const map = new Map();
    points.forEach((p) => {
      const t = new Date(p.minute).getTime();
      const key = Math.floor(t / bucketMs) * bucketMs;
      if (!map.has(key)) {
        map.set(key, { minute: new Date(key).toISOString(), bookings_count: 0, revenue: 0 });
      }
      map.get(key).bookings_count += p.bookings_count;
      map.get(key).revenue += p.revenue;
    });
    return [...map.values()].sort((a, b) => new Date(a.minute) - new Date(b.minute));
  }

  // Elige el tamaño de bucket según el número de puntos:
  //  ≤ 60 puntos  → sin agrupación (barras por minuto)
  //  ≤ 360 puntos → buckets de 5 min  (≈ 60-70 barras visibles)
  //  ≤ 1440 puntos→ buckets de 15 min
  //  > 1440       → buckets de 30 min
  function chooseBucket(n) {
    if (n <= 60) return 1;
    if (n <= 360) return 5;
    if (n <= 1440) return 15;
    return 30;
  }

  async function loadCharts(fromIso) {
    let rawPoints = [];
    try {
      rawPoints = await Api.business.kpiTimeseries(fromIso);
    } catch (err) {
      console.error("Error cargando serie temporal:", err);
      return false;
    }

    const bucket = chooseBucket(rawPoints.length);
    const points = aggregateBuckets(rawPoints, bucket);

    const colors = chartColors();
    const labels = points.map((p) => formatAxisLabel(new Date(p.minute)));
    const bookingCounts = points.map((p) => p.bookings_count);
    const revenues = points.map((p) => p.revenue);

    // ---- Timeline: siempre barras (ahora con buckets legibles) ----
    timelineChart = upsertChart(timelineChart, "timelineChart", {
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: I18n.t("chart.bookings"),
            data: bookingCounts,
            backgroundColor: "#6366f1",
            yAxisID: "y",
            barPercentage: 0.85,
            categoryPercentage: 0.85,
          },
          {
            type: "line",
            label: I18n.t("chart.revenue"),
            data: revenues,
            borderColor: colors.green,
            backgroundColor: "transparent",
            yAxisID: "y1",
            tension: 0.3,
            pointRadius: 2,
            pointBackgroundColor: colors.green,
          },
        ],
      },
      options: chartOptions(colors, true),
    });

    // ---- Ingresos acumulados — color ámbar + selección de 2 puntos ----
    let cumulative = 0;
    const cumulativeData = revenues.map((r) => (cumulative += r));
    const amber = "#f59e0b";
    const amberFill = "rgba(245,158,11,0.15)";

    // Radios y colores de los puntos: normalmente invisibles,
    // grandes y llamativos en los dos puntos seleccionados.
    const pointRadii = cumulativeData.map((_, i) => {
      if (cumulativeSelectedPoints[0]?.index === i) return 7;
      if (cumulativeSelectedPoints[1]?.index === i) return 7;
      return 0;
    });
    const pointColors = cumulativeData.map((_, i) => {
      if (cumulativeSelectedPoints[0]?.index === i) return "#60a5fa"; // azul: Punto A
      if (cumulativeSelectedPoints[1]?.index === i) return "#f472b6"; // rosa: Punto B
      return amber;
    });

    const cumulativeConfig = {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: I18n.t("chart.revenue"),
          data: cumulativeData,
          borderColor: amber,
          backgroundColor: amberFill,
          fill: true,
          tension: 0.25,
          pointRadius: pointRadii,
          pointBackgroundColor: pointColors,
        }],
      },
      options: {
        ...chartOptions(colors, false),
        onClick: (event, elements, chart) => {
          if (!elements.length) return;
          const idx = elements[0].index;

          // Al 3er clic, reinicia la selección
          if (cumulativeSelectedPoints.length >= 2) {
            cumulativeSelectedPoints = [];
          }
          cumulativeSelectedPoints.push({
            index: idx,
            label: chart.data.labels[idx],
            value: chart.data.datasets[0].data[idx],
          });
          renderDeltaPanel();
          // Fuerza recarga de la gráfica para pintar los puntos marcados
          loadCharts(currentFromIso);
        },
      },
    };

    cumulativeChart = upsertChart(cumulativeChart, "cumulativeChart", cumulativeConfig);

    // ---- Distribución por hora del día ----
    const hourlyBookings = new Array(24).fill(0);
    const hourlyRevenue = new Array(24).fill(0);
    points.forEach((p) => {
      const h = new Date(p.minute).getHours();
      hourlyBookings[h] += p.bookings_count;
      hourlyRevenue[h] += p.revenue;
    });

    hourlyChart = upsertChart(hourlyChart, "hourlyChart", {
      data: {
        labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}h`),
        datasets: [
          {
            type: "bar",
            label: I18n.t("chart.bookings"),
            data: hourlyBookings,
            backgroundColor: "#6366f1",
            yAxisID: "y",
          },
          {
            type: "line",
            label: I18n.t("chart.revenue"),
            data: hourlyRevenue,
            borderColor: colors.green,
            backgroundColor: "transparent",
            yAxisID: "y1",
            tension: 0.3,
            pointRadius: 0,
          },
        ],
      },
      options: chartOptions(colors, true),
    });

    return true;
  }

  // Crea el gráfico la primera vez; en refrescos posteriores actualiza
  // los datos del gráfico YA EXISTENTE en vez de destruirlo y recrearlo
  // (eso es lo que causaba la animación de entrada cada 5 segundos).
  function upsertChart(existingChart, canvasId, config) {
    // Si el tipo del primer dataset cambió (barras ↔ línea según el
    // rango seleccionado), hay que destruir y recrear el gráfico —
    // Chart.js no permite cambiar el tipo de un dataset en caliente.
    const newType = config.data?.datasets?.[0]?.type ?? config.type;
    const oldType = existingChart?.data?.datasets?.[0]?.type ?? existingChart?.config?.type;
    if (existingChart && newType && oldType && newType !== oldType) {
      existingChart.destroy();
      existingChart = null;
    }

    if (!existingChart) {
      return new Chart(document.getElementById(canvasId), config);
    }
    existingChart.data.labels = config.data.labels;
    config.data.datasets.forEach((dataset, i) => {
      Object.assign(existingChart.data.datasets[i], dataset);
    });
    existingChart.options = config.options;
    existingChart.update("none");
    return existingChart;
  }

  function chartOptions(colors, dualAxis) {
    const scales = {
      x: { grid: { color: colors.grid }, ticks: { color: colors.text, maxTicksLimit: 8, maxRotation: 0, autoSkip: true } },
      y: { grid: { color: colors.grid }, ticks: { color: colors.text }, position: "left" },
    };
    if (dualAxis) {
      scales.y1 = { position: "right", grid: { display: false }, ticks: { color: colors.text } };
    }
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: colors.text } } },
      scales,
    };
  }

  async function loadAll() {
    const fromIso = selectedRange.minutes
      ? new Date(Date.now() - selectedRange.minutes * 60000).toISOString()
      : new Date(0).toISOString();
    currentFromIso = fromIso;

    const [kpisOk, chartsOk] = await Promise.all([loadKpis(fromIso), loadCharts(fromIso)]);
    if (kpisOk && chartsOk) {
      freshness?.markSuccess();
    } else {
      freshness?.markFailure();
    }
  }

  function init() {
    freshness = createFreshnessBadge(document.getElementById("bookingsFreshness"));
    buildRangeMenu();
    loadAll();
    document.addEventListener("i18n:changed", loadAll);
  }

  return { init, loadAll };
})();

document.addEventListener("DOMContentLoaded", TabBookings.init);
