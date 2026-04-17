import { getData } from "./store.js";
import { escapeHtml, renderBadge } from "./search.js";

const INTUNE_APP_URL = (id) =>
  `https://intune.microsoft.com/#view/Microsoft_Intune_Apps/SettingsMenu/~/0/appId/${id}`;
const AAD_GROUP_URL = (id) =>
  `https://intune.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${id}`;

export function initPages() {
  document.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
  });
}

export function navigateTo(page) {
  document.querySelectorAll("[data-page]").forEach((b) =>
    b.classList.toggle("active", b.dataset.page === page)
  );

  const mainContent = document.querySelector(".dash-content");
  document.querySelectorAll(".page-view").forEach((p) => p.classList.add("hidden"));

  if (page === "dashboard") {
    mainContent.classList.remove("hidden");
  } else {
    mainContent.classList.add("hidden");
    const view = document.getElementById(`page-${page}`);
    if (view) view.classList.remove("hidden");
    renderPage(page);
  }
}

function renderPage(page) {
  const { apps, allGroups } = getData();
  if (page === "apps") renderAppsPage(apps);
  if (page === "groups") renderGroupsPage(apps, allGroups);
}

// ── All Apps Page ─────────────────────────────────────────

function renderAppsPage(apps) {
  const container = document.getElementById("page-apps-content");
  const searchInput = document.getElementById("page-apps-search");

  const render = (query) => {
    const q = query.toLowerCase();
    const filtered = q ? apps.filter((a) => a.appName.toLowerCase().includes(q)) : apps;
    container.innerHTML = filtered.length ? filtered.map(appRow).join("") : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">No apps match "${escapeHtml(query)}"</td></tr>`;
  };

  searchInput.addEventListener("input", (e) => render(e.target.value.trim()));
  render("");
}

function appRow(app) {
  const intentCounts = { required: 0, available: 0, uninstall: 0 };
  const groupNames = [];
  for (const a of app.assignments) {
    if (a.intent in intentCounts) intentCounts[a.intent]++;
    groupNames.push(a.groupName);
  }

  const statusBadge = app.isAssigned
    ? `<span class="badge badge-available">Assigned</span>`
    : `<span class="badge badge-uninstall">Unassigned</span>`;

  const intentBadges = app.assignments.length
    ? Object.entries(intentCounts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${renderBadge(k)} <span class="intent-count">${v}</span>`)
        .join(" ")
    : `<span style="color:var(--text-muted);font-size:12px">—</span>`;

  const groupsCell = groupNames.length
    ? `<span class="groups-summary" title="${escapeHtml(groupNames.join(", "))}">${escapeHtml(groupNames.slice(0, 3).join(", "))}${groupNames.length > 3 ? ` +${groupNames.length - 3} more` : ""}</span>`
    : `<span style="color:var(--text-muted);font-size:12px">—</span>`;

  return `
    <tr>
      <td>
        <div class="table-app-name">${escapeHtml(app.appName)}</div>
        <div class="table-app-sub">${escapeHtml(app.appType)}${app.publisher ? ` · ${escapeHtml(app.publisher)}` : ""}</div>
      </td>
      <td>${statusBadge}</td>
      <td>${intentBadges}</td>
      <td>${groupsCell}</td>
      <td>
        <a href="${INTUNE_APP_URL(app.appId)}" target="_blank" rel="noopener" class="btn btn-sm">
          Open in Intune ↗
        </a>
      </td>
    </tr>`;
}

// ── All Groups Page ───────────────────────────────────────

function renderGroupsPage(apps, allGroups) {
  const container = document.getElementById("page-groups-content");
  const searchInput = document.getElementById("page-groups-search");

  // Build group stats
  const groupStats = buildGroupStats(apps, allGroups);

  const render = (query) => {
    const q = query.toLowerCase();
    const filtered = q
      ? groupStats.filter((g) => g.name.toLowerCase().includes(q))
      : groupStats;
    container.innerHTML = filtered.length
      ? filtered.map(groupRow).join("")
      : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No groups match "${escapeHtml(query)}"</td></tr>`;
  };

  searchInput.addEventListener("input", (e) => render(e.target.value.trim()));
  render("");
}

function buildGroupStats(apps, allGroups) {
  const stats = new Map();

  // Seed from all real groups
  for (const g of allGroups) {
    stats.set(g.id, { id: g.id, name: g.displayName, required: 0, available: 0, uninstall: 0, total: 0, isBuiltIn: false });
  }

  // Add virtual built-ins if used
  for (const app of apps) {
    for (const a of app.assignments) {
      if (a.groupId === "ALL_USERS" && !stats.has("ALL_USERS")) {
        stats.set("ALL_USERS", { id: "ALL_USERS", name: "All Users", required: 0, available: 0, uninstall: 0, total: 0, isBuiltIn: true });
      }
      if (a.groupId === "ALL_DEVICES" && !stats.has("ALL_DEVICES")) {
        stats.set("ALL_DEVICES", { id: "ALL_DEVICES", name: "All Devices", required: 0, available: 0, uninstall: 0, total: 0, isBuiltIn: true });
      }
      const entry = stats.get(a.groupId);
      if (entry) {
        if (a.intent in entry) entry[a.intent]++;
        entry.total++;
      }
    }
  }

  // Sort: built-ins first, then by total desc, then alpha
  return [...stats.values()].sort((a, b) => {
    if (a.isBuiltIn !== b.isBuiltIn) return a.isBuiltIn ? -1 : 1;
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });
}

function groupRow(g) {
  const nameCellContent = g.isBuiltIn
    ? `<span class="table-app-name">${escapeHtml(g.name)}</span><span class="badge badge-available" style="margin-left:6px;font-size:10px">Built-in</span>`
    : `<span class="table-app-name">${escapeHtml(g.name)}</span>`;

  const statusBadge = g.total === 0
    ? `<span class="badge badge-uninstall">Empty</span>`
    : `<span class="badge badge-available">${g.total} app${g.total !== 1 ? "s" : ""}</span>`;

  const openBtn = g.isBuiltIn
    ? `<span style="color:var(--text-muted);font-size:12px">Built-in</span>`
    : `<a href="${AAD_GROUP_URL(g.id)}" target="_blank" rel="noopener" class="btn btn-sm">Open in Portal ↗</a>`;

  return `
    <tr>
      <td>${nameCellContent}</td>
      <td>${statusBadge}</td>
      <td>${g.required > 0 ? `<span class="badge badge-required">${g.required}</span>` : "—"}</td>
      <td>${g.available > 0 ? `<span class="badge badge-available">${g.available}</span>` : "—"}</td>
      <td>${g.uninstall > 0 ? `<span class="badge badge-uninstall">${g.uninstall}</span>` : "—"}</td>
      <td>${openBtn}</td>
    </tr>`;
}
