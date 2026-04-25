import { getData } from "./store.js";
import { escapeHtml, renderBadge } from "./search.js";
import { loadHygienePage } from "./hygiene.js";

const INTUNE_APP_URL = (id) =>
  `https://intune.microsoft.com/#view/Microsoft_Intune_Apps/SettingsMenu/~/0/appId/${id}`;
const AAD_GROUP_URL = (id) =>
  `https://intune.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${id}`;

let _currentDetailId = null;

export function initPages() {
  document.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
  });

  // How it works modal
  document.getElementById("how-btn")?.addEventListener("click", () => {
    document.getElementById("how-modal").classList.remove("hidden");
  });
  document.getElementById("how-modal-close")?.addEventListener("click", () => {
    document.getElementById("how-modal").classList.add("hidden");
  });
  document.getElementById("how-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
  });
}

export function navigateTo(page, id = null) {
  _currentDetailId = id;

  // Update nav active state (only for top-level pages)
  const topLevel = ["dashboard", "apps", "groups", "hygiene"];
  if (topLevel.includes(page)) {
    document.querySelectorAll("[data-page]").forEach((b) =>
      b.classList.toggle("active", b.dataset.page === page)
    );
  }

  const mainContent = document.querySelector(".dash-content");
  document.querySelectorAll(".page-view").forEach((p) => p.classList.add("hidden"));

  if (page === "dashboard") {
    mainContent.classList.remove("hidden");
  } else {
    mainContent.classList.add("hidden");
    const view = document.getElementById(`page-${page}`);
    if (view) view.classList.remove("hidden");
    renderPage(page, id);
  }
}

function renderPage(page, id) {
  const { apps, allGroups } = getData();
  if (page === "apps")         renderAppsPage(apps);
  if (page === "groups")       renderGroupsPage(apps, allGroups);
  if (page === "app-detail")   renderAppDetail(id, apps);
  if (page === "group-detail") renderGroupDetail(id, apps, allGroups);
  if (page === "hygiene")      loadHygienePage(); // async, self-managing
}

// ── All Apps Page ─────────────────────────────────────────

