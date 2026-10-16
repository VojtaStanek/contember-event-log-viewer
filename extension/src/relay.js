// Isolated-world content script. Forwards captures from hook.js to the background
// worker, and runs system/content API calls for the inspector from this page, so the
// admin's HttpOnly session cookie goes with them.
const MARK = '__contemberInspector';
const pageLoadId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const sendConfig = (patterns) => window.postMessage({ [MARK]: 'config', patterns: patterns || [] }, '*');
chrome.storage.local.get({ patterns: [] }, ({ patterns }) => sendConfig(patterns));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.patterns) sendConfig(changes.patterns.newValue);
});

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data[MARK] !== 'capture') return;
  try {
    chrome.runtime.sendMessage({
      type: 'capture',
      capture: { ...e.data.capture, pageUrl: window.location.href, pageLoadId },
    }).catch(() => {});
  } catch (err) {
    // The extension was reloaded or updated; this page needs a reload to record again.
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  if (msg.type === 'ping') {
    sendResponse({ ok: true, url: window.location.href });
    return false;
  }
  if (msg.type === 'api-request') {
    // Only from the page the session belongs to; the tab may have moved on.
    if (msg.origin && msg.origin !== window.location.origin) {
      sendResponse({ wrongOrigin: true });
      return false;
    }
    fetch(msg.url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: msg.body,
    })
      .then(async (r) => sendResponse({ status: r.status, ok: r.ok, text: await r.text() }))
      .catch((err) => sendResponse({ networkError: String((err && err.message) || err) }));
    return true;
  }
  return false;
});
