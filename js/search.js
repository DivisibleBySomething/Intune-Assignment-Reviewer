let _apps = [];
let _allGroups = [];
let _activeTab = "app-search";

export function initSearch(apps, allGroups) {
  _apps = apps;
  _allGroups = allGroups;

  setupTabs();
  setupAppSearch();
  setupGroupSearch();
  renderUnassignedApps();
  renderEmptyGroups();
}

// ── Tabs ──────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.querySelectorAll(".tab-panel").forEach((p) =>
    p.classList.toggle("hidden", p.id !== `tab-${tab}`)
  );
}

// ── App Search ────────────────────────────────────────────

function setupAppSearch() {
  const input = document.getElementById("app-search-input");
  input.addEventListener("input", (e) => renderAppResults(e.target.value.trim()));
}

function renderAppResults(query) {
  const container = document.getElementById("app-search-results");
  if (!query) {
    container.innerHTML = `<p class="search-placeholder">Type an app name to search.</p>`;
    return;
  }
  const q = query.toLowerCase();
  const matches = _apps.filter((a) => a.appName.toLowerCase().includes(q));
  if (!matches.length) {
    container.innerHTML = `<p class="search-placeholder">No apps found matching "${escapeHtml(query)}".</p>`;
    return;
  }
  container.innerHTML = matches.map(renderAppCard).join("");
}

// ── Group Search ──────────────────────────────────────────

function setupGroupSearch() {
  const input = document.getElementById("group-search-input");
  input.addEventListener("input", (e) => renderGroupResults(e.target.value.trim()));
}

function renderGroupResults(query) {
  const container = document.getElementById("group-search-results");
  if (!query) {
    container.innerHTML = `<p class="search-placeholder">Type a group name to search.</p>`;
    return;
  }
  const q = query.toLowerCase();

  // Build searchable group list: real groups + virtual built-ins if used
  const usedBuiltIns = getUsedBuiltIns();
  const realGroups = _allGroups.filter((g) =>
    g.displayName?.toLowerCase().includes(q)
  );
  const builtInMatches = usedBuiltIns.filter((g) =>
    g.groupName.toLowerCase().includes(q)
  );

  if (!realGroups.length && !builtInMatches.length) {
    container.innerHTML = `<p class="search-placeholder">No groups found matching "${escapeHtml(query)}".</p>`;
    return;
  }

  const cards = [
    ...builtInMatches.map((g) => renderGroupCard(g.groupId, g.groupName)),
    ...realGroups.map((g) => renderGroupCard(g.id, g.displayName)),
  ];
  container.innerHTML = cards.join("");
}

function getUsedBuiltIns() {
  const used = new Set();
  for (const app of _apps) {
    for (const a of app.assignments) {
      if (a.groupId === "ALL_USERS" || a.groupId === "ALL_DEVICES") {
        used.add(a.groupId);
      }
    }
  }
  const result = [];
  if (used.has("ALL_USERS")) result.push({ groupId: "ALL_USERS", groupName: "All Users" });
  if (used.has("ALL_DEVICES")) result.push({ groupId: "ALL_DEVICES", groupName: "All Devices" });
  return result;
}

function renderGroupCard(groupId, groupName) {
  const appsForGroup = _apps.filter((a) =>
    a.assignments.some((x) => x.groupId === groupId)
  );
  if (!appsForGroup.length) {
    return `
      <div class="result-card">
        <div class="result-app-name">${renderGroupLink(groupId, groupName)}</div>
        <div class="result-app-type" style="color:var(--text-muted)">No app assignments</div>
      </div>`;
  }
  const appItems = appsForGroup.map((app) => {
    const intent = app.assignments.find((x) => x.groupId === groupId)?.intent ?? "";
    return `<span class="assignment-item">${renderBadge(intent)} ${renderAppLink(app.appId, app.appName)}</span>`;
  });
  return `
    <div class="result-card">
      <div class="result-app-name">${renderGroupLink(groupId, groupName)}</div>
      <div class="result-app-type">${appsForGroup.length} app${appsForGroup.length !== 1 ? "s" : ""}</div>
      <div class="assignment-list">${appItems.join("")}</div>
    </div>`;
}

