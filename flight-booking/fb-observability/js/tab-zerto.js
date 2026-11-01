// Normalitza la resposta del zerto-probe (format zvms[]) al format {remote,local}
// que espera aquest component.
function _fbFmtRpo(s){if(!s&&s!==0)return"—";if(s<60)return s+"s";const m=Math.floor(s/60),r=s%60;return r?m+"m "+r+"s":m+"m"}
function _fbFmtMin(m){if(!m&&m!==0)return"—";if(m<60)return m+"m";const h=Math.floor(m/60),r=m%60;return r?h+"h "+r+"m":h+"h"}
function _fbFmtJournal(mb){if(!mb)return"—";return mb>1024?(mb/1024).toFixed(1)+"GB":mb+"MB"}
function _fbVpgStatus(st,desc){const M={0:"Initializing",1:"MeetingSLA",2:"NotMeetingSLA",3:"RPO NotMeetingSLA",4:"History NotMeetingSLA",5:"FailingOver",6:"Moving",8:"Recovered"};return(desc&&desc!=="None")?desc:(M[st]||"Status "+st)}
function normalizeZertoData(raw){
  const zvms=raw.zvms||[];
  const out={};
  for(const[key,idx]of[["remote",0],["local",1]]){
    const zvm=zvms[idx];
    if(!zvm){out[key]={reachable:false,label:key,vpgs:[],protected_vms:[],active_alerts:[],recent_events:[]};continue}
    const ok=zvm.status==="ok";
    const vpg=zvm.vpg;
    const vpgs=vpg?[{
      name:vpg.name,
      is_meeting_sla:vpg.status===1,
      status_label:_fbVpgStatus(vpg.status,vpg.status_desc),
      actual_rpo_human:_fbFmtRpo(vpg.rpo_actual_s),
      journal_history_human:_fbFmtMin(vpg.history_actual_m),
      configured_journal_human:_fbFmtMin(vpg.history_config_m),
      failsafe_history_human:_fbFmtMin(vpg.failsafe_actual_m),
      configured_failsafe_human:_fbFmtMin(vpg.failsafe_config_m),
      journal_ratio_percent:vpg.history_config_m>0?(vpg.history_actual_m/vpg.history_config_m)*100:0,
      failsafe_ratio_percent:vpg.failsafe_config_m>0?(vpg.failsafe_actual_m/vpg.failsafe_config_m)*100:0,
    }]:[];
    const protected_vms=(zvm.vms||[]).map(vm=>({
      name:vm.name,
      status_label:_fbVpgStatus(vm.status,vm.status_desc),
      actual_rpo_human:_fbFmtRpo(vm.rpo_actual_s),
      iops:vm.iops,
      journal_size_human:_fbFmtJournal(vm.journal_mb),
    }));
    const active_alerts=(zvm.alerts||[]).filter(a=>!a.dismissed);
    const recent_events=(zvm.events||[]).slice(0,10).map(e=>({description:e.description,time:e.occurred_on,site:e.site,user:e.user}));
    out[key]={reachable:ok,label:zvm.name,vpgs,protected_vms,active_alerts,recent_events};
  }
  return out;
}

