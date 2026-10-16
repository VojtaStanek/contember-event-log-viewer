// Settings in chrome.storage.local, shared by every part of the extension.
export const DEFAULTS = {
  recording: true,
  maxEntries: 2000,
  patterns: [],
};

export const getSettings = () => chrome.storage.local.get(DEFAULTS);
export const setSettings = (values) => chrome.storage.local.set(values);

export function onSettingsChange(listener) {
  const handler = (changes, area) => {
    if (area !== 'local') return;
    const changed = {};
    for (const key of Object.keys(DEFAULTS)) if (changes[key]) changed[key] = changes[key].newValue;
    if (Object.keys(changed).length) listener(changed);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
