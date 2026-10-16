// List filtering, kept pure so it can be tested.
// filters: { text, ops: [], apis: [], failedOnly, entity }; empty lists mean "any".
export function matchesFilters(meta, filters) {
  const { text = '', ops = [], apis = [], failedOnly = false, entity = '' } = filters;
  if (ops.length && !ops.includes(meta.operationType)) return false;
  if (apis.length && !apis.includes(meta.api)) return false;
  if (failedOnly && meta.outcome !== 'error') return false;
  if (entity && !(meta.entities || []).includes(entity)) return false;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = `${meta.searchText || ''} ${(meta.url || '').toLowerCase()}`;
    if (!words.every(w => hay.includes(w))) return false;
  }
  return true;
}

export const hasActiveFilters = (f) =>
  !!(f.text.trim() || f.ops.length || f.apis.length || f.failedOnly || f.entity);

// Requests grouped by page load (newest first), so a reload reads as a new session.
export function groupByPageLoad(requests) {
  const groups = [];
  for (const r of requests) {
    const last = groups[groups.length - 1];
    const key = `${r.tabId}|${r.pageLoadId}`;
    if (last && last.key === key) last.items.push(r);
    else groups.push({ key, pageUrl: r.pageUrl, tabId: r.tabId, items: [r] });
  }
  return groups;
}
