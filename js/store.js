let _apps = [];
let _allGroups = [];

export function setData(apps, allGroups) {
  _apps = apps;
  _allGroups = allGroups;
}

export function getData() {
  return { apps: _apps, allGroups: _allGroups };
}
