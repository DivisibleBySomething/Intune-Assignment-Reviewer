// Module-level HTML escaper (used when pre-rendering hygiene HTML server-side)
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Export entry point ────────────────────────────────────────────────────────

export async function exportDashboard(apps, allGroups, hygieneData = null) {
  const options = await showExportOptions(hygieneData);
  if (!options) return; // user cancelled

  const html = generateExportHTML(
    apps,
    allGroups,
    options.includeHygiene ? hygieneData : null
  );
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `intune-dashboard-${date}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Export options modal ──────────────────────────────────────────────────────

function showExportOptions(hygieneData) {
  return new Promise((resolve) => {
    const hasHygiene = !!hygieneData;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:440px">
        <div class="modal-header">
          <span style="font-size:16px;font-weight:600">&#x1F4E5; Export Options</span>
          <button class="modal-close" id="exp-opt-close" title="Cancel">&#x2715;</button>
        </div>
        <div class="modal-body" style="padding:8px 24px 4px">
          <p style="margin:0 0 4px;color:var(--text-muted);font-size:13px">
            Choose what to include in your offline HTML export.
          </p>
          <div class="export-opt-item">
            <input type="checkbox" id="opt-base" checked disabled>
            <label for="opt-base">
              <strong>Dashboard, Apps &amp; Groups</strong>
              <span>Charts, six stat cards, app and group tables with filter pills and search</span>
            </label>
          </div>
          <div class="export-opt-item${hasHygiene ? "" : " opt-disabled"}">
            <input type="checkbox" id="opt-hygiene"${hasHygiene ? " checked" : " disabled"}>
            <label for="opt-hygiene">
              <strong>Hygiene Analysis</strong>
              <span>${
                hasHygiene
                  ? "Tenant health score, severity ratings, and expandable finding cards"
                  : "Open the Hygiene tab first to load this data, then export"
              }</span>
            </label>
          </div>
        </div>
        <div style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn btn-sm" id="exp-opt-cancel">Cancel</button>
          <button class="btn btn-sm btn-primary" id="exp-opt-go">Export</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const finish = (result) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    overlay.querySelector("#exp-opt-go").addEventListener("click", () => {
      const includeHygiene =
        hasHygiene && overlay.querySelector("#opt-hygiene").checked;
      finish({ includeHygiene });
    });
    overlay.querySelector("#exp-opt-cancel").addEventListener("click", () => finish(null));
    overlay.querySelector("#exp-opt-close").addEventListener("click",  () => finish(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(null);
    });
  });
}

// ── Hygiene pre-rendering (runs in module context, not in the export browser) ─

function scoreLabel(score) {
  if (score >= 90) return { label: "Excellent", cls: "excellent" };
  if (score >= 70) return { label: "Good",      cls: "good"      };
  if (score >= 50) return { label: "Fair",       cls: "fair"      };
  return               { label: "Needs Attention", cls: "poor"    };
}

function buildFindingCard(f) {
  const severityCls   = { high: "badge-required", medium: "badge-warning", low: "badge-info" };
  const severityLabel = { high: "High",            medium: "Medium",        low: "Low" };

  const itemRows = f.items.map((item) =>
    `<div class="finding-item">
      <div class="finding-item-name">${escHtml(item.name)}</div>
      ${item.sub ? `<div class="finding-item-sub">${escHtml(item.sub)}</div>` : ""}
    </div>`
  ).join("");

  return `
    <div class="finding-card">
      <div class="finding-header">
        <div class="finding-header-left">
          <span class="badge ${severityCls[f.severity]}">${severityLabel[f.severity]}</span>
          <span class="finding-category">${escHtml(f.category)}</span>
          <span class="finding-title">${escHtml(f.title)}</span>
        </div>
        <div class="finding-header-right">
          <span class="finding-count-badge">${f.count}</span>
          <button class="finding-toggle" aria-expanded="false" title="Show affected items">
            <svg class="finding-chevron" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </button>
        </div>
      </div>
      <p class="finding-desc">${escHtml(f.description)}</p>
      <p class="finding-rec">&#x1F4A1; ${escHtml(f.recommendation)}</p>
      <div class="finding-items">
        <div class="finding-items-inner">${itemRows}</div>
      </div>
    </div>`;
}

function buildHygieneSection(data) {
  const { score, findings, totals } = data;
  const { label, cls } = scoreLabel(score);
  const totalIssues = findings.reduce((s, f) => s + f.count, 0);

  const totalsHtml = [
    ["Apps",                totals.apps],
    ["Config Profiles",     totals.configProfiles],
    ["Compliance Policies", totals.compliancePolicies],
    ["Groups",              totals.groups],
  ].map(([lbl, n]) => `
    <div class="hygiene-total-item">
      <span class="hygiene-total-num">${n.toLocaleString()}</span>
      <span class="hygiene-total-label">${lbl}</span>
    </div>`).join("");

  const findingsHtml = findings.length === 0
    ? `<div class="hygiene-clean">
         <svg viewBox="0 0 24 24" width="24" height="24" fill="var(--available)">
           <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
         </svg>
         All hygiene checks passed \u2014 nothing to clean up.
       </div>`
    : `<div class="findings-list">${findings.map(buildFindingCard).join("")}</div>`;

  return `
    <div class="hygiene-overview card">
      <div class="hygiene-score-wrap">
        <div class="hygiene-score-ring score-${cls}" style="--score:${score}">
          <div class="hygiene-score-inner">
            <div class="hygiene-score-num">${score}</div>
            <div class="hygiene-score-status">${escHtml(label)}</div>
          </div>
        </div>
      </div>
      <div class="hygiene-overview-info">
        <h2 style="margin:0 0 6px;font-size:18px;font-weight:600">Tenant Hygiene Score</h2>
        <p style="margin:0 0 20px;color:var(--text-muted)">
          ${totalIssues === 0
            ? "No issues detected \u2014 your tenant looks clean!"
            : `${totalIssues} issue${totalIssues !== 1 ? "s" : ""} found across ${findings.length} categor${findings.length !== 1 ? "ies" : "y"}.`}
        </p>
        <div class="hygiene-totals">${totalsHtml}</div>
      </div>
    </div>
    ${findingsHtml}`;
}

// ── HTML generation ───────────────────────────────────────────────────────────

function generateExportHTML(apps, allGroups, hygieneData) {
  const json = JSON.stringify({ apps, allGroups });

  const hygieneTabBtn = hygieneData
    ? `<button class="tab" data-tab="hygiene">&#x1F6E1;&#xFE0F; Hygiene</button>`
    : "";

  const hygieneSection = hygieneData
    ? `\n  <!-- Hygiene section -->\n  <div class="tab-section hidden" id="tab-hygiene">\n    ${buildHygieneSection(hygieneData)}\n  </div>`
    : "";

  // Extra CSS blocks only added when hygiene is included
  const hygieneCss = hygieneData ? `
/* ── Hygiene ── */
.hygiene-overview{display:flex;align-items:center;gap:32px;flex-wrap:wrap}
.hygiene-score-wrap{flex-shrink:0}
.hygiene-score-ring{width:148px;height:148px;border-radius:50%;background:conic-gradient(var(--ring-color,var(--primary)) calc(var(--score,0) * 1%),#e0e0e0 0);display:flex;align-items:center;justify-content:center}
.score-excellent{--ring-color:#107c10}.score-good{--ring-color:#0078d4}.score-fair{--ring-color:#ca5010}.score-poor{--ring-color:#d13438}
.hygiene-score-inner{width:114px;height:114px;border-radius:50%;background:var(--card-bg);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.hygiene-score-num{font-size:36px;font-weight:700;line-height:1}
.hygiene-score-status{font-size:12px;color:var(--text-muted);margin-top:4px}
.hygiene-overview-info{flex:1;min-width:240px}
.hygiene-totals{display:flex;gap:24px;flex-wrap:wrap}
.hygiene-total-item{display:flex;flex-direction:column;align-items:center;background:var(--bg);border-radius:var(--radius);padding:10px 16px;min-width:80px;text-align:center}
.hygiene-total-num{font-size:22px;font-weight:700;color:var(--primary);line-height:1}
.hygiene-total-label{font-size:11px;color:var(--text-muted);margin-top:4px;white-space:nowrap}
.hygiene-clean{display:flex;align-items:center;gap:10px;background:#dff6dd;border:1px solid #107c10;border-radius:var(--radius);padding:16px 20px;color:#107c10;font-weight:500;font-size:14px}
.findings-list{display:flex;flex-direction:column;gap:12px}
.finding-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.finding-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;flex-wrap:wrap}
.finding-header-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.finding-category{font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;font-weight:600}
.finding-title{font-size:14px;font-weight:600;color:var(--text)}
.finding-header-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.finding-count-badge{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;border-radius:14px;background:var(--bg);border:1px solid var(--border);font-size:13px;font-weight:700;color:var(--text);padding:0 8px}
.finding-toggle{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:var(--radius);border:1px solid var(--border);background:var(--card-bg);cursor:pointer;color:var(--text-muted);transition:background .15s,color .15s}
.finding-toggle:hover{background:var(--bg);color:var(--text)}
.finding-chevron{transition:transform .2s;display:block}
.finding-desc{margin:0;padding:0 16px 6px;font-size:13px;color:var(--text-muted);line-height:1.5}
.finding-rec{margin:0;padding:0 16px 14px;font-size:12px;color:var(--text-muted);line-height:1.5}
.finding-items{display:none;border-top:1px solid var(--border);background:#faf9f8;max-height:320px;overflow-y:auto}
.finding-items.open{display:block}
.finding-items-inner{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1px;background:var(--border)}
.finding-item{background:#faf9f8;padding:10px 14px}
.finding-item-name{font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.finding-item-sub{font-size:11px;color:var(--text-muted);margin-top:2px}
.badge-warning{background:#fff4ce;color:#835b00}
.badge-info{background:#e8f4fd;color:#004578}
@media(max-width:768px){.hygiene-overview{flex-direction:column;align-items:flex-start}.hygiene-score-ring{width:120px;height:120px}.hygiene-score-inner{width:90px;height:90px}.hygiene-score-num{font-size:28px}.hygiene-totals{gap:12px}}
` : "";

  // Extra JS only added when hygiene is included
  const hygieneJs = hygieneData ? `
/* ── Hygiene finding toggles ── */
document.querySelectorAll('.finding-toggle').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var card  = btn.closest('.finding-card');
    var items = card.querySelector('.finding-items');
    var open  = items.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    btn.querySelector('.finding-chevron').style.transform = open ? 'rotate(180deg)' : '';
  });
});
` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Intune Assignment Dashboard \u2014 Export</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
<style>
:root{--primary:#0078d4;--primary-dark:#005a9e;--bg:#f3f2f1;--card-bg:#fff;--border:#e0e0e0;--text:#323130;--text-muted:#605e5c;--radius:6px;--shadow:0 2px 8px rgba(0,0,0,.1);--available:#107c10}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;color:var(--text);background:var(--bg)}
/* ── header ── */
header{background:var(--card-bg);border-bottom:1px solid var(--border);padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:56px;position:sticky;top:0;z-index:100;gap:12px}
.header-left{display:flex;align-items:center;gap:10px}
.header-left h1{margin:0;font-size:18px;font-weight:600;color:var(--primary)}
.header-right{display:flex;align-items:center;gap:12px;flex-shrink:0}
.export-badge{background:#dff6dd;color:#107c10;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:600}
.btn-ghost{background:none;border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer;color:var(--text);display:inline-flex;align-items:center;gap:6px;transition:background .15s}
.btn-ghost:hover{background:#f3f2f1}
/* ── tabs ── */
.tabs-bar{background:var(--card-bg);border-bottom:1px solid var(--border);padding:0 24px;display:flex}
.tab{background:none;border:none;border-bottom:3px solid transparent;padding:14px 20px;font-size:14px;font-weight:500;cursor:pointer;color:var(--text-muted);transition:color .15s,border-color .15s;white-space:nowrap}
.tab:hover{color:var(--text)}
.tab.active{color:var(--primary);border-bottom-color:var(--primary)}
/* ── layout ── */
.content{padding:24px;display:flex;flex-direction:column;gap:24px;max-width:1400px;margin:0 auto}
.tab-section{display:flex;flex-direction:column;gap:20px}
/* ── stat cards ── */
.stat-cards{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
.stat-card{background:var(--card-bg);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);display:flex;align-items:center;gap:16px}
.stat-card-clickable{cursor:pointer;transition:transform .15s,box-shadow .15s}
.stat-card-clickable:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.14)}
.stat-icon{width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.stat-icon svg{width:24px;height:24px;fill:#fff}
.stat-icon.blue{background:#0078d4}.stat-icon.red{background:#d13438}.stat-icon.indigo{background:#5c2d91}.stat-icon.teal{background:#008272}.stat-icon.orange{background:#ca5010}
.stat-value{font-size:28px;font-weight:700;line-height:1;margin-bottom:4px}
.stat-label{font-size:13px;color:var(--text-muted)}
/* ── charts ── */
.charts-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.chart-card{background:var(--card-bg);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow)}
.chart-card h3{margin:0 0 16px;font-size:14px;font-weight:600}
.chart-container{position:relative;height:260px}
/* ── page header ── */
.page-hdr{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.page-hdr h2{margin:0;font-size:18px;font-weight:600}
.search-input{padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;width:280px;outline:none;transition:border-color .15s}
.search-input:focus{border-color:var(--primary)}
/* ── filter pills ── */
.filter-pills{display:flex;gap:8px;flex-wrap:wrap}
.filter-pill{background:var(--card-bg);border:1px solid var(--border);border-radius:20px;padding:5px 14px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
.filter-pill:hover{border-color:#999}
.filter-pill.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.filter-pill-count{background:rgba(0,0,0,.15);border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600}
.filter-pill.active .filter-pill-count{background:rgba(255,255,255,.25)}
/* ── table ── */
.table-wrap{background:var(--card-bg);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
table{width:100%;border-collapse:collapse}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);font-size:13px}
th{background:#f8f7f6;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.3px;color:var(--text-muted)}
tr:last-child td{border-bottom:none}
tr:hover td{background:#faf9f8}
.t-name{font-weight:500}
.t-sub{font-size:12px;color:var(--text-muted);margin-top:2px}
/* ── badges ── */
.badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;white-space:nowrap}
.badge-required{background:#fde7e9;color:#d13438}
.badge-available{background:#dff6dd;color:#107c10}
.badge-uninstall{background:#f3f2f1;color:#605e5c}
.intent-count{font-size:12px;color:var(--text-muted)}
/* ── links / buttons ── */
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline}
.btn-sm{display:inline-flex;align-items:center;padding:4px 10px;border:1px solid var(--border);border-radius:4px;font-size:12px;color:var(--text);background:var(--card-bg);white-space:nowrap;text-decoration:none;cursor:pointer;transition:background .15s}
.btn-sm:hover{background:#f3f2f1;text-decoration:none}
/* ── modal ── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}
.modal-card{background:var(--card-bg);border-radius:8px;width:100%;max-width:560px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.2)}
.modal-card-lg{max-width:660px}
.modal-header{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--border);flex-shrink:0}
.modal-header span{font-size:18px;font-weight:600}
.modal-close{background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-muted);padding:4px 8px;border-radius:4px;line-height:1}
.modal-close:hover{background:#f3f2f1;color:var(--text)}
.modal-body{overflow-y:auto;padding:20px 24px}
/* ── changelog ── */
.cl-entry{margin-bottom:24px}
.cl-entry:last-child{margin-bottom:0}
.cl-header{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.cl-emoji{font-size:24px;flex-shrink:0}
.cl-meta{display:flex;flex-direction:column;gap:2px}
.cl-name{font-weight:600;font-size:15px}
.cl-date{font-size:12px;color:var(--text-muted)}
.cl-list{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:5px;color:var(--text-muted);font-size:13px}
.cl-list li{line-height:1.5}
/* ── utils ── */
.hidden{display:none!important}
@media(max-width:1100px){.stat-cards{grid-template-columns:repeat(3,1fr)}.charts-row{grid-template-columns:1fr 1fr}}
@media(max-width:700px){.stat-cards{grid-template-columns:repeat(2,1fr)}.charts-row{grid-template-columns:1fr}.page-hdr{flex-direction:column;align-items:flex-start}.search-input{width:100%}}
${hygieneCss}
</style>
</head>
<body>

<header>
  <div class="header-left">
    <h1>&#x1F4BB; Intune Assignment Dashboard</h1>
  </div>
  <div class="header-right">
    <button class="btn-ghost" id="whats-new-btn">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
      What&#x2019;s New
    </button>
    <span class="export-badge">&#x1F4E5; Offline Export</span>
  </div>
</header>

<div class="tabs-bar">
  <button class="tab active" data-tab="dashboard">Dashboard</button>
  <button class="tab" data-tab="apps">All Apps</button>
  <button class="tab" data-tab="groups">All Groups</button>
  ${hygieneTabBtn}
</div>

<div class="content">

  <!-- Dashboard section -->
  <div class="tab-section" id="tab-dashboard">
    <div class="stat-cards" id="stat-cards"></div>
    <div class="charts-row">
      <div class="chart-card"><h3>Apps by Type</h3><div class="chart-container"><canvas id="chart-types"></canvas></div></div>
      <div class="chart-card"><h3>Assignments by Intent</h3><div class="chart-container"><canvas id="chart-intents"></canvas></div></div>
      <div class="chart-card"><h3>Top 10 Groups</h3><div class="chart-container"><canvas id="chart-groups"></canvas></div></div>
    </div>
  </div>

  <!-- All Apps section -->
  <div class="tab-section hidden" id="tab-apps">
    <div class="page-hdr">
      <h2>All Apps</h2>
      <input type="text" class="search-input" id="apps-search" placeholder="Search apps&#x2026;">
    </div>
    <div class="filter-pills" id="apps-filter-pills"></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>App</th><th>Status</th><th>Intent</th><th>Groups</th><th>Link</th></tr></thead>
        <tbody id="apps-tbody"></tbody>
      </table>
    </div>
  </div>

  <!-- All Groups section -->
  <div class="tab-section hidden" id="tab-groups">
    <div class="page-hdr">
      <h2>All Groups</h2>
      <input type="text" class="search-input" id="groups-search" placeholder="Search groups&#x2026;">
    </div>
    <div class="filter-pills" id="groups-filter-pills"></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Group</th><th>Status</th><th>Required</th><th>Available</th><th>Uninstall</th><th>Link</th></tr></thead>
        <tbody id="groups-tbody"></tbody>
      </table>
    </div>
  </div>
  ${hygieneSection}
</div><!-- .content -->

<!-- What's New modal -->
<div class="modal-overlay hidden" id="changelog-modal">
  <div class="modal-card modal-card-lg">
    <div class="modal-header">
      <span>&#x2728; What&#x2019;s New</span>
      <button class="modal-close" id="changelog-close" title="Close">&#x2715;</button>
    </div>
    <div class="modal-body" id="changelog-body"></div>
  </div>
</div>

<script>
const EMBEDDED_DATA = ${json};

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function renderBadge(intent) {
  var cls = intent === 'required' ? 'badge-required'
          : intent === 'available' ? 'badge-available'
          : 'badge-uninstall';
  return '<span class="badge ' + cls + '">' + esc(intent) + '</span>';
}

/* ── Tab switching ────────────────────────────────────────────────────────── */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-section').forEach(function(s) {
    s.classList.toggle('hidden', s.id !== 'tab-' + name);
  });
}
document.querySelectorAll('.tab').forEach(function(t) {
  t.addEventListener('click', function() { switchTab(t.dataset.tab); });
});

/* ── Group stats ─────────────────────────────────────────────────────────── */
var _groupStatsCache = null;
function getGroupStats() {
  if (_groupStatsCache) return _groupStatsCache;
  var apps = EMBEDDED_DATA.apps;
  var allGroups = EMBEDDED_DATA.allGroups;
  var stats = new Map();
  allGroups.forEach(function(g) {
    stats.set(g.id, { id: g.id, name: g.displayName, required: 0, available: 0, uninstall: 0, total: 0, isBuiltIn: false });
  });
  apps.forEach(function(app) {
    app.assignments.forEach(function(a) {
      if (a.groupId === 'ALL_USERS' && !stats.has('ALL_USERS'))
        stats.set('ALL_USERS', { id: 'ALL_USERS', name: 'All Users', required: 0, available: 0, uninstall: 0, total: 0, isBuiltIn: true });
      if (a.groupId === 'ALL_DEVICES' && !stats.has('ALL_DEVICES'))
        stats.set('ALL_DEVICES', { id: 'ALL_DEVICES', name: 'All Devices', required: 0, available: 0, uninstall: 0, total: 0, isBuiltIn: true });
      var entry = stats.get(a.groupId);
      if (entry) {
        if (a.intent in entry) entry[a.intent]++;
        entry.total++;
      }
    });
  });
  _groupStatsCache = Array.from(stats.values()).sort(function(a, b) {
    if (a.isBuiltIn !== b.isBuiltIn) return a.isBuiltIn ? -1 : 1;
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });
  return _groupStatsCache;
}

/* ── Stat cards ──────────────────────────────────────────────────────────── */
function renderStats() {
  var apps = EMBEDDED_DATA.apps;
  var allGroups = EMBEDDED_DATA.allGroups;
  var totalApps        = apps.length;
  var unassignedApps   = apps.filter(function(a) { return !a.isAssigned; }).length;
  var totalAssignments = apps.reduce(function(s, a) { return s + a.assignments.length; }, 0);
  var allUsersApps     = apps.filter(function(a) { return a.assignments.some(function(x) { return x.groupId === 'ALL_USERS'; }); }).length;
  var allDevicesApps   = apps.filter(function(a) { return a.assignments.some(function(x) { return x.groupId === 'ALL_DEVICES'; }); }).length;
  var assignedGroupIds = new Set(apps.flatMap(function(a) { return a.assignments.map(function(x) { return x.groupId; }); }));
  var unassignedGroups = allGroups.filter(function(g) { return !assignedGroupIds.has(g.id); }).length;

  var cards = [
    { label:'Total Apps',         value:totalApps,        cls:'blue',   tab:'apps',   filter:'all',
      icon:'<svg viewBox="0 0 24 24"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>' },
    { label:'Unassigned Apps',    value:unassignedApps,   cls:'red',    tab:'apps',   filter:'unassigned',
      icon:'<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>' },
    { label:'Total Assignments',  value:totalAssignments, cls:'indigo', tab:'apps',   filter:'assigned',
      icon:'<svg viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>' },
    { label:'All Users Apps',     value:allUsersApps,     cls:'teal',   tab:'apps',   filter:'all-users',
      icon:'<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>' },
    { label:'All Devices Apps',   value:allDevicesApps,   cls:'orange', tab:'apps',   filter:'all-devices',
      icon:'<svg viewBox="0 0 24 24"><path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z"/></svg>' },
    { label:'Unassigned Groups',  value:unassignedGroups, cls:'red',    tab:'groups', filter:'unassigned',
      icon:'<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' },
  ];

  document.getElementById('stat-cards').innerHTML = cards.map(function(c) {
    return '<div class="stat-card stat-card-clickable" data-tab="' + c.tab + '" data-filter="' + c.filter + '" title="View ' + esc(c.label) + '">' +
      '<div class="stat-icon ' + c.cls + '">' + c.icon + '</div>' +
      '<div><div class="stat-value">' + c.value.toLocaleString() + '</div><div class="stat-label">' + esc(c.label) + '</div></div>' +
      '</div>';
  }).join('');

  document.querySelectorAll('.stat-card-clickable').forEach(function(card) {
    card.addEventListener('click', function() {
      switchTab(card.dataset.tab);
      if (card.dataset.tab === 'apps')   setAppFilter(card.dataset.filter);
      if (card.dataset.tab === 'groups') setGroupFilter(card.dataset.filter);
    });
  });
}

/* ── Charts ──────────────────────────────────────────────────────────────── */
function renderCharts() {
  var apps = EMBEDDED_DATA.apps;
  var typeCounts   = {};
  var intentCounts = { required:0, available:0, uninstall:0, other:0 };
  var groupCounts  = {};
  apps.forEach(function(app) {
    typeCounts[app.appType] = (typeCounts[app.appType] || 0) + 1;
    app.assignments.forEach(function(a) {
      var k = a.intent in intentCounts ? a.intent : 'other';
      intentCounts[k]++;
      var gk = a.groupName || a.groupId;
      groupCounts[gk] = (groupCounts[gk] || 0) + 1;
    });
  });
  var typeLabels = Object.keys(typeCounts);
  var palette = ['#0078d4','#5c2d91','#008272','#ca5010','#107c10','#a80000','#8a8886'];
  new Chart(document.getElementById('chart-types'), {
    type: 'doughnut',
    data: { labels: typeLabels, datasets: [{ data: typeLabels.map(function(k){ return typeCounts[k]; }), backgroundColor: palette.slice(0,typeLabels.length), borderWidth:2, borderColor:'#fff' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{ size:12 } } } } }
  });
  new Chart(document.getElementById('chart-intents'), {
    type: 'bar',
    data: { labels:['Required','Available','Uninstall','Other'], datasets:[{ label:'Assignments', data:[intentCounts.required,intentCounts.available,intentCounts.uninstall,intentCounts.other], backgroundColor:['#d13438','#107c10','#605e5c','#8a8886'], borderRadius:4 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
  });
  var top10 = Object.entries(groupCounts).sort(function(a,b){ return b[1]-a[1]; }).slice(0,10);
  new Chart(document.getElementById('chart-groups'), {
    type: 'bar',
    data: { labels:top10.map(function(x){ return x[0]; }), datasets:[{ label:'Assignments', data:top10.map(function(x){ return x[1]; }), backgroundColor:'#0078d4', borderRadius:4 }] },
    options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
  });
}

/* ── All Apps ─────────────────────────────────────────────────────────────── */
var APP_FILTERS = [
  { id:'all',         label:'All' },
  { id:'assigned',    label:'Assigned' },
  { id:'unassigned',  label:'Unassigned' },
  { id:'all-users',   label:'All Users' },
  { id:'all-devices', label:'All Devices' },
];
var currentAppFilter = 'all';
var appSearchQuery   = '';

function filterApps(apps, filter) {
  switch (filter) {
    case 'assigned':    return apps.filter(function(a){ return a.isAssigned; });
    case 'unassigned':  return apps.filter(function(a){ return !a.isAssigned; });
    case 'all-users':   return apps.filter(function(a){ return a.assignments.some(function(x){ return x.groupId==='ALL_USERS'; }); });
    case 'all-devices': return apps.filter(function(a){ return a.assignments.some(function(x){ return x.groupId==='ALL_DEVICES'; }); });
    default:            return apps;
  }
}
function setAppFilter(filter) { currentAppFilter=filter; renderAppPills(); renderAppsTable(); }

function renderAppPills() {
  var apps=EMBEDDED_DATA.apps, counts={};
  APP_FILTERS.forEach(function(f){ counts[f.id]=filterApps(apps,f.id).length; });
  document.getElementById('apps-filter-pills').innerHTML = APP_FILTERS.map(function(f){
    return '<button class="filter-pill'+(f.id===currentAppFilter?' active':'')+'" data-filter="'+f.id+'">'+esc(f.label)+'<span class="filter-pill-count">'+counts[f.id]+'</span></button>';
  }).join('');
  document.querySelectorAll('#apps-filter-pills .filter-pill').forEach(function(btn){
    btn.addEventListener('click', function(){ setAppFilter(btn.dataset.filter); });
  });
}

function renderAppsTable() {
  var filtered = filterApps(EMBEDDED_DATA.apps, currentAppFilter);
  if (appSearchQuery) {
    var q=appSearchQuery.toLowerCase();
    filtered=filtered.filter(function(a){ return a.appName.toLowerCase().indexOf(q)!==-1; });
  }
  var tbody=document.getElementById('apps-tbody');
  if (!filtered.length) {
    tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No apps match the current filter.</td></tr>';
    return;
  }
  tbody.innerHTML=filtered.map(function(app){
    var statusBadge=app.isAssigned?'<span class="badge badge-available">Assigned</span>':'<span class="badge badge-uninstall">Unassigned</span>';
    var ic={required:0,available:0,uninstall:0};
    app.assignments.forEach(function(a){ if(a.intent in ic) ic[a.intent]++; });
    var intentBadges=app.assignments.length
      ?Object.entries(ic).filter(function(e){ return e[1]>0; }).map(function(e){ return renderBadge(e[0])+' <span class="intent-count">'+e[1]+'</span>'; }).join(' ')
      :'<span style="color:var(--text-muted)">\u2014</span>';
    var groupCount=app.assignments.length
      ?'<span>'+app.assignments.length+' group'+(app.assignments.length!==1?'s':'')+'</span>'
      :'<span style="color:var(--text-muted)">\u2014</span>';
    return '<tr>'+
      '<td><div class="t-name">'+esc(app.appName)+'</div><div class="t-sub">'+esc(app.appType)+(app.publisher?' \xB7 '+esc(app.publisher):'')+' </div></td>'+
      '<td>'+statusBadge+'</td>'+
      '<td>'+intentBadges+'</td>'+
      '<td>'+groupCount+'</td>'+
      '<td><a href="https://intune.microsoft.com/#view/Microsoft_Intune_Apps/SettingsMenu/~/0/appId/'+encodeURIComponent(app.appId)+'" target="_blank" rel="noopener" class="btn-sm">Open &#x2197;</a></td>'+
      '</tr>';
  }).join('');
}

document.getElementById('apps-search').addEventListener('input', function(e){
  appSearchQuery=e.target.value.trim(); renderAppsTable();
});

/* ── All Groups ───────────────────────────────────────────────────────────── */
var GROUP_FILTERS = [
  { id:'all',        label:'All' },
  { id:'assigned',   label:'Assigned' },
  { id:'unassigned', label:'Unassigned' },
];
var currentGroupFilter='all';
var groupSearchQuery='';

function filterGroups(groups, filter) {
  switch (filter) {
    case 'assigned':   return groups.filter(function(g){ return g.total>0; });
    case 'unassigned': return groups.filter(function(g){ return g.total===0 && !g.isBuiltIn; });
    default:           return groups;
  }
}
function setGroupFilter(filter) { currentGroupFilter=filter; renderGroupPills(); renderGroupsTable(); }

function renderGroupPills() {
  var groups=getGroupStats(), counts={};
  GROUP_FILTERS.forEach(function(f){ counts[f.id]=filterGroups(groups,f.id).length; });
  document.getElementById('groups-filter-pills').innerHTML=GROUP_FILTERS.map(function(f){
    return '<button class="filter-pill'+(f.id===currentGroupFilter?' active':'')+'" data-filter="'+f.id+'">'+esc(f.label)+'<span class="filter-pill-count">'+counts[f.id]+'</span></button>';
  }).join('');
  document.querySelectorAll('#groups-filter-pills .filter-pill').forEach(function(btn){
    btn.addEventListener('click', function(){ setGroupFilter(btn.dataset.filter); });
  });
}

function renderGroupsTable() {
  var filtered=filterGroups(getGroupStats(), currentGroupFilter);
  if (groupSearchQuery) {
    var q=groupSearchQuery.toLowerCase();
    filtered=filtered.filter(function(g){ return g.name.toLowerCase().indexOf(q)!==-1; });
  }
  var tbody=document.getElementById('groups-tbody');
  if (!filtered.length) {
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No groups match the current filter.</td></tr>';
    return;
  }
  tbody.innerHTML=filtered.map(function(g){
    var nameCell=g.isBuiltIn?esc(g.name)+' <span class="badge badge-available" style="font-size:10px">Built-in</span>':esc(g.name);
    var statusBadge=g.total===0?'<span class="badge badge-uninstall">Empty</span>':'<span class="badge badge-available">'+g.total+' app'+(g.total!==1?'s':'')+'</span>';
    var openBtn=g.isBuiltIn?'<span style="color:var(--text-muted);font-size:12px">Built-in</span>':'<a href="https://intune.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/'+encodeURIComponent(g.id)+'" target="_blank" rel="noopener" class="btn-sm">Open &#x2197;</a>';
    return '<tr>'+
      '<td>'+nameCell+'</td>'+
      '<td>'+statusBadge+'</td>'+
      '<td>'+(g.required>0?'<span class="badge badge-required">'+g.required+'</span>':'\u2014')+'</td>'+
      '<td>'+(g.available>0?'<span class="badge badge-available">'+g.available+'</span>':'\u2014')+'</td>'+
      '<td>'+(g.uninstall>0?'<span class="badge badge-uninstall">'+g.uninstall+'</span>':'\u2014')+'</td>'+
      '<td>'+openBtn+'</td>'+
      '</tr>';
  }).join('');
}

document.getElementById('groups-search').addEventListener('input', function(e){
  groupSearchQuery=e.target.value.trim(); renderGroupsTable();
});

/* ── What's New ───────────────────────────────────────────────────────────── */
var EXPORT_CHANGELOG = [
  {
    update: 'Exports Anonymous', date: 'April 2026', emoji: '\uD83D\uDCE5',
    items: [
      'Offline export now has three section tabs: Dashboard, All Apps, and All Groups',
      'Filter pills and search work on both the All Apps and All Groups tabs in the export',
      'All six stat cards are included and click through to the matching tab and filter',
      'Optionally include a full Hygiene Analysis tab with score ring and expandable findings',
      'Export options dialog lets you choose what to include before downloading',
      'What\u2019s New changelog is available in the export via a button in the header',
    ],
  },
  {
    update: 'Filter & Fixes', date: 'April 2026', emoji: '\uD83D\uDD27',
    items: [
      'Filter All Apps by status: All, Assigned, Unassigned, All Users, or All Devices',
      'Filter All Groups by All, Assigned, or Unassigned',
      'Dashboard stat cards are now clickable and navigate to filtered views',
      'Renamed \u201CEmpty Groups\u201D to \u201CUnassigned Groups\u201D for clarity',
      'Friendly error dialog for licensing and permission issues instead of raw error text',
      'Large tenant warning shown when hygiene analysis may take a long time (250+ groups)',
    ],
  },
  {
    update: 'Hygiene Update', date: 'April 2026', emoji: '\uD83D\uDEE1\uFE0F',
    items: [
      'New Tenant Hygiene tab with a 0\u2013100 health score',
      'Detects unassigned config profiles, compliance policies, apps, and empty groups',
      'Expandable finding cards with severity ratings and remediation recommendations',
      'Score displayed as a colour-coded ring: Excellent / Good / Fair / Needs Attention',
    ],
  },
  {
    update: 'Initial Release', date: 'April 2026', emoji: '\uD83D\uDE80',
    items: [
      'Dashboard overview with charts and six stat cards',
      'All Apps and All Groups pages with click-through detail views',
      'App search, group search, unassigned apps, and empty groups tabs',
      'Export to a standalone offline HTML report',
      '\u201CHow it works\u201D documentation on both the login screen and dashboard',
    ],
  },
];

function showChangelogModal() {
  document.getElementById('changelog-body').innerHTML = EXPORT_CHANGELOG.map(function(entry, i) {
    return '<div class="cl-entry">'+
      '<div class="cl-header">'+
        '<span class="cl-emoji">'+entry.emoji+'</span>'+
        '<div class="cl-meta"><span class="cl-name">'+esc(entry.update)+'</span><span class="cl-date">'+esc(entry.date)+'</span></div>'+
        (i===0?'<span class="badge badge-available" style="margin-left:auto;flex-shrink:0">Latest</span>':'')+
      '</div>'+
      '<ul class="cl-list">'+entry.items.map(function(item){ return '<li>'+esc(item)+'</li>'; }).join('')+'</ul>'+
      '</div>';
  }).join('');
  document.getElementById('changelog-modal').classList.remove('hidden');
}

document.getElementById('whats-new-btn').addEventListener('click', showChangelogModal);
document.getElementById('changelog-close').addEventListener('click', function(){
  document.getElementById('changelog-modal').classList.add('hidden');
});
document.getElementById('changelog-modal').addEventListener('click', function(e){
  if (e.target===e.currentTarget) e.currentTarget.classList.add('hidden');
});

${hygieneJs}
/* ── Initialise ───────────────────────────────────────────────────────────── */
renderStats();
renderCharts();
renderAppPills();
renderAppsTable();
renderGroupPills();
renderGroupsTable();
<\/script>
</body>
</html>`;
}
