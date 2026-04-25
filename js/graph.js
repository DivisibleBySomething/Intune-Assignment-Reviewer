const GRAPH_BASE = "https://graph.microsoft.com/beta";

async function graphFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
    await sleep(retryAfter * 1000);
    return graphFetch(url, token, options);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph error ${res.status} for ${url}: ${body}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function graphGetAll(url, token) {
  const items = [];
  let nextUrl = url;
  while (nextUrl) {
    const data = await graphFetch(nextUrl, token);
    if (Array.isArray(data.value)) items.push(...data.value);
    nextUrl = data["@odata.nextLink"] ?? null;
  }
  return items;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function fetchAssignedApps(token) {
  return graphGetAll(
    `${GRAPH_BASE}/deviceAppManagement/mobileApps?$filter=isAssigned eq true`,
    token
  );
}

export async function fetchAppAssignments(appId, token) {
  return graphGetAll(
    `${GRAPH_BASE}/deviceAppManagement/mobileApps/${appId}/assignments`,
    token
  );
}

export async function resolveGroupNames(groupIds, token) {
  const nameMap = new Map();
  if (!groupIds.length) return nameMap;

  const unique = [...new Set(groupIds)].filter(
    (id) => id !== "ALL_USERS" && id !== "ALL_DEVICES"
  );
  const chunks = chunkArray(unique, 20);

  for (const chunk of chunks) {
    const body = {
      requests: chunk.map((id, i) => ({
        id: String(i),
        method: "GET",
        url: `/groups/${id}?$select=id,displayName`,
      })),
    };
    try {
      const result = await graphFetch(`${GRAPH_BASE}/$batch`, token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      for (const resp of result.responses ?? []) {
        if (resp.status === 200 && resp.body?.id) {
          nameMap.set(resp.body.id, resp.body.displayName ?? resp.body.id);
        } else {
          const originalId = chunk[parseInt(resp.id, 10)];
          if (originalId) nameMap.set(originalId, originalId);
        }
      }
    } catch {
      for (const id of chunk) nameMap.set(id, id);
    }
  }
  return nameMap;
}

export async function fetchAllGroups(token) {
  return graphGetAll(
    `${GRAPH_BASE}/groups?$select=id,displayName`,
    token
  );
}
