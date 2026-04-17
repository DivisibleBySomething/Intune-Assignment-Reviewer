const TYPE_MAP = {
  "#microsoft.graph.win32LobApp": "Win32",
  "#microsoft.graph.iosVppApp": "iOS VPP",
  "#microsoft.graph.androidManagedStoreApp": "Android",
  "#microsoft.graph.macOSLobApp": "macOS LOB",
  "#microsoft.graph.webApp": "Web App",
};

const BUILTIN_TARGETS = {
  "#microsoft.graph.allLicensedUsersAssignmentTarget": {
    groupId: "ALL_USERS",
    groupName: "All Users",
    isBuiltIn: true,
  },
  "#microsoft.graph.allDevicesAssignmentTarget": {
    groupId: "ALL_DEVICES",
    groupName: "All Devices",
    isBuiltIn: true,
  },
};

export function mapAppType(odataType) {
  return TYPE_MAP[odataType] ?? "Other";
}

function normalizeTarget(target, groupNameMap) {
  if (!target) return null;
  const type = target["@odata.type"];
  if (BUILTIN_TARGETS[type]) return { ...BUILTIN_TARGETS[type] };
  if (type === "#microsoft.graph.groupAssignmentTarget" && target.groupId) {
    return {
      groupId: target.groupId,
      groupName: groupNameMap.get(target.groupId) ?? target.groupId,
      isBuiltIn: false,
    };
  }
  return null;
}

export function normalizeApp(rawApp, rawAssignments, groupNameMap) {
  const assignments = [];
  for (const a of rawAssignments) {
    const normalized = normalizeTarget(a.target, groupNameMap);
    if (!normalized) continue;
    assignments.push({
      ...normalized,
      intent: a.intent ?? "unknown",
    });
  }
  return {
    appId: rawApp.id,
    appName: rawApp.displayName,
    appType: mapAppType(rawApp["@odata.type"]),
    publisher: rawApp.publisher ?? "",
    createdDateTime: rawApp.createdDateTime ?? "",
    assignments,
  };
}

export function normalizeAll(rawApps, assignmentsMap, groupNameMap) {
  return rawApps.map((app) =>
    normalizeApp(app, assignmentsMap.get(app.id) ?? [], groupNameMap)
  );
}

export function collectRealGroupIds(rawAssignmentsMap) {
  const ids = new Set();
  for (const assignments of rawAssignmentsMap.values()) {
    for (const a of assignments) {
      const type = a.target?.["@odata.type"];
      if (type === "#microsoft.graph.groupAssignmentTarget" && a.target.groupId) {
        ids.add(a.target.groupId);
      }
    }
  }
  return [...ids];
}
