import { getToken } from "./auth.js";
import {
  fetchAssignedApps,
  fetchAppAssignments,
  resolveGroupNames,
} from "./graph.js";
import { normalizeAll, collectRealGroupIds } from "./normalize.js";
import { initSearch } from "./search.js";
import { exportDashboard } from "./export.js";

const CACHE_KEY = "intune_dashboard_data";
let chartInstances = {};
let currentData = null;

function getCachedData() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedData(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage full — proceed without caching
  }
}

function clearCache() {
  sessionStorage.removeItem(CACHE_KEY);
}

function setProgress(pct, label) {
  const container = document.getElementById("progress-container");
  const fill = document.getElementById("progress-bar-fill");
  const lbl = document.getElementById("progress-label");
  container.classList.remove("hidden");
  fill.style.width = `${pct}%`;
  if (lbl) lbl.textContent = label;
}

function hideProgress() {
  document.getElementById("progress-container").classList.add("hidden");
}

function showErrorBanner(msg) {
  const existing = document.getElementById("dash-error");
  if (existing) existing.remove();
  const banner = document.createElement("div");
  banner.id = "dash-error";
  banner.className = "dash-content";
  banner.innerHTML = `<div id="error-banner">${msg}</div>`;
  document.getElementById("dashboard-view").insertBefore(
    banner,
    document.querySelector(".dash-content")
  );
}

export async function loadDashboard(forceRefresh = false) {
  if (forceRefresh) clearCache();

  setProgress(5, "Checking cache…");

  const cached = getCachedData();
  if (cached) {
    hideProgress();
    renderDashboard(cached);
    return;
  }

  try {
    setProgress(10, "Acquiring access token…");
    const token = await getToken();

    setProgress(15, "Fetching app list…");
    const rawApps = await fetchAssignedApps(token);

    const assignmentsMap = new Map();
    const total = rawApps.length;

    for (let i = 0; i < total; i++) {
      const app = rawApps[i];
      const pct = 15 + Math.round(((i + 1) / total) * 55);
      setProgress(pct, `Fetching assignments (${i + 1}/${total})…`);
      const assignments = await fetchAppAssignments(app.id, token);
      assignmentsMap.set(app.id, assignments);
    }

    setProgress(72, "Resolving group names…");
    const groupIds = collectRealGroupIds(assignmentsMap);
    const groupNameMap = await resolveGroupNames(groupIds, token);

    setProgress(90, "Normalizing data…");
    const normalizedData = normalizeAll(rawApps, assignmentsMap, groupNameMap);

    setCachedData(normalizedData);
    setProgress(100, "Done!");

    setTimeout(() => {
      hideProgress();
      renderDashboard(normalizedData);
    }, 300);
  } catch (err) {
    hideProgress();
    console.error("Dashboard load failed:", err);
    showErrorBanner(`Failed to load data: ${err.message}`);
  }
}

function renderDashboard(data) {
  currentData = data;
  renderStatCards(data);
  renderCharts(data);
  initSearch(data);

  document.getElementById("refresh-btn").onclick = () =>
    loadDashboard(true);
  document.getElementById("export-btn").onclick = () =>
    exportDashboard(data);
}

function renderStatCards(data) {
  const totalApps = data.length;
  const totalAssignments = data.reduce((s, a) => s + a.assignments.length, 0);
  const allUsersApps = data.filter((a) =>
    a.assignments.some((x) => x.groupId === "ALL_USERS")
  ).length;
  const allDevicesApps = data.filter((a) =>
    a.assignments.some((x) => x.groupId === "ALL_DEVICES")
  ).length;

  const cards = [
    {
      id: "stat-total-apps",
      label: "Total Apps",
      value: totalApps,
      cls: "blue",
      icon: iconApps(),
    },
    {
      id: "stat-total-assignments",
      label: "Total Assignments",
      value: totalAssignments,
      cls: "indigo",
      icon: iconAssignments(),
    },
    {
      id: "stat-all-users",
      label: "All Users Apps",
      value: allUsersApps,
      cls: "teal",
      icon: iconUsers(),
    },
    {
      id: "stat-all-devices",
      label: "All Devices Apps",
      value: allDevicesApps,
      cls: "orange",
      icon: iconDevices(),
    },
  ];

  const container = document.getElementById("stat-cards");
  container.innerHTML = cards
    .map(
      (c) => `
    <div class="stat-card">
      <div class="stat-icon ${c.cls}">${c.icon}</div>
      <div>
        <div class="stat-value">${c.value.toLocaleString()}</div>
        <div class="stat-label">${c.label}</div>
      </div>
    </div>`
    )
    .join("");
}

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function renderCharts(data) {
  renderAppTypeChart(data);
  renderIntentChart(data);
  renderTopGroupsChart(data);
}

function renderAppTypeChart(data) {
  destroyChart("chart-app-types");
  const counts = {};
  for (const app of data) {
    counts[app.appType] = (counts[app.appType] ?? 0) + 1;
  }
  const labels = Object.keys(counts);
  const values = labels.map((k) => counts[k]);
  const colors = [
    "#0078d4", "#5c2d91", "#008272", "#ca5010",
    "#107c10", "#a80000", "#8a8886",
  ];
  const ctx = document.getElementById("chart-app-types").getContext("2d");
  chartInstances["chart-app-types"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 12 } } } },
    },
  });
}

function renderIntentChart(data) {
  destroyChart("chart-intents");
  const counts = { required: 0, available: 0, uninstall: 0, other: 0 };
  for (const app of data) {
    for (const a of app.assignments) {
      const k = a.intent in counts ? a.intent : "other";
      counts[k]++;
    }
  }
  const ctx = document.getElementById("chart-intents").getContext("2d");
  chartInstances["chart-intents"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Required", "Available", "Uninstall", "Other"],
      datasets: [
        {
          label: "Assignments",
          data: [counts.required, counts.available, counts.uninstall, counts.other],
          backgroundColor: ["#d13438", "#107c10", "#605e5c", "#8a8886"],
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function renderTopGroupsChart(data) {
  destroyChart("chart-top-groups");
  const counts = {};
  for (const app of data) {
    for (const a of app.assignments) {
      const key = a.groupName || a.groupId;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  const top10 = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const ctx = document.getElementById("chart-top-groups").getContext("2d");
  chartInstances["chart-top-groups"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: top10.map(([name]) => name),
      datasets: [
        {
          label: "Assignments",
          data: top10.map(([, count]) => count),
          backgroundColor: "#0078d4",
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

// SVG icons
function iconApps() {
  return `<svg viewBox="0 0 24 24"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>`;
}
function iconAssignments() {
  return `<svg viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>`;
}
function iconUsers() {
  return `<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;
}
function iconDevices() {
  return `<svg viewBox="0 0 24 24"><path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z"/></svg>`;
}
