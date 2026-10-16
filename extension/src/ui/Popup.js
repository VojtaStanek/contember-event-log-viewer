import React, { useEffect, useState } from 'react';
import { Logo } from '../../../src/components/Logo';
import { DEFAULTS, getSettings, onSettingsChange } from '../lib/settings';
import { RecordButton } from './Toolbar';
import { clockTime } from './format';

export const Popup = () => {
  const [tab, setTab] = useState(null);
  const [summary, setSummary] = useState(null);
  const [settings, setSettingsState] = useState(DEFAULTS);

  useEffect(() => {
    getSettings().then(setSettingsState);
    const off = onSettingsChange(changed => setSettingsState(s => ({ ...s, ...changed })));
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      setTab(t || null);
      if (t) chrome.runtime.sendMessage({ type: 'summary', tabId: t.id }).then(setSummary).catch(() => {});
    });
    return off;
  }, []);

  const openHistory = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL(`history.html${tab ? `?tabId=${tab.id}` : ''}`) });
    window.close();
  };

  return (
    <div className="popup">
      <header className="popup-head">
        <span className="brand"><Logo size={22} />Contember requests</span>
        <span className="popup-recording">
          <span className="insp-muted">{settings.recording ? 'Recording' : 'Paused'}</span>
          <RecordButton recording={settings.recording} />
        </span>
      </header>
      <p className="popup-stat">
        {!summary ? '…' : summary.total === 0
          ? 'No Contember requests recorded on this tab yet.'
          : (
            <>
              <strong>{summary.total}</strong> {summary.total === 1 ? 'request' : 'requests'} on this tab
              {summary.failed > 0 && <span className="insp-tone-error"> · {summary.failed} failed</span>}
              {summary.last && <span className="insp-muted"> · last at {clockTime(summary.last)}</span>}
            </>
          )}
      </p>
      {!settings.recording && <p className="popup-note">Recording is paused. New requests aren't saved.</p>}
      <button type="button" className="btn btn-primary popup-open" onClick={openHistory}>Open request history</button>
      <p className="popup-note">Also in DevTools: open the <strong>Contember</strong> panel to inspect this tab next to your page.</p>
    </div>
  );
};
