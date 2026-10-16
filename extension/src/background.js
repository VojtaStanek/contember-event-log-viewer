// Background service worker: the only writer of the request history.
// It analyses captures from relay.js, stores them, keeps per-tab failure badges and
// tells open inspector pages that something changed.
import { analyzeCapture } from './lib/analyze.js';
import { addRequest, clearRequests, listRequests, pruneRequests } from './lib/db.js';
import { getSettings } from './lib/settings.js';

const PRUNE_EVERY = 25;
let sincePrune = PRUNE_EVERY; // prune on the first capture after start-up
let queue = Promise.resolve();

const broadcast = (msg) => chrome.runtime.sendMessage(msg).catch(() => {
  // No inspector page is open.
});

// ---- Badge: failed requests per tab since the user last looked ----
const getBadges = async () => (await chrome.storage.session.get({ badges: {} })).badges;

async function setBadge(tabId, count) {
  const badges = await getBadges();
  if (count) badges[tabId] = count;
  else delete badges[tabId];
  await chrome.storage.session.set({ badges });
  try {
    await chrome.action.setBadgeText({ tabId, text: count ? String(count > 99 ? '99+' : count) : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#B23A48' });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' });
  } catch (e) {
    // The tab is gone.
  }
}

const maskHeaders = (headers) => {
  const out = { ...(headers || {}) };
  for (const key of Object.keys(out)) {
    if (key === 'authorization' || key === 'cookie') {
      const v = String(out[key]);
      out[key] = v.length > 16 ? `${v.slice(0, 11)}…${v.slice(-4)}` : '•••';
    }
  }
  return out;
};

async function store(capture, sender) {
  const settings = await getSettings();
  if (!settings.recording) return;
  const tabId = sender.tab ? sender.tab.id : null;
  const { meta, body } = analyzeCapture(
    { ...capture, tabId, frameId: sender.frameId || 0, requestHeaders: maskHeaders(capture.requestHeaders) },
    settings.patterns,
  );
  const id = await addRequest(meta, body);
  if (tabId != null && meta.outcome === 'error') {
    const badges = await getBadges();
    await setBadge(tabId, (badges[tabId] || 0) + 1);
  }
  if (++sincePrune >= PRUNE_EVERY) {
    sincePrune = 0;
    const removed = await pruneRequests(settings.maxEntries);
    if (removed) await broadcast({ type: 'pruned' });
  }
  await broadcast({ type: 'changed', tabId, id });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  switch (msg.type) {
    case 'capture':
      // Serialised so ids follow the order requests finished in.
      queue = queue.then(() => store(msg.capture, sender)).catch(e => console.error('Contember inspector: could not store a request', e));
      return false;
    case 'seen':
      setBadge(msg.tabId, 0).then(() => sendResponse({ ok: true }));
      return true;
    case 'clear':
      queue = queue.then(async () => {
        await clearRequests(msg.tabId == null ? null : msg.tabId);
        if (msg.tabId == null) {
          const badges = await getBadges();
          await Promise.all(Object.keys(badges).map(t => setBadge(Number(t), 0)));
        } else {
          await setBadge(msg.tabId, 0);
        }
        await broadcast({ type: 'cleared', tabId: msg.tabId == null ? null : msg.tabId });
        sendResponse({ ok: true });
      });
      return true;
    case 'prune':
      queue = queue.then(async () => {
        const removed = await pruneRequests(msg.max);
        if (removed) await broadcast({ type: 'pruned' });
        sendResponse({ removed });
      });
      return true;
    case 'summary':
      listRequests({ tabId: msg.tabId }).then(list => sendResponse({
        total: list.length,
        failed: list.filter(r => r.outcome === 'error').length,
        last: list[0] ? list[0].startedAt : null,
      }));
      return true;
    default:
      return false;
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const badges = await getBadges();
  if (badges[tabId]) {
    delete badges[tabId];
    await chrome.storage.session.set({ badges });
  }
});

// Badge text is reset by Chrome when a tab navigates; restore it.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'loading') return;
  const badges = await getBadges();
  if (badges[tabId]) setBadge(tabId, badges[tabId]);
});
