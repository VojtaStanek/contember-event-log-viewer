// Recognises Contember engine endpoints in request URLs. Contember Admin usually
// reaches the engine through a same-origin proxy (e.g. `/_api`), so any path
// prefix is allowed in front of the engine's own routes:
//   {prefix}/content/{project}/{stage}
//   {prefix}/system/{project}
//   {prefix}/tenant
const ROUTES = [
  { api: 'content', re: /^(.*)\/content\/([^/]+)\/([^/]+)\/?$/ },
  { api: 'system', re: /^(.*)\/system\/([^/]+)\/?$/ },
  { api: 'tenant', re: /^(.*)\/tenant\/?$/ },
];

// extraPatterns: substrings from the settings, for proxies with other paths.
export function detectEndpoint(url, base, extraPatterns = []) {
  let parsed;
  try {
    parsed = new URL(url, base);
  } catch (e) {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const path = parsed.pathname;
  for (const { api, re } of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    return {
      api,
      url: parsed.origin + path,
      apiEndpoint: parsed.origin + m[1],
      project: api === 'tenant' ? null : decodeURIComponent(m[2]),
      stage: api === 'content' ? decodeURIComponent(m[3]) : null,
    };
  }
  const full = parsed.href;
  if (extraPatterns.some(p => p && full.includes(p))) {
    return { api: 'other', url: parsed.origin + path, apiEndpoint: null, project: null, stage: null };
  }
  return null;
}