function renderAppsPage(apps) {
  const container = document.getElementById("page-apps-content");
  const searchInput = document.getElementById("page-apps-search");
  searchInput.value = "";

  const render = (query) => {
    const q = query.toLowerCase();
    const filtered = q ? apps.filter((a) => a.appName.toLowerCase().includes(q)) : apps;
    if (!filtered.length) {
      container.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No apps match "${escapeHtml(query)}"</td></tr>`;
      return;
    }
    container.innerHTML = filtered.map((app) => appRow(app)).join("");
  };

  // Event delegation for row clicks
  container.onclick = (e) => {
    if (e.target.closest("a")) return; // don't intercept "Open in Intune" link
    const row = e.target.closest("tr[data-app-id]");
    if (row) navigateTo("app-detail", row.dataset.appId);
  };

  searchInput.addEventListener("input", (e) => render(e.target.value.trim()));
  render("");
}

function appRow(app) {
  const intentCounts = { required: 0, available: 0, uninstall: 0 };
  for (const a of app.assignments) {
    if (a.intent in intentCounts) intentCounts[a.intent]++;
  }

  const statusBadge = app.isAssigned
    ? `<span class="badge badge-available">Assigned</span>`
    : `<span class="badge badge-uninstall">Unassigned</span>`;

  const intentBadges = app.assignments.length
    ? Object.entries(intentCounts).filter(([, v]) => v > 0)
        .map(([k, v]) => `${renderBadge(k)} <span class="intent-count">${v}</span>`).join(" ")
    : `<span style="color:var(--text-muted);font-size:12px">—</span>`;

  const groupCount = app.assignments.length
    ? `<span class="groups-summary">${app.assignments.length} group${app.assignments.length !== 1 ? "s" : ""}</span>`
    : `<span style="color:var(--text-muted);font-size:12px">—</span>`;

  return `
    <tr data-app-id="${escapeHtml(app.appId)}" class="clickable-row">
      <td>
        <div class="table-app-name">${escapeHtml(app.appName)}</div>
        <div class="table-app-sub">${escapeHtml(app.appType)}${app.publisher ? ` · ${escapeHtml(app.publisher)}` : ""}</div>
      </td>
      <td>${statusBadge}</td>
      <td>${intentBadges}</td>
      <td>${groupCount}</td>
      <td>
        <a href="${INTUNE_APP_URL(app.appId)}" target="_blank" rel="noopener" class="btn btn-sm">
          Open in Intune ↗
        </a>
      </td>
    </tr>`;
}

// ── App Detail Page ───────────────────────────────────────

function renderAppDetail(appId, apps) {
  const app = apps.find((a) => a.appId === appId);
  if (!app) return;

  // Breadcrumb back button
  document.getElementById("app-detail-back").onclick = () => navigateTo("apps");

  document.getElementById("app-detail-title").textContent = app.appName;
  document.getElementById("app-detail-meta").innerHTML =
    `<span class="badge badge-available" style="font-size:12px">${escapeHtml(app.appType)}</span>` +
    (app.publisher ? ` <span style="color:var(--text-muted)">${escapeHtml(app.publisher)}</span>` : "");

  const openBtn = document.getElementById("app-detail-open");
  openBtn.href = INTUNE_APP_URL(app.appId);

  const tbody = document.getElementById("app-detail-assignments");
  if (!app.assignments.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px">No assignments</td></tr>`;
    return;
  }

  tbody.innerHTML = app.assignments.map((a) => {
    const groupCell = (a.groupId === "ALL_USERS" || a.groupId === "ALL_DEVICES")
      ? `<span>${escapeHtml(a.groupName)}</span> <span class="badge badge-available" style="font-size:10px">Built-in</span>`
      : `<a href="${AAD_GROUP_URL(a.groupId)}" target="_blank" rel="noopener">${escapeHtml(a.groupName)}</a>`;
    return `
      <tr>
        <td>${groupCell}</td>
        <td>${renderBadge(a.intent)}</td>
        <td>${a.isBuiltIn ? "Built-in" : "Azure AD Group"}</td>
      </tr>`;
  }).join("");
}

// ── All Groups Page ───────────────────────────────────────

function renderGroupsPage(apps, allGroups) {
  const container = document.getElementById("page-groups-content");
  const searchInput = document.getElementById("page-groups-search");
  searchInput.value = "";

  const groupStats = buildGroupStats(apps, allGroups);

  const render = (query) => {
    const q = query.toLowerCase();
    const filtered = q ? groupStats.filter((g) => g.name.toLowerCase().includes(q)) : groupStats;
    if (!filtered.length) {
      container.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No groups match "${escapeHtml(query)}"</td></tr>`;
      return;
    }
    container.innerHTML = filtered.map(groupRow).join("");
  };

  // Event delegation for row clicks
  container.onclick = (e) => {
    if (e.target.closest("a")) return;
    const row = e.target.closest("tr[data-group-id]");
    if (row) navigateTo("group-detail", row.dataset.groupId);
  };

  searchInput.addEventListener("input", (e) => render(e.target.value.trim()));
  render("");
}

function buildGroupStats(apps, allGroups) {
  const stats = new Map();
  for (const g of allGroups) {
    stats.set(g.id, { id: g.id, name: g.displayName, required: 0, available: 0, uninstall: 0, total: 0, isBuiltIn: false });
  }
  for (const app of apps) {
    for (const a of app.assignments) {
      if (a.groupId === "ALL_USERS" && !stats.has("ALL_USERS"))
        stats.set("ALL_USERS", { id: "ALL_USERS", name: "All Users", required: 0, available: 0, uninstall: 0, total: 0, isBuiltIn: true });
      if (a.groupId === "ALL_DEVICES" && !stats.has("ALL_DEVICES"))
        stats.set("ALL_DEVICES", { id: "ALL_DEVICES", name: "All Devices", required: 0, available: 0, uninstall: 0, total: 0, isBuiltIn: true });
      const entry = stats.get(a.groupId);
      if (entry) {
        if (a.intent in entry) entry[a.intent]++;
        entry.total++;
      }
    }
  }
  return [...stats.values()].sort((a, b) => {
    if (a.isBuiltIn !== b.isBuiltIn) return a.isBuiltIn ? -1 : 1;
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });
}

function groupRow(g) {
  const nameCell = g.isBuiltIn
    ? `<span class="table-app-name">${escapeHtml(g.name)}</span> <span class="badge badge-available" style="font-size:10px">Built-in</span>`
    : `<span class="table-app-name">${escapeHtml(g.name)}</span>`;

  const statusBadge = g.total === 0
    ? `<span class="badge badge-uninstall">Empty</span>`
    : `<span class="badge badge-available">${g.total} app${g.total !== 1 ? "s" : ""}</span>`;

  const openBtn = g.isBuiltIn
    ? `<span style="color:var(--text-muted);font-size:12px">Built-in</span>`
    : `<a href="${AAD_GROUP_URL(g.id)}" target="_blank" rel="noopener" class="btn btn-sm">Open in Portal ↗</a>`;

  return `
    <tr data-group-id="${escapeHtml(g.id)}" class="clickable-row">
      <td>${nameCell}</td>
      <td>${statusBadge}</td>
      <td>${g.required > 0 ? `<span class="badge badge-required">${g.required}</span>` : "—"}</td>
      <td>${g.available > 0 ? `<span class="badge badge-available">${g.available}</span>` : "—"}</td>
      <td>${g.uninstall > 0 ? `<span class="badge badge-uninstall">${g.uninstall}</span>` : "—"}</td>
      <td>${openBtn}</td>
    </tr>`;
}

// ── Group Detail Page ─────────────────────────────────────

function renderGroupDetail(groupId, apps, allGroups) {
  const isBuiltIn = groupId === "ALL_USERS" || groupId === "ALL_DEVICES";
  const groupName = isBuiltIn
    ? (groupId === "ALL_USERS" ? "All Users" : "All Devices")
    : allGroups.find((g) => g.id === groupId)?.displayName ?? groupId;

  document.getElementById("group-detail-back").onclick = () => navigateTo("groups");
  document.getElementById("group-detail-title").textContent = groupName;

  const metaEl = document.getElementById("group-detail-meta");
  metaEl.innerHTML = isBuiltIn
    ? `<span class="badge badge-available" style="font-size:12px">Built-in</span>`
    : `<span style="color:var(--text-muted);font-size:13px">Azure AD Group</span>`;

  const openBtn = document.getElementById("group-detail-open");
  if (isBuiltIn) {
    openBtn.style.display = "none";
  } else {
    openBtn.style.display = "";
    openBtn.href = AAD_GROUP_URL(groupId);
  }

  const assignedApps = apps.filter((a) => a.assignments.some((x) => x.groupId === groupId));
  const tbody = document.getElementById("group-detail-apps");

  if (!assignedApps.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px">No apps assigned to this group</td></tr>`;
    return;
  }

  tbody.innerHTML = assignedApps.map((app) => {
    const intent = app.assignments.find((x) => x.groupId === groupId)?.intent ?? "unknown";
    return `
      <tr>
        <td>
          <div class="table-app-name">${escapeHtml(app.appName)}</div>
          <div class="table-app-sub">${escapeHtml(app.appType)}</div>
        </td>
        <td>${renderBadge(intent)}</td>
        <td>
          <a href="${INTUNE_APP_URL(app.appId)}" target="_blank" rel="noopener" class="btn btn-sm">
            Open in Intune ↗
          </a>
        </td>
      </tr>`;
  }).join("");
}
