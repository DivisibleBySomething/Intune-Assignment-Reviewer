import { getToken } from "./auth.js";
import {
  fetchConfigProfiles,
  fetchCompliancePolicies,
  fetchGroupMemberCounts,
} from "./graph.js";
import { getData } from "./store.js";
import { escapeHtml } from "./search.js";

let _hygieneData = null;
let _isLoading = false;

export function resetHygieneCache() {
  _hygieneData = null;
  _isLoading = false;
}

export function getHygieneCache() {
  return _hygieneData;
}

// Called from pages.js — intentionally not awaited (manages its own loading state)
export async function loadHygienePage() {
  if (_isLoading) return;

  if (_hygieneData) {
    renderHygiene(_hygieneData);
    return;
  }

  const { apps, allGroups } = getData();

  // Warn before starting if the tenant is large
  if (allGroups.length > 250) {
    const proceed = await showLargeTenantWarning(allGroups.length);
    if (!proceed) {
      showCancelled();
      return;
    }
  }

  showLoading();
  _isLoading = true;

  try {
    const token = await getToken();
    _hygieneData = await buildHygieneData(token, apps, allGroups);
    renderHygiene(_hygieneData);
  } catch (err) {
    showError(err.message);
  } finally {
    _isLoading = false;
  }
}

function showLargeTenantWarning(groupCount) {
  return new Promise((resolve) => {
    const modal      = document.getElementById("hygiene-warning-modal");
    const countEl    = document.getElementById("hygiene-warning-count");
    const continueBtn = document.getElementById("hygiene-warning-continue");
    const cancelBtn  = document.getElementById("hygiene-warning-cancel");

    if (countEl) countEl.textContent = groupCount.toLocaleString();
    modal?.classList.remove("hidden");

    const finish = (result) => {
      modal?.classList.add("hidden");
      continueBtn.onclick = null;
      cancelBtn.onclick   = null;
      resolve(result);
    };
    continueBtn.onclick = () => finish(true);
    cancelBtn.onclick   = () => finish(false);
  });
}

function showCancelled() {
  const c = getContainer();
  if (!c) return;
  c.innerHTML = `
    <div class="hygiene-cancelled">
      Analysis cancelled. Click <strong>Hygiene</strong> again whenever you're ready to run it.
    </div>`;
}

// ── Internal helpers ──────────────────────────────────────

function getContainer() {
  return document.getElementById("hygiene-content");
}

function showLoading() {
  const c = getContainer();
  if (!c) return;
  c.innerHTML = `
    <div class="hygiene-loading">
      <svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="var(--primary)">
        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
      </svg>
      <div>
        <strong>Analyzing tenant hygiene…</strong>
        <p>Fetching configuration profiles, compliance policies, and group membership data.</p>
      </div>
    </div>`;
}

function showError(msg) {
  const c = getContainer();
  if (!c) return;
  c.innerHTML = `
    <div class="hygiene-error">
      <strong>Failed to load hygiene data:</strong> ${escapeHtml(msg)}
    </div>`;
}

// ── Data building ─────────────────────────────────────────

