import React, { useEffect, useRef, useState } from 'react';
import { DEFAULTS, setSettings } from '../lib/settings';

const Chip = ({ on, onClick, children, tone, title }) => (
  <button type="button" className={`chip insp-chip${tone ? ` insp-chip--${tone}` : ''}${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick} title={title}>
    {children}
  </button>
);

const toggle = (list, value) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

export const RecordButton = ({ recording }) => (
  <button
    type="button"
    className={`insp-record${recording ? ' is-on' : ''}`}
    aria-pressed={recording}
    title={recording ? 'Recording. Click to pause' : 'Paused. Click to record'}
    aria-label={recording ? 'Pause recording' : 'Resume recording'}
    onClick={() => setSettings({ recording: !recording })}
  >
    <span className="insp-record-dot" aria-hidden="true" />
  </button>
);

const IconClear = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="5.5" /><path d="M4.2 11.8l7.6-7.6" />
  </svg>
);
const IconGear = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </svg>
);

export const Settings = ({ settings, onExport, onOpenTab, onClose }) => {
  const [patterns, setPatterns] = useState((settings.patterns || []).join('\n'));
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.insp-gear')) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const savePatterns = () => setSettings({ patterns: patterns.split('\n').map(s => s.trim()).filter(Boolean) });
  return (
    <div className="insp-settings" ref={ref} role="dialog" aria-label="Settings">
      <label className="insp-setting">
        <span>Keep the last</span>
        <select
          value={settings.maxEntries}
          onChange={e => {
            const max = Number(e.target.value);
            setSettings({ maxEntries: max });
            chrome.runtime.sendMessage({ type: 'prune', max }).catch(() => {});
          }}
        >
          {[500, 2000, 5000, 20000].map(n => <option key={n} value={n}>{n.toLocaleString()} requests</option>)}
        </select>
      </label>
      <label className="insp-setting insp-setting--block">
        <span>Also record URLs containing</span>
        <textarea rows={3} value={patterns} onChange={e => setPatterns(e.target.value)} placeholder={'/my-proxy/graphql\none per line'} className="mono" />
        <span className="insp-hint">Contember paths (<code>/content/…</code>, <code>/system/…</code>, <code>/tenant</code>) are recorded behind any prefix. Add patterns for other proxies. Applies to pages loaded after saving.</span>
      </label>
      <div className="insp-setting-actions">
        <button type="button" className="btn btn-small" onClick={savePatterns} disabled={patterns === (settings.patterns || DEFAULTS.patterns).join('\n')}>Save patterns</button>
        <button type="button" className="btn-quiet btn-small" onClick={onExport}>Export shown requests</button>
        {onOpenTab && <button type="button" className="btn-quiet btn-small" onClick={onOpenTab}>Open in a tab</button>}
      </div>
    </div>
  );
};

export const Toolbar = ({
  settings, filters, setFilters, entities, searchRef, scope, onScope, onClear, onExport, onOpenTab,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="insp-toolbar" role="toolbar" aria-label="Requests">
      <RecordButton recording={settings.recording} />
      <button type="button" className="btn-quiet insp-icon-btn" onClick={onClear} title="Clear history" aria-label="Clear history"><IconClear /></button>
      <input
        ref={searchRef}
        type="search"
        className="insp-search"
        value={filters.text}
        onChange={e => setFilters({ ...filters, text: e.target.value })}
        onKeyDown={e => { if (e.key === 'Escape' && filters.text) { e.stopPropagation(); setFilters({ ...filters, text: '' }); } }}
        placeholder="Filter by field, entity, ID or error"
        title="Press / to focus"
        aria-label="Filter requests"
      />
      <div className="chips" role="group" aria-label="Operation">
        <Chip on={filters.ops.includes('query')} onClick={() => setFilters({ ...filters, ops: toggle(filters.ops, 'query') })} tone="query">Queries</Chip>
        <Chip on={filters.ops.includes('mutation')} onClick={() => setFilters({ ...filters, ops: toggle(filters.ops, 'mutation') })} tone="mutation">Mutations</Chip>
      </div>
      <div className="chips" role="group" aria-label="API">
        {['content', 'system', 'tenant'].map(api => (
          <Chip key={api} on={filters.apis.includes(api)} onClick={() => setFilters({ ...filters, apis: toggle(filters.apis, api) })}>
            {api[0].toUpperCase() + api.slice(1)}
          </Chip>
        ))}
      </div>
      <Chip on={filters.failedOnly} onClick={() => setFilters({ ...filters, failedOnly: !filters.failedOnly })} tone="failed">Failed</Chip>
      {entities.length > 0 && (
        <select className="insp-entity" value={filters.entity} onChange={e => setFilters({ ...filters, entity: e.target.value })} aria-label="Entity">
          <option value="">Any entity</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      )}
      <span className="insp-toolbar-end">
        {onScope && (
          <span className="seg" role="group" aria-label="Scope">
            <button type="button" className={`seg-btn${scope === 'tab' ? ' is-on' : ''}`} aria-pressed={scope === 'tab'} onClick={() => onScope('tab')}>This tab</button>
            <button type="button" className={`seg-btn${scope === 'all' ? ' is-on' : ''}`} aria-pressed={scope === 'all'} onClick={() => onScope('all')}>All tabs</button>
          </span>
        )}
        <button type="button" className={`btn-quiet insp-icon-btn insp-gear${open ? ' is-on' : ''}`} aria-expanded={open} aria-label="Settings" title="Settings" onClick={() => setOpen(!open)}><IconGear /></button>
      </span>
      {open && <Settings settings={settings} onExport={onExport} onOpenTab={onOpenTab} onClose={() => setOpen(false)} />}
    </div>
  );
};
