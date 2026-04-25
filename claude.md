# Intune Assignment Dashboard — Constraints

## Graph API
- Base URL: `https://graph.microsoft.com/beta` (all calls use beta, never v1.0)
- Always handle `@odata.nextLink` pagination on every list endpoint

## Auth
- MSAL.js v3, SPA redirect flow, multi-tenant authority: `https://login.microsoftonline.com/common`
- Scopes: `User.Read`, `DeviceManagementApps.Read.All`, `Group.Read.All`, `Directory.Read.All`
- Admin consent required per tenant for Intune scopes

## Assignment Target Normalization (CRITICAL)
| `@odata.type` | Normalize to |
|---|---|
| `#microsoft.graph.allLicensedUsersAssignmentTarget` | `{groupId:"ALL_USERS", groupName:"All Users", isBuiltIn:true}` |
| `#microsoft.graph.allDevicesAssignmentTarget` | `{groupId:"ALL_DEVICES", groupName:"All Devices", isBuiltIn:true}` |
| `#microsoft.graph.groupAssignmentTarget` | Real AAD group — resolve name via batch |

Never attempt Graph group lookup for `ALL_USERS` or `ALL_DEVICES`.

## Normalized Data Model
```js
{ appId, appName, appType, assignments: [{ groupId, groupName, intent, isBuiltIn }] }
```
`appType` values: Win32 | iOS VPP | Android | macOS LOB | Web App | Other

## Caching
- `sessionStorage` only, key: `intune_dashboard_data`
- Cleared on "Refresh Data" click; no other auto-expiry

## Architecture
- Pure SPA — no backend, no build step, no Node.js required
- ES modules loaded directly in browser; MSAL + Chart.js via CDN globals

## Deep Links
- App: `https://intune.microsoft.com/#view/Microsoft_Intune_Apps/AppMenuBlade/~/Overview/appId/{appId}`
- Group: `https://intune.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/{groupId}`
- **No links for ALL_USERS or ALL_DEVICES**

## Batch Group Resolution
- `POST /beta/$batch`, max **20** requests per call
- Deduplicate groupIds; skip built-ins; fall back to raw ID on non-200

## Export
- Standalone HTML with `const EMBEDDED_DATA` JSON blob; Chart.js via CDN; no MSAL; no module imports