async function buildHygieneData(token, apps, allGroups) {
  // Parallel fetch of config profiles and compliance policies
  const [configProfiles, compliancePolicies] = await Promise.all([
    fetchConfigProfiles(token),
    fetchCompliancePolicies(token),
  ]);

  // Group member counts (batched)
  const realGroupIds = allGroups.map((g) => g.id);
  const memberCounts = await fetchGroupMemberCounts(realGroupIds, token);

  const findings = [];

  // ── 1. Config profiles with no assignments (HIGH) ─────
  const unassignedProfiles = configProfiles.filter(
    (p) => !p.assignments?.length
  );
  findings.push({
    id: "unassigned-profiles",
    severity: "high",
    category: "Configuration",
    title: "Config Profiles with No Assignments",
    count: unassignedProfiles.length,
    total: configProfiles.length,
    description:
      unassignedProfiles.length === 0
        ? "All configuration profiles have at least one assignment."
        : `${unassignedProfiles.length} device configuration profile${
            unassignedProfiles.length !== 1 ? "s have" : " has"
          } no active assignments and will not be applied to any device.`,
    recommendation:
      "Assign these profiles to the appropriate device or user groups. If they are no longer needed, delete them to reduce configuration clutter.",
    items: unassignedProfiles.map((p) => ({
      id: p.id,
      name: p.displayName,
      sub: p.lastModifiedDateTime
        ? `Modified ${fmtDate(p.lastModifiedDateTime)}`
        : "",
    })),
  });

  // ── 2. Compliance policies with no assignments (HIGH) ─
  const unassignedPolicies = compliancePolicies.filter(
    (p) => !p.assignments?.length
  );
  findings.push({
    id: "unassigned-compliance",
    severity: "high",
    category: "Compliance",
    title: "Compliance Policies with No Assignments",
    count: unassignedPolicies.length,
    total: compliancePolicies.length,
    description:
      unassignedPolicies.length === 0
        ? "All compliance policies have at least one assignment."
        : `${unassignedPolicies.length} compliance polic${
            unassignedPolicies.length !== 1 ? "ies have" : "y has"
          } no active assignments and are not being enforced on any device.`,
    recommendation:
      "Unassigned compliance policies offer no protection. Assign them to the relevant user or device groups, or remove them if obsolete.",
    items: unassignedPolicies.map((p) => ({
      id: p.id,
      name: p.displayName,
      sub: p.lastModifiedDateTime
        ? `Modified ${fmtDate(p.lastModifiedDateTime)}`
        : "",
    })),
  });

  // ── 3. Apps with no assignments (MEDIUM) ─────────────
  const unassignedApps = apps.filter((a) => !a.isAssigned);
  findings.push({
    id: "unassigned-apps",
    severity: "medium",
    category: "Apps",
    title: "Apps with No Assignments",
    count: unassignedApps.length,
    total: apps.length,
    description:
      unassignedApps.length === 0
        ? "All apps have at least one assignment."
        : `${unassignedApps.length} app${
            unassignedApps.length !== 1 ? "s are" : " is"
          } present in Intune but not assigned to any group or user.`,
    recommendation:
      "Review these apps and either assign them to the appropriate groups or remove them from Intune to keep the app catalog clean.",
    items: unassignedApps.map((a) => ({
      id: a.appId,
      name: a.appName,
      sub: a.appType,
    })),
  });

  // ── 4. Groups with zero members (MEDIUM) ─────────────
  const emptyMemberGroups = allGroups.filter(
    (g) => memberCounts.get(g.id) === 0
  );
  findings.push({
    id: "empty-member-groups",
    severity: "medium",
    category: "Groups",
    title: "Groups with No Members",
    count: emptyMemberGroups.length,
    total: allGroups.length,
    description:
      emptyMemberGroups.length === 0
        ? "All groups have at least one member."
        : `${emptyMemberGroups.length} Azure AD group${
            emptyMemberGroups.length !== 1 ? "s have" : " has"
          } zero members. Any policies or apps assigned to these groups will not reach any users or devices.`,
    recommendation:
      "Populate these groups with the appropriate users or devices, or remove them if they are no longer needed.",
    items: emptyMemberGroups.map((g) => ({
      id: g.id,
      name: g.displayName,
      sub: "0 members",
    })),
  });

  // ── 5. Groups unused in app assignments (LOW) ─────────
  const assignedGroupIds = new Set(
    apps.flatMap((a) => a.assignments.map((x) => x.groupId))
  );
  const noAppGroups = allGroups.filter((g) => !assignedGroupIds.has(g.id));
  findings.push({
    id: "no-app-groups",
    severity: "low",
    category: "Groups",
    title: "Unassigned Groups (No App Assignments)",
    count: noAppGroups.length,
    total: allGroups.length,
    description:
      noAppGroups.length === 0
        ? "All groups are targeted by at least one app assignment."
        : `${noAppGroups.length} group${
            noAppGroups.length !== 1 ? "s are" : " is"
          } not targeted by any app assignment. They may still be used for policies or compliance.`,
    recommendation:
      "Verify these groups are used for device configuration, compliance policies, or other purposes. If they serve no function, consider removing them.",
    items: noAppGroups.map((g) => ({
      id: g.id,
      name: g.displayName,
      sub: "Azure AD Group",
    })),
  });

  const score = computeScore(findings);

  return {
    score,
    findings: findings.filter((f) => f.count > 0),
    totals: {
      apps: apps.length,
      configProfiles: configProfiles.length,
      compliancePolicies: compliancePolicies.length,
      groups: allGroups.length,
    },
  };
}

