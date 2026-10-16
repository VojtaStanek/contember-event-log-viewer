// Sends Contember API calls through relay.js in a tab of the admin, so the admin's
// HttpOnly session cookie authenticates them. Plugs into src/api.js as conn.transport.
import { ApiError } from '../../../src/api';

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch (e) {
    return null;
  }
};

const send = (tabId, frameId, msg) =>
  chrome.tabs.sendMessage(tabId, msg, { frameId }).catch(() => null);

export class NoSessionTabError extends ApiError {
  constructor(origin) {
    super(`Open the admin (${origin}) in a tab to load history. The extension uses its login session.`, { status: 'no-tab' });
    this.origin = origin;
  }
}

// meta: a stored request; its tab and frame are tried first, then any tab on the same origin.
export function sessionTransport(meta) {
  const origin = originOf(meta.pageUrl);
  return async ({ url, body, signal }) => {
    const msg = { type: 'api-request', url, body, origin };
    const candidates = [];
    if (meta.tabId != null) candidates.push([meta.tabId, meta.frameId || 0]);
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id !== meta.tabId && tab.url && originOf(tab.url) === origin) candidates.push([tab.id, 0]);
    }
    for (const [tabId, frameId] of candidates) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const response = await send(tabId, frameId, msg);
      if (!response || response.wrongOrigin) continue;
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (response.networkError) throw new Error(response.networkError);
      return response;
    }
    throw new NoSessionTabError(origin);
  };
}

// The connection the viewer components need, for the project a request went to.
export function connectionFor(meta) {
  if (!meta || !meta.apiEndpoint || !meta.project) return null;
  return {
    apiEndpoint: meta.apiEndpoint,
    projectName: meta.project,
    stage: meta.stage || 'live',
    auth: 'session',
    transport: sessionTransport(meta),
  };
}
