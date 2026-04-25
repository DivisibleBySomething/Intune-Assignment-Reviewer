export function exportDashboard(data) {
  const html = generateExportHTML(data);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `intune-dashboard-${date}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateExportHTML(data) {
  const json = JSON.stringify(data);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Intune Assignment Dashboard — Export</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>
:root{--primary:#0078d4;--bg:#f3f2f1;--card-bg:#fff;--border:#e0e0e0;--text:#323130;--text-muted:#605e5c;--radius:6px;--shadow:0 2px 8px rgba(0,0,0,0.1)}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;color:var(--text);background:var(--bg)}
header{background:var(--card-bg);border-bottom:1px solid var(--border);padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:56px}
header h1{margin:0;font-size:18px;font-weight:600;color:var(--primary)}
.export-badge{background:#dff6dd;color:#107c10;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:600}
.content{padding:24px;display:flex;flex-direction:column;gap:24px;max-width:1400px;margin:0 auto}
.stat-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.stat-card{background:var(--card-bg);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);display:flex;align-items:center;gap:16px}
.stat-icon{width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.stat-icon svg{width:24px;height:24px;fill:white}
.stat-icon.blue{background:#0078d4}.stat-icon.indigo{background:#5c2d91}.stat-icon.teal{background:#008272}.stat-icon.orange{background:#ca5010}
.stat-value{font-size:28px;font-weight:700;line-height:1;margin-bottom:4px}
.stat-label{font-size:13px;color:var(--text-muted)}
.charts-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.chart-card{background:var(--card-bg);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow)}
.chart-card h3{margin:0 0 16px;font-size:14px;font-weight:600}
.chart-container{position:relative;height:260px}
.section-title{font-size:16px;font-weight:600;margin-bottom:12px}
table{width:100%;border-collapse:collapse;background:var(--card-bg);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);font-size:13px}
th{background:#f8f7f6;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.3px;color:var(--text-muted)}
tr:last-child td{border-bottom:none}
tr:hover td{background:#faf9f8}
.badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase}
.badge-required{background:#fde7e9;color:#d13438}
.badge-available{background:#dff6dd;color:#107c10}
.badge-uninstall{background:#f3f2f1;color:#605e5c}
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline}
.hidden{display:none!important}
@media(max-width:768px){.stat-cards{grid-template-columns:repeat(2,1fr)}.charts-row{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <h1>&#128187; Intune Assignment Dashboard</h1>
  <span class="export-badge">Offline Export</span>
</header>
<div class="content">
  <div class="stat-cards" id="stat-cards"></div>
  <div class="charts-row">
    <div class="chart-card"><h3>Apps by Type</h3><div class="chart-container"><canvas id="chart-types"></canvas></div></div>
    <div class="chart-card"><h3>Assignments by Intent</h3><div class="chart-container"><canvas id="chart-intents"></canvas></div></div>
    <div class="chart-card"><h3>Top 10 Groups</h3><div class="chart-container"><canvas id="chart-groups"></canvas></div></div>
  </div>
  <div>
    <div class="section-title">All App Assignments</div>
    <table id="assignment-table">
      <thead><tr><th>App</th><th>Type</th><th>Group</th><th>Intent</th></tr></thead>
      <tbody id="table-body"></tbody>
    </table>
  </div>
</div>
<script>
const EMBEDDED_DATA = ${json};

function esc(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function appLink(id,name){return '<a href="https://intune.microsoft.com/#view/Microsoft_Intune_Apps/SettingsMenu/~/0/appId/'+id+'" target="_blank">'+esc(name)+'</a>'}
function groupLink(id,name){if(id==='ALL_USERS'||id==='ALL_DEVICES')return esc(name);return '<a href="https://intune.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/'+id+'" target="_blank">'+esc(name)+'</a>'}
function badge(intent){const cls=intent==='required'?'badge-required':intent==='available'?'badge-available':'badge-uninstall';return '<span class="badge '+cls+'">'+esc(intent)+'</span>'}

function renderStats(data){
  const totalApps=data.length;
  const totalAssignments=data.reduce((s,a)=>s+a.assignments.length,0);
  const allUsersApps=data.filter(a=>a.assignments.some(x=>x.groupId==='ALL_USERS')).length;
  const allDevicesApps=data.filter(a=>a.assignments.some(x=>x.groupId==='ALL_DEVICES')).length;
  const stats=[
    {label:'Total Apps',value:totalApps,cls:'blue',icon:'<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>'},
    {label:'Total Assignments',value:totalAssignments,cls:'indigo',icon:'<svg viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>'},
    {label:'All Users Apps',value:allUsersApps,cls:'teal',icon:'<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>'},
    {label:'All Devices Apps',value:allDevicesApps,cls:'orange',icon:'<svg viewBox="0 0 24 24"><path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z"/></svg>'},
  ];
  document.getElementById('stat-cards').innerHTML=stats.map(s=>'<div class="stat-card"><div class="stat-icon '+s.cls+'">'+s.icon+'</div><div><div class="stat-value">'+s.value+'</div><div class="stat-label">'+s.label+'</div></div></div>').join('');
}

function renderCharts(data){
  const typeCounts={};
  const intentCounts={required:0,available:0,uninstall:0,other:0};
  const groupCounts={};
  for(const app of data){
    typeCounts[app.appType]=(typeCounts[app.appType]||0)+1;
    for(const a of app.assignments){
      const k=a.intent in intentCounts?a.intent:'other';
      intentCounts[k]++;
      const gk=a.groupName||a.groupId;
      groupCounts[gk]=(groupCounts[gk]||0)+1;
    }
  }
  const typeLabels=Object.keys(typeCounts);
  const typeData=typeLabels.map(k=>typeCounts[k]);
  new Chart(document.getElementById('chart-types'),{type:'doughnut',data:{labels:typeLabels,datasets:[{data:typeData,backgroundColor:['#0078d4','#5c2d91','#008272','#ca5010','#107c10','#a80000']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}});
  new Chart(document.getElementById('chart-intents'),{type:'bar',data:{labels:['Required','Available','Uninstall','Other'],datasets:[{label:'Assignments',data:[intentCounts.required,intentCounts.available,intentCounts.uninstall,intentCounts.other],backgroundColor:['#d13438','#107c10','#605e5c','#8a8886']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
  const top10=Object.entries(groupCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  new Chart(document.getElementById('chart-groups'),{type:'bar',data:{labels:top10.map(x=>x[0]),datasets:[{label:'Assignments',data:top10.map(x=>x[1]),backgroundColor:'#0078d4'}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
}

function renderTable(data){
  const rows=[];
  for(const app of data){
    for(const a of app.assignments){
      rows.push('<tr><td>'+appLink(app.appId,app.appName)+'</td><td>'+esc(app.appType)+'</td><td>'+groupLink(a.groupId,a.groupName)+'</td><td>'+badge(a.intent)+'</td></tr>');
    }
  }
  document.getElementById('table-body').innerHTML=rows.join('');
}

renderStats(EMBEDDED_DATA);
renderCharts(EMBEDDED_DATA);
renderTable(EMBEDDED_DATA);
<\/script>
</body>
</html>`;
}