// ── Scoring ───────────────────────────────────────────────

function computeScore(findings) {
  const weights = { high: 35, medium: 20, low: 10 };
  let deduction = 0;
  for (const f of findings) {
    if (f.total === 0 || f.count === 0) continue;
    deduction += (f.count / f.total) * weights[f.severity];
  }
  return Math.max(0, Math.round(100 - deduction));
}

function scoreLabel(score) {
  if (score >= 90) return { label: "Excellent", cls: "excellent" };
  if (score >= 70) return { label: "Good",      cls: "good" };
  if (score >= 50) return { label: "Fair",       cls: "fair" };
  return               { label: "Needs Attention", cls: "poor" };
}

// ── Rendering ─────────────────────────────────────────────

function renderHygiene(data) {
  const c = getContainer();
  if (!c) return;

  const { score, findings, totals } = data;
  const { label, cls } = scoreLabel(score);
  const totalIssues = findings.reduce((s, f) => s + f.count, 0);

  c.innerHTML = `
    <div class="hygiene-overview card">
      <div class="hygiene-score-wrap">
        <div class="hygiene-score-ring score-${cls}" style="--score:${score}">
          <div class="hygiene-score-inner">
            <div class="hygiene-score-num">${score}</div>
            <div class="hygiene-score-status">${escapeHtml(label)}</div>
          </div>
        </div>
      </div>
      <div class="hygiene-overview-info">
        <h2 style="margin:0 0 6px;font-size:18px;font-weight:600">Tenant Hygiene Score</h2>
        <p style="margin:0 0 20px;color:var(--text-muted)">
          ${
            totalIssues === 0
              ? "No issues detected — your tenant looks clean!"
              : `${totalIssues} issue${totalIssues !== 1 ? "s" : ""} found across ${findings.length} categor${findings.length !== 1 ? "ies" : "y"}.`
          }
        </p>
        <div class="hygiene-totals">
          ${[
            ["Apps",                 totals.apps],
            ["Config Profiles",      totals.configProfiles],
            ["Compliance Policies",  totals.compliancePolicies],
            ["Groups",               totals.groups],
          ].map(([lbl, n]) => `
            <div class="hygiene-total-item">
              <span class="hygiene-total-num">${n.toLocaleString()}</span>
              <span class="hygiene-total-label">${lbl}</span>
            </div>`).join("")}
        </div>
      </div>
    </div>

    ${
      findings.length === 0
        ? `<div class="hygiene-clean">
             <svg viewBox="0 0 24 24" width="24" height="24" fill="var(--available)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
             All hygiene checks passed — nothing to clean up.
           </div>`
        : `<div class="findings-list">${findings.map(findingCard).join("")}</div>`
    }`;

  // Wire expand/collapse toggles
  c.querySelectorAll(".finding-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card  = btn.closest(".finding-card");
      const items = card.querySelector(".finding-items");
      const open  = items.classList.toggle("open");
      btn.setAttribute("aria-expanded", open);
      btn.querySelector(".finding-chevron").style.transform = open
        ? "rotate(180deg)"
        : "";
    });
  });
}

function findingCard(f) {
  const severityCls   = { high: "badge-required", medium: "badge-warning", low: "badge-info" };
  const severityLabel = { high: "High",            medium: "Medium",        low: "Low" };

  const itemRows = f.items
    .map(
      (item) => `
      <div class="finding-item">
        <div class="finding-item-name">${escapeHtml(item.name)}</div>
        ${item.sub ? `<div class="finding-item-sub">${escapeHtml(item.sub)}</div>` : ""}
      </div>`
    )
    .join("");

  return `
    <div class="finding-card">
      <div class="finding-header">
        <div class="finding-header-left">
          <span class="badge ${severityCls[f.severity]}">${severityLabel[f.severity]}</span>
          <span class="finding-category">${escapeHtml(f.category)}</span>
          <span class="finding-title">${escapeHtml(f.title)}</span>
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
      <p class="finding-desc">${escapeHtml(f.description)}</p>
      <p class="finding-rec">💡 ${escapeHtml(f.recommendation)}</p>
      <div class="finding-items">
        <div class="finding-items-inner">${itemRows}</div>
      </div>
    </div>`;
}

// ── Utilities ─────────────────────────────────────────────

function fmtDate(str) {
  try {
    return new Date(str).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return str ?? "";
  }
}
