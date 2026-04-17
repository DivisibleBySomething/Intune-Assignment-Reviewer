const msalConfig = {
  auth: {
    clientId: "5f57e333-6cbd-4ba6-b047-facc1079e754",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

const loginRequest = {
  scopes: [
    "User.Read",
    "DeviceManagementApps.Read.All",
    "Group.Read.All",
    "Directory.Read.All",
  ],
};

const msalInstance = new msal.PublicClientApplication(msalConfig);
let currentAccount = null;

export async function init() {
  const loginView = document.getElementById("login-view");
  const dashView = document.getElementById("dashboard-view");
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  // Restore session if already signed in
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    currentAccount = accounts[0];
    msalInstance.setActiveAccount(currentAccount);
    showDashboard(loginView, dashView);
    return;
  }

  loginView.classList.remove("hidden");
  dashView.classList.add("hidden");

  loginBtn.addEventListener("click", async () => {
    try {
      loginBtn.disabled = true;
      loginBtn.textContent = "Signing in…";
      const response = await msalInstance.loginPopup(loginRequest);
      currentAccount = response.account;
      msalInstance.setActiveAccount(currentAccount);
      showDashboard(loginView, dashView);
    } catch (err) {
      loginBtn.disabled = false;
      loginBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
          <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
          <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
          <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
        </svg>
        Sign in with Microsoft`;
      if (err.errorCode !== "user_cancelled") {
        showError(`Sign-in failed: ${err.message}`);
      }
    }
  });

  logoutBtn.addEventListener("click", async () => {
    sessionStorage.removeItem("intune_dashboard_data");
    await msalInstance.logoutPopup({ account: currentAccount });
    window.location.reload();
  });
}

async function showDashboard(loginView, dashView) {
  loginView.classList.add("hidden");
  dashView.classList.remove("hidden");
  renderUserInfo(currentAccount);
  const { loadDashboard } = await import("./dashboard.js");
  await loadDashboard();
}

export async function getToken() {
  const account = msalInstance.getActiveAccount();
  if (!account) throw new Error("No active account");
  try {
    const result = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    return result.accessToken;
  } catch (err) {
    if (err instanceof msal.InteractionRequiredAuthError) {
      const result = await msalInstance.acquireTokenPopup({
        ...loginRequest,
        account,
      });
      return result.accessToken;
    }
    throw err;
  }
}

export function getAccount() {
  return currentAccount;
}

function renderUserInfo(account) {
  const name = account.name ?? account.username ?? "User";
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  const el = document.getElementById("user-info");
  if (el) {
    el.innerHTML = `
      <div class="avatar">${initials}</div>
      <span class="username">${name}</span>
    `;
  }
}

function showError(msg) {
  let banner = document.getElementById("error-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "error-banner";
    document.getElementById("login-view")?.appendChild(banner);
  }
  banner.textContent = msg;
  banner.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", init);
