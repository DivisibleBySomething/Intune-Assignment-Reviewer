import { loadDashboard } from "./dashboard.js";

const msalConfig = {
  auth: {
    clientId: "5f57e333-6cbd-4ba6-b047-facc1079e754",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: "https://apps.tbtinkr.com/intuneassignmentreviewer",
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
  await msalInstance.initialize();

  const loginView = document.getElementById("login-view");
  const dashView = document.getElementById("dashboard-view");
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response?.account) {
      currentAccount = response.account;
      msalInstance.setActiveAccount(currentAccount);
    } else {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        currentAccount = accounts[0];
        msalInstance.setActiveAccount(currentAccount);
      }
    }
  } catch (err) {
    console.error("Redirect handling error:", err);
    showError(`Authentication error: ${err.message}`);
  }

  if (currentAccount) {
    loginView.classList.add("hidden");
    dashView.classList.remove("hidden");
    renderUserInfo(currentAccount);
    await loadDashboard();
  } else {
    loginView.classList.remove("hidden");
    dashView.classList.add("hidden");
  }

  loginBtn.addEventListener("click", () => {
    msalInstance.loginRedirect(loginRequest);
  });

  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("intune_dashboard_data");
    msalInstance.logoutRedirect({ account: currentAccount });
  });
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
      await msalInstance.acquireTokenRedirect({ ...loginRequest, account });
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
