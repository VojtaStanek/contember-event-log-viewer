import React, { useEffect, useState } from 'react';

export const profileLabel = (p) => p.name || `${p.projectName} on ${p.apiEndpoint.replace(/^https?:\/\//, '')}`;

const EMPTY = { name: '', apiEndpoint: '', projectName: '', stage: 'live', authToken: '' };

const toDraft = (p) => (p ? { ...EMPTY, ...p, stage: p.stage || 'live' } : EMPTY);

export const ConnectionPanel = ({ profiles, activeId, onSelect, onSave, onDelete, onConnect, onClose }) => {
  const active = profiles.find(p => p.id === activeId);
  const [draft, setDraft] = useState(() => toDraft(active));
  useEffect(() => setDraft(toDraft(active)), [active]);

  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  const complete = draft.apiEndpoint.trim() && draft.projectName.trim() && draft.authToken.trim();
  const clean = () => ({
    ...draft,
    name: draft.name.trim(),
    apiEndpoint: draft.apiEndpoint.trim(),
    projectName: draft.projectName.trim(),
    stage: draft.stage.trim() || 'live',
    authToken: draft.authToken.trim(),
  });

  const connect = (e) => {
    e.preventDefault();
    if (complete) onConnect(clean());
  };

  return (
    <div className="conn" role="dialog" aria-label="Connection">
      {profiles.length > 0 && (
        <nav className="conn-profiles" aria-label="Saved profiles">
          <h2 className="panel-heading">Profiles</h2>
          <ul>
            {profiles.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`conn-profile${p.id === activeId ? ' is-on' : ''}`}
                  aria-current={p.id === activeId}
                  onClick={() => onSelect(p.id)}
                >
                  <span className="conn-profile-name">{profileLabel(p)}</span>
                  <span className="conn-profile-stage">{p.stage || 'live'}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-quiet btn-small" onClick={() => setDraft(EMPTY)}>New profile</button>
        </nav>
      )}
      <form className="conn-form" onSubmit={connect}>
        <div className="conn-grid">
          <label>
            <span>Name</span>
            <input value={draft.name} onChange={set('name')} placeholder="Optional, e.g. Production" />
          </label>
          <label>
            <span>API endpoint</span>
            <input value={draft.apiEndpoint} onChange={set('apiEndpoint')} placeholder="https://api.example.com" required />
          </label>
          <label>
            <span>Project</span>
            <input value={draft.projectName} onChange={set('projectName')} required />
          </label>
          <label>
            <span>Stage</span>
            <input value={draft.stage} onChange={set('stage')} placeholder="live" />
          </label>
          <label className="conn-token">
            <span>Token</span>
            <input type="password" value={draft.authToken} onChange={set('authToken')} autoComplete="off" required />
          </label>
        </div>
        <p className="panel-hint">
          Profiles, including tokens, are stored in this browser's local storage. Editing needs a token with content API access.
        </p>
        <div className="conn-actions">
          <button type="submit" className="btn btn-primary" disabled={!complete}>Connect</button>
          <button type="button" className="btn" disabled={!complete} onClick={() => onSave(clean(), draft.id)}>
            {draft.id ? 'Save profile' : 'Save as profile'}
          </button>
          {draft.id && (
            <button type="button" className="btn-quiet" disabled={!complete} onClick={() => onSave(clean(), null)}>
              Save as new profile
            </button>
          )}
          {draft.id && (
            <button
              type="button"
              className="btn-quiet btn-danger"
              onClick={() => window.confirm(`Delete profile ${profileLabel(draft)}?`) && onDelete(draft.id)}
            >
              Delete profile
            </button>
          )}
          {onClose && <button type="button" className="btn-quiet conn-close" onClick={onClose}>Close</button>}
        </div>
      </form>
    </div>
  );
};
