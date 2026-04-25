import { escapeHtml } from "./search.js";

// Bump this string whenever you ship a new update.
// Any user whose localStorage doesn't match will see the modal automatically.
const CURRENT_VERSION = "filter-and-fixes";

const CHANGELOG = [
  {
    update: "Filter & Fixes",
    date: "April 2026",
    emoji: "🔧",
    items: [
      "Filter All Apps by status: All, Assigned, Unassigned, All Users, or All Devices",
      "Filter All Groups by All, Assigned, or Unassigned",
      "Dashboard stat cards are now clickable and navigate to filtered views",
      'Renamed "Empty Groups" to "Unassigned Groups" for clarity',
      "Friendly error dialog for licensing and permission issues instead of raw error text",
      "Large tenant warning shown when hygiene analysis may take a long time (250+ groups)",
    ],
  },
  {
    update: "Hygiene Update",
    date: "April 2026",
    emoji: "🛡️",
    items: [
      "New Tenant Hygiene tab with a 0–100 health score",
      "Detects unassigned config profiles, compliance policies, apps, and empty groups",
      "Expandable finding cards with severity ratings and remediation recommendations",
      "Score displayed as a colour-coded ring: Excellent / Good / Fair / Needs Attention",
    ],
  },
  {
    update: "Initial Release",
    date: "April 2026",
    emoji: "🚀",
    items: [
      "Dashboard overview with charts and six stat cards",
      "All Apps and All Groups pages with click-through detail views",
      "App search, group search, unassigned apps, and empty groups tabs",
      "Export to a standalone offline HTML report",
      '"How it works" documentation on both the login screen and dashboard',
    ],
  },
];

export function initChangelog() {
  // Auto-show on first visit after a new update ships
  const seen = localStorage.getItem("intune_seen_update");
  if (seen !== CURRENT_VERSION) {
    setTimeout(showModal, 900); // slight delay so dashboard renders first
  }

  document.getElementById("whats-new-btn")?.addEventListener("click", showModal);

  document.getElementById("changelog-close")?.addEventListener("click", () =>
    document.getElementById("changelog-modal").classList.add("hidden")
  );
  document.getElementById("changelog-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
  });
}

function showModal() {
  localStorage.setItem("intune_seen_update", CURRENT_VERSION);

  const body = document.getElementById("changelog-body");
  body.innerHTML = CHANGELOG.map((entry, i) => `
    <div class="cl-entry">
      <div class="cl-header">
        <span class="cl-emoji">${entry.emoji}</span>
        <div class="cl-meta">
          <span class="cl-name">${escapeHtml(entry.update)}</span>
          <span class="cl-date">${escapeHtml(entry.date)}</span>
        </div>
        ${i === 0 ? `<span class="badge badge-available" style="margin-left:auto;flex-shrink:0">Latest</span>` : ""}
      </div>
      <ul class="cl-list">
        ${entry.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>`).join("");

  document.getElementById("changelog-modal").classList.remove("hidden");
}
