const TabSystems = (() => {
  const infraGrid = document.getElementById("infraStatusGrid");
  const cardGrid = document.getElementById("systemsCardGrid");

  function fmtMs(ms) {
    return `HTTP ${ms.status || "—"} · ${ms.latencyMs}ms`;
  }

  function barClass(percent) {
    if (percent >= 85) return "metric-row__bar-fill--error";
    if (percent >= 65) return "metric-row__bar-fill--warn";
    return "";
  }

  function metricRow(label, used, total, unit, percent) {
    return `
      <div class="metric-row">
        <span class="metric-row__label">${label}</span>
        <div class="metric-row__bar-track">
          <div class="metric-row__bar-fill ${barClass(percent)}" style="width:${Math.min(percent, 100)}%"></div>
        </div>
        <span class="metric-row__value">${used} / ${total} ${unit} (${percent.toFixed(1)}%)</span>
      </div>
    `;
  }

  function uptimeHuman(seconds) {
    if (!seconds && seconds !== 0) return "—";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function statusDot(ok) {
    return `<span class="status-dot ${ok ? "status-dot--ok" : "status-dot--error"}"></span>`;
  }

  function infraCheckRow(label, resultText, ok) {
    return `
      <div class="infra-status-check">
        <span>${label}</span>
        <span class="infra-status-check__result badge ${ok ? "badge--ok" : "badge--error"}">${resultText}</span>
      </div>
    `;
  }

  async function loadInfraStatus() {
    const results = await Promise.allSettled([
      Api.probes.frontendPing(),
      Api.probes.frontendCssPing(),
      Api.business.ping(),
      Api.business.health(),
      Api.probes.dbPing(),
    ]);

    const [frontendPing, frontendCss, backendPing, backendHealth, dbPing] =
      results.map((r) => (r.status === "fulfilled" ? r.value : null));

    infraGrid.innerHTML = `
      <div class="infra-status-card">
        <div class="infra-status-card__title">${statusDot(!!frontendPing?.ok)} ${I18n.t("systems.frontend")}</div>
        ${infraCheckRow("PING HEAD /", frontendPing ? fmtMs(frontendPing) : I18n.t("common.unreachable"), !!frontendPing?.ok)}
        ${infraCheckRow("HEAD /css/style.css", frontendCss ? fmtMs(frontendCss) : I18n.t("common.unreachable"), !!frontendCss?.ok)}
      </div>
      <div class="infra-status-card">
        <div class="infra-status-card__title">${statusDot(!!backendPing)} ${I18n.t("systems.backend")}</div>
        ${infraCheckRow("GET /api/ping", backendPing ? "pong ✓" : I18n.t("common.unreachable"), !!backendPing)}
        ${infraCheckRow("GET /api/health", backendHealth ? backendHealth.status : I18n.t("common.unreachable"), backendHealth?.status === "ok")}
      </div>
      <div class="infra-status-card">
        <div class="infra-status-card__title">${statusDot(!!dbPing)} ${I18n.t("systems.database")}</div>
        ${infraCheckRow("GET /db-probe/ping", dbPing ? "SELECT 1 ✓" : I18n.t("common.unreachable"), !!dbPing)}
      </div>
    `;
  }

  async function loadComponentCards() {
    const [frontendSys, backendSys, dbSys, dbMetrics] = await Promise.allSettled([
      Api.probes.frontendSysMetrics(),
      Api.business.system(),
      Api.probes.dbSysMetrics(),
      Api.probes.dbMetrics(),
    ]).then((rs) => rs.map((r) => (r.status === "fulfilled" ? r.value : null)));

    cardGrid.innerHTML = `
      ${componentCard(I18n.t("systems.frontend"), frontendSys)}
      ${componentCard(I18n.t("systems.backend"), backendSys)}
      ${componentCard(I18n.t("systems.database"), dbSys, dbMetrics)}
    `;
  }

  function componentCard(title, sys, dbMetrics = null) {
    if (!sys) {
      return `<div class="card"><h2>${title}</h2><p>${I18n.t("common.unreachable")}</p></div>`;
    }

    const cpuPercent = sys.cpu_percent || 0;
    const ramPercent = (sys.ram_used_mb / sys.ram_total_mb) * 100;
    const diskPercent = (sys.disk_used_gb / sys.disk_total_gb) * 100;

    let dbExtra = "";
    if (dbMetrics) {
      dbExtra = `
        ${metricRow(I18n.t("systems.connections"), dbMetrics.total_connections, dbMetrics.max_connections, "", dbMetrics.connections_percent)}
        <div class="plain-row"><span>${I18n.t("systems.active")}</span><span>${dbMetrics.active_connections}</span></div>
        <div class="plain-row"><span>${I18n.t("systems.dbSize")}</span><span>${dbMetrics.db_size_mb} MB</span></div>
        <div class="plain-row"><span>${I18n.t("systems.cacheHit")}</span><span>${dbMetrics.cache_hit_ratio_percent}%</span></div>
        <div class="plain-row"><span>${I18n.t("systems.transactions")}</span><span>${dbMetrics.transactions.toLocaleString()}</span></div>
      `;
    }

    return `
      <div class="card">
        <h2>${title}</h2>
        ${metricRow(I18n.t("systems.cpu"), cpuPercent.toFixed(1) + "%", "", "", cpuPercent)}
        ${metricRow(I18n.t("systems.ram"), sys.ram_used_mb, sys.ram_total_mb, "MB", ramPercent)}
        ${metricRow(I18n.t("systems.disk"), sys.disk_used_gb, sys.disk_total_gb, "GB", diskPercent)}
        <div class="plain-row"><span>${I18n.t("systems.uptime")}</span><span>${uptimeHuman(sys.uptime_seconds)}</span></div>
        ${dbExtra}
      </div>
    `;
  }

  async function loadAll() {
    await Promise.all([loadInfraStatus(), loadComponentCards()]);
  }

  function init() {
    loadAll();
    document.addEventListener("i18n:changed", loadAll);
  }

  return { init, loadAll };
})();

document.addEventListener("DOMContentLoaded", TabSystems.init);