const TabZerto = (() => {
  const statusBar = document.getElementById("zvmStatusBar");
  const cardGrid = document.getElementById("zertoCardGrid");
  const ransomwareBanner = document.getElementById("ransomwareBanner");

  // Palabras clave que Zerto usa en sus alertas de cifrado anómalo
  const RANSOMWARE_KEYWORDS = [
    "encrypt", "ransomware", "abnormal encryption", "encryption behavior"
  ];

  function detectRansomware(data) {
    const allAlerts = [
      ...(data.remote?.active_alerts || []),
      ...(data.local?.active_alerts || []),
    ];
    return allAlerts.find((a) => {
      const desc = (a.description || "").toLowerCase();
      return RANSOMWARE_KEYWORDS.some((kw) => desc.includes(kw));
    }) || null;
  }

  function renderRansomwareBanner(triggerAlert) {
    if (!ransomwareBanner) return;
    if (!triggerAlert) {
      ransomwareBanner.style.display = "none";
      return;
    }

    const warningIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>
    </svg>`;

    ransomwareBanner.innerHTML = `
      ${warningIcon}
      <span>
        ⚠ POSSIBLE RANSOMWARE ATTACK DETECTED — CHECK EVENTS AND ALERTS IMMEDIATELY
        <span class="ransomware-banner__detail">${triggerAlert.description}</span>
      </span>
      ${warningIcon}
    `;
    ransomwareBanner.style.display = "flex";
  }

  function statusDot(ok) {
    return `<span class="status-dot ${ok ? "status-dot--ok" : "status-dot--error"}"></span>`;
  }

  function slaBadge(isMeetingSla, label) {
    const cls = isMeetingSla ? "badge--ok" : "badge--error";
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function vpgBlock(vpg) {
    return `
      <div class="zerto-vpg-block">
        <div class="zerto-stat-row">
          <div class="zerto-stat">
            <span class="zerto-stat__label">${I18n.t("zerto.vpgStatus")}</span>
            <span class="zerto-stat__value">${slaBadge(vpg.is_meeting_sla, vpg.status_label)}</span>
          </div>
          <div class="zerto-stat">
            <span class="zerto-stat__label">${I18n.t("zerto.actualRpo")}</span>
            <span class="zerto-stat__value">${vpg.actual_rpo_human}</span>
          </div>
        </div>
        ${progressRow(I18n.t("zerto.journalHistory"), vpg.journal_history_human, vpg.configured_journal_human, vpg.journal_ratio_percent)}
        ${progressRow(I18n.t("zerto.failsafeHistory"), vpg.failsafe_history_human, vpg.configured_failsafe_human, vpg.failsafe_ratio_percent)}
      </div>
    `;
  }

  function progressRow(label, value, configured, percent) {
    return `
      <div class="metric-row">
        <span class="metric-row__label" style="width:110px">${label}</span>
        <div class="metric-row__bar-track">
          <div class="metric-row__bar-fill" style="width:${Math.min(percent, 100)}%"></div>
        </div>
        <span class="metric-row__value">${value} / ${configured}</span>
      </div>
    `;
  }

  function vmsTable(vms) {
    if (!vms || vms.length === 0) {
      return `<p>${I18n.t("common.noData")}</p>`;
    }
    const rows = vms.map((vm) => `
      <tr>
        <td>${vm.name}</td>
        <td>${vm.status_label}</td>
        <td>${vm.actual_rpo_human}</td>
        <td>${vm.iops}</td>
        <td>${vm.journal_size_human}</td>
      </tr>
    `).join("");

    return `
      <table class="table">
        <thead><tr>
          <th>${I18n.t("zerto.colVm")}</th><th>${I18n.t("zerto.colStatus")}</th>
          <th>${I18n.t("zerto.colRpo")}</th><th>${I18n.t("zerto.colIops")}</th><th>${I18n.t("zerto.colJournal")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function alertsList(alerts) {
    if (!alerts || alerts.length === 0) {
      return `<p style="text-align:center;color:var(--text-muted)">${I18n.t("zerto.noAlerts")}</p>`;
    }
    return alerts.map((a) => `
      <div class="infra-status-check">
        <span>${a.description}</span>
        <span class="badge badge--warn">${a.level}</span>
      </div>
    `).join("");
  }

  function eventsTable(events) {
    if (!events || events.length === 0) {
      return `<p style="text-align:center;color:var(--text-muted)">${I18n.t("zerto.noEvents")}</p>`;
    }
    const rows = events.map((e) => `
      <tr>
        <td>${e.time ? new Date(e.time).toLocaleString() : "—"}</td>
        <td>${e.site || "—"}</td>
        <td>${e.description}</td>
        <td>${e.user}</td>
      </tr>
    `).join("");

    return `
      <table class="table">
        <thead><tr>
          <th>${I18n.t("zerto.colTime")}</th><th>${I18n.t("zerto.colSite")}</th>
          <th>${I18n.t("zerto.colDescription")}</th><th>${I18n.t("zerto.colUser")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function siteCard(site) {
    if (!site.reachable) {
      return `<div class="card"><h2>${statusDot(false)} ${site.label}</h2><p>${I18n.t("common.unreachable")}</p></div>`;
    }

    const vpgBlocks = site.vpgs.length > 0
      ? site.vpgs.map(vpgBlock).join("")
      : `<p>${I18n.t("common.noData")}</p>`;

    return `
      <div class="card">
        <h2>${statusDot(true)} ${site.label}</h2>
        ${vpgBlocks}
        <h2 style="margin-top:18px">${I18n.t("zerto.protectedVms")}</h2>
        ${vmsTable(site.protected_vms)}
        <h2 style="margin-top:18px">${I18n.t("zerto.activeAlerts")}</h2>
        ${alertsList(site.active_alerts)}
        <h2 style="margin-top:18px">${I18n.t("zerto.recentEvents")}</h2>
        ${eventsTable(site.recent_events)}
      </div>
    `;
  }

  async function loadAll() {
    try {
      const raw = await Api.zerto.data();
      const data = normalizeZertoData(raw);

      // Detecta alerta de ransomware ANTES de renderizar el resto
      renderRansomwareBanner(detectRansomware(data));

      statusBar.innerHTML = `
        <span>${statusDot(data.remote.reachable)} ${data.remote.label}</span>
        <span>${statusDot(data.local.reachable)} ${data.local.label}</span>
      `;

      cardGrid.innerHTML = `${siteCard(data.remote)}${siteCard(data.local)}`;
    } catch (err) {
      renderRansomwareBanner(null);
      statusBar.innerHTML = `<span>${statusDot(false)} ${I18n.t("common.unreachable")}</span>`;
      cardGrid.innerHTML = `<div class="card"><p>${I18n.t("common.unreachable")}</p></div>`;
      console.error("Error cargando datos de Zerto:", err);
    }
  }

  function init() {
    loadAll();
    document.addEventListener("i18n:changed", loadAll);
  }

  return { init, loadAll };
})();

document.addEventListener("DOMContentLoaded", TabZerto.init);
