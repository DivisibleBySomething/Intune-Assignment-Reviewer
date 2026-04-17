let _data = [];

export function initSearch(data) {
  _data = data;
  populateGroupDropdown(data);

  const appInput = document.getElementById("app-search-input");
  const groupSelect = document.getElementById("group-search-select");

  appInput.addEventListener("input", (e) => handleAppSearch(e.target.value.trim()));
  groupSelect.addEventListener("change", (e) => handleGroupSearch(e.target.value));
}

function handleAppSearch(query) {
  const container = document.getElementById("app-search-results");
  if (!query) {
    container.innerHTML = `<p class="search-placeholder">Type an app name to search.</p>`;
    return;
  }
  const q = query.toLowerCase();
  const matches = _data.filter((app) => app.appName.toLowerCase().includes(q));
  if (!matches.length) {
    container.innerHTML = `<p class="search-placeholder">No apps found matching "${escapeHtml(query)}".</p>`;
    return;
  }
  container.innerHTML = matches.map(renderAppCard).join("");
}

function handleGroupSearch(groupId) {
  const container = document.getElementById("group-search-results");
  if (!groupId) {
    container.innerHTML = `<p class="search-placeholder">Select a group to see its apps.</p>`;
    return;
  }
  const matches = _data.filter((app) =>
    app.assignments.some((a) => a.groupId === groupId)
  );
  const groupName = getGroupName(groupId);
  if (!matches.length) {
    container.innerHTML = `<p class="search-placeholder">No apps assigned to "${escapeHtml(groupName)}".</p>`;
    return;
  }
  container.innerHTML = matches
    .map((app) => {
      const relevantAssignments = app.assignments.filter((a) => a.groupId === groupId);
      return renderAppCardWithAssignments(app, relevantAssignments);
    })
    .join("");
}

function getGroupName(groupId) {
  if (groupId === "ALL_USERS") return "All Users";
  if (groupId === "ALL_DEVICES") return "All Devices";
  for (const app of _data) {
    const a = app.assignments.find((x) => x.groupId === groupId);
    if (a) return a.groupName;
  }
  return groupId;
}

function populateGroupDropdown(data) {
  const select = document.getElementById("group-search-select");
  const groupMap = new Map();

  for (const app of data) {
    for (const a of app.assignments) {
      if (!groupMap.has(a.groupId)) {
        groupMap.set(a.groupId, a.groupName);
      }
    }
  }

  const sorted = [...groupMap.entries()].sort((a, b) => {
    if (a[0] === "ALL_USERS") return -1;
    if (b[0] === "ALL_USERS") return 1;
    if (a[0] === "ALL_DEVICES") return -1;
    if (b[0] === "ALL_DEVICES") return 1;
    return a[1].localeCompare(b[1]);
  });

  select.innerHTML =
    `<option value="">-- Select a group --</option>` +
    sorted
      .map(
        ([id, name]) =>
          `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`
      )
      .join("");
}

function renderAppCard(app) {
  return renderAppCardWithAssignments(app, app.assignments);
}

function renderAppCardWithAssignments(app, assignments) {
  const appLink = renderAppLink(app.appId, app.appName);
  const assignmentItems = assignments.map((a) => {
    const badge = renderBadge(a.intent);
    const groupLink = renderGroupLink(a.groupId, a.groupName);
    return `<span class="assignment-item">${badge} ${groupLink}</span>`;
  });

  return `
    <div class="result-card">
      <div class="result-app-name">${appLink}</div>
      <div class="result-app-type">${escapeHtml(app.appType)}</div>
      <div class="assignment-list">${assignmentItems.join("")}</div>
    </div>
  `;
}

export function renderBadge(intent) {
  const cls =
    intent === "required"
      ? "badge-required"
      : intent === "available"
      ? "badge-available"
      : "badge-uninstall";
  return `<span class="badge ${cls}">${escapeHtml(intent)}</span>`;
}

export function renderAppLink(appId, appName) {
  const url = `https://intune.microsoft.com/#view/Microsoft_Intune_Apps/AppMenuBlade/~/Overview/appId/${appId}`;
  return `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(appName)}</a>`;
}

export function renderGroupLink(groupId, groupName) {
  if (groupId === "ALL_USERS" || groupId === "ALL_DEVICES") {
    return `<span>${escapeHtml(groupName)}</span>`;
  }
  const url = `https://intune.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${groupId}`;
  return `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(groupName)}</a>`;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