// ── Unassigned Apps ───────────────────────────────────────

function renderUnassignedApps() {
  const container = document.getElementById("unassigned-results");
  const unassigned = _apps.filter((a) => !a.isAssigned);
  if (!unassigned.length) {
    container.innerHTML = `<p class="search-placeholder">All apps have at least one assignment. 🎉</p>`;
    return;
  }
  container.innerHTML = `
    <p class="results-count">${unassigned.length} app${unassigned.length !== 1 ? "s" : ""} with no assignments</p>
    ${unassigned.map(renderUnassignedAppCard).join("")}`;
}

function renderUnassignedAppCard(app) {
  const date = app.createdDateTime
    ? new Date(app.createdDateTime).toLocaleDateString()
    : "Unknown";
  return `
    <div class="result-card">
      <div class="result-app-name">${renderAppLink(app.appId, app.appName)}</div>
      <div class="result-app-type">${escapeHtml(app.appType)}${app.publisher ? ` · ${escapeHtml(app.publisher)}` : ""} · Added ${date}</div>
    </div>`;
}

// ── Empty Groups ──────────────────────────────────────────

function renderEmptyGroups() {
  const container = document.getElementById("empty-groups-results");
  const assignedGroupIds = new Set(
    _apps.flatMap((a) => a.assignments.map((x) => x.groupId))
  );
  const empty = _allGroups.filter((g) => !assignedGroupIds.has(g.id));
  if (!empty.length) {
    container.innerHTML = `<p class="search-placeholder">All groups have at least one app assignment. 🎉</p>`;
    return;
  }

  const input = document.getElementById("empty-groups-search");
  const render = (q) => {
    const filtered = q
      ? empty.filter((g) => g.displayName?.toLowerCase().includes(q.toLowerCase()))
      : empty;
    container.innerHTML = `
      <p class="results-count">${filtered.length} group${filtered.length !== 1 ? "s" : ""} with no app assignments${q ? ` matching "${escapeHtml(q)}"` : ""}</p>
      ${filtered.map((g) => `
        <div class="result-card">
          <div class="result-app-name">${renderGroupLink(g.id, g.displayName)}</div>
        </div>`).join("")}`;
  };

  input?.addEventListener("input", (e) => render(e.target.value.trim()));
  render("");
}

// ── Helpers ───────────────────────────────────────────────

export function renderBadge(intent) {
  const cls = intent === "required" ? "badge-required" : intent === "available" ? "badge-available" : "badge-uninstall";
  return `<span class="badge ${cls}">${escapeHtml(intent)}</span>`;
}

export function renderAppLink(appId, appName) {
  return `<a href="https://intune.microsoft.com/#view/Microsoft_Intune_Apps/AppMenuBlade/~/Overview/appId/${appId}" target="_blank" rel="noopener">${escapeHtml(appName)}</a>`;
}

export function renderGroupLink(groupId, groupName) {
  if (groupId === "ALL_USERS" || groupId === "ALL_DEVICES") {
    return `<span>${escapeHtml(groupName)}</span>`;
  }
  return `<a href="https://intune.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${groupId}" target="_blank" rel="noopener">${escapeHtml(groupName)}</a>`;
}

function renderAppCard(app) {
  const assignmentItems = app.assignments.map((a) =>
    `<span class="assignment-item">${renderBadge(a.intent)} ${renderGroupLink(a.groupId, a.groupName)}</span>`
  );
  return `
    <div class="result-card">
      <div class="result-app-name">${renderAppLink(app.appId, app.appName)}</div>
      <div class="result-app-type">${escapeHtml(app.appType)}</div>
      <div class="assignment-list">${assignmentItems.length ? assignmentItems.join("") : '<span style="color:var(--text-muted);font-size:12px">No assignments</span>'}</div>
    </div>`;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
