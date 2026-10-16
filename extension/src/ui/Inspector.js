import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate, useHashRoute } from '../../../src/useHashRoute';
import { Logo } from '../../../src/components/Logo';
import { Toasts } from '../../../src/components/Notices';
import { getBody, listRequests } from '../lib/db';
import { DEFAULTS, getSettings, onSettingsChange, setSettings } from '../lib/settings';
import { hasActiveFilters, matchesFilters } from '../lib/filter';
import { summarize } from '../lib/analyze';
import { RequestList } from './RequestList';
import { RequestDetail, TABS } from './RequestDetail';
import { Toolbar } from './Toolbar';
import { ViewerPane } from './ChangesTab';
import { SessionProvider } from './session';

const EMPTY_FILTERS = { text: '', ops: [], apis: [], failedOnly: false, entity: '' };

const remembered = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // A convenience only.
    }
  },
};

// Requests for a tab (or all tabs), newest first, kept live from background broadcasts.
const useRequests = (tabId) => {
  const [state, setState] = useState({ requests: [], loading: true });
  const [freshIds, setFreshIds] = useState(() => new Set());
  const lastId = useRef(0);

  const reload = useCallback(() => {
    listRequests({ tabId }).then(requests => {
      lastId.current = requests.length ? requests[0].id : 0;
      setState({ requests, loading: false });
    });
  }, [tabId]);

  useEffect(() => {
    setState({ requests: [], loading: true });
    reload();
    let pending = null;
    const onMessage = (msg) => {
      if (!msg) return;
      if (msg.type === 'cleared' || msg.type === 'pruned') {
        if (msg.tabId == null || tabId == null || msg.tabId === tabId) reload();
        return;
      }
      if (msg.type !== 'changed' || (tabId != null && msg.tabId !== tabId)) return;
      // Coalesce bursts (the admin often sends several requests at once).
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        listRequests({ tabId, afterId: lastId.current }).then(added => {
          if (!added.length) return;
          lastId.current = Math.max(lastId.current, added[0].id);
          setState(s => {
            const known = new Set(s.requests.map(r => r.id));
            return { ...s, requests: [...added.filter(r => !known.has(r.id)), ...s.requests] };
          });
          const ids = added.map(r => r.id);
          setFreshIds(f => new Set([...f, ...ids]));
          setTimeout(() => setFreshIds(f => new Set([...f].filter(id => !ids.includes(id)))), 2400);
        });
      }, 80);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      clearTimeout(pending);
    };
  }, [tabId, reload]);

  return { ...state, freshIds };
};

// Has relay.js been injected into the inspected tab? Not when the tab was open before
// the extension was installed or updated.
const useTabRecording = (tabId) => {
  const [state, setState] = useState('unknown');
  useEffect(() => {
    if (tabId == null) return undefined;
    let live = true;
    const check = async () => {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab || !/^https?:/.test(tab.url || '')) {
        if (live) setState('unsupported');
        return;
      }
      const r = await chrome.tabs.sendMessage(tabId, { type: 'ping' }, { frameId: 0 }).catch(() => null);
      if (live) setState(r && r.ok ? 'ready' : 'missing');
    };
    check();
    const onUpdated = (id, info) => { if (id === tabId && info.status === 'complete') check(); };
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => { live = false; chrome.tabs.onUpdated.removeListener(onUpdated); };
  }, [tabId]);
  return state;
};

const download = (name, data) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const EmptyList = ({ total, filtered, settings, tabState, onReload, onClearFilters, scope }) => {
  if (total > 0 && filtered === 0) {
    return (
      <div className="insp-empty">
        <p>No requests match the filter.</p>
        <button type="button" className="btn btn-small" onClick={onClearFilters}>Clear filters</button>
      </div>
    );
  }
  if (tabState === 'unsupported' && total === 0) {
    return (
      <div className="insp-empty">
        <p className="insp-empty-title">Nothing to record on this page</p>
        <p>Open Contember Admin in this tab. Requests are recorded on http and https pages only.</p>
      </div>
    );
  }
  if (tabState === 'missing' && total === 0) {
    return (
      <div className="insp-empty">
        <p className="insp-empty-title">Reload the page to start recording</p>
        <p>This tab was open before the extension was installed or updated, so its requests can't be seen yet.</p>
        {onReload && <button type="button" className="btn btn-primary btn-small" onClick={onReload}>Reload page</button>}
      </div>
    );
  }
  return (
    <div className="insp-empty">
      <p className="insp-empty-title">{settings.recording ? 'Waiting for Contember requests' : 'Recording is paused'}</p>
      <p>
        {settings.recording
          ? scope === 'tab'
            ? 'Use Contember Admin in this tab. Its Content, System and Tenant API calls show up here as they happen, and stay after reloads.'
            : 'Use Contember Admin in any tab. Its API calls show up here as they happen.'
          : 'New requests are not saved. Press the record button to resume.'}
      </p>
    </div>
  );
};

const Placeholder = ({ requests }) => {
  const failed = requests.filter(r => r.outcome === 'error').length;
  return (
    <div className="insp-placeholder">
      <Logo size={40} />
      <p className="insp-empty-title">Select a request</p>
      <p>See its query, variables and response, why it failed, and what it changed in the event log.</p>
      {requests.length > 0 && (
        <p className="insp-muted">{requests.length} recorded{failed ? `, ${failed} failed` : ''}. Use ↑ ↓ to move through them.</p>
      )}
    </div>
  );
};

export const Inspector = ({ mode, tabId, onReloadTab }) => {
  const [settings, setSettingsState] = useState(DEFAULTS);
  const [scope, setScope] = useState(() => (tabId != null ? 'tab' : 'all'));
  const scopeTabId = scope === 'tab' ? tabId : null;
  const { requests, loading, freshIds } = useRequests(scopeTabId);
  const tabState = useTabRecording(mode === 'panel' ? tabId : null);
  const [filters, setFiltersState] = useState(() => ({ ...EMPTY_FILTERS, ...remembered.get(`insp.filters.${mode}`, {}), text: '' }));
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTabState] = useState(() => remembered.get('insp.tab', 'overview'));
  const [toasts, setToasts] = useState([]);
  const [newCount, setNewCount] = useState(0);
  const [route, hash] = useHashRoute();
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const detailRef = useRef(null);
  const seenTop = useRef(0);

  useEffect(() => {
    getSettings().then(setSettingsState);
    return onSettingsChange(changed => setSettingsState(s => ({ ...s, ...changed })));
  }, []);

  // A viewer route only makes sense for the request it was opened from.
  useEffect(() => {
    if (route.name !== 'home') navigate('#/');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilters = (next) => {
    setFiltersState(next);
    const { text, ...rest } = next;
    remembered.set(`insp.filters.${mode}`, rest);
  };
  const setTab = (next) => {
    setTabState(next);
    remembered.set('insp.tab', next);
    if (route.name !== 'home') navigate('#/');
  };

  const notify = useCallback((message, kind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  const visible = useMemo(() => requests.filter(r => matchesFilters(r, filters)), [requests, filters]);
  const entities = useMemo(() => [...new Set(requests.flatMap(r => r.entities || []))].sort(), [requests]);
  const showProject = useMemo(() => new Set(requests.filter(r => r.project).map(r => `${r.project}|${r.stage}`)).size > 1, [requests]);
  const selected = selectedId ? requests.find(r => r.id === selectedId) || null : null;

  // Live updates: rows are inserted at the top. When the list is scrolled down, count
  // them in a "new requests" pill instead of making the user look for them.
  useEffect(() => {
    const top = requests.length ? requests[0].id : 0;
    const el = listRef.current;
    if (seenTop.current && top > seenTop.current && el && el.scrollTop > 8) {
      setNewCount(n => n + requests.filter(r => r.id > seenTop.current).length);
    }
    seenTop.current = top;
  }, [requests]);

  // Failed-request badge on the toolbar icon clears while the user is looking.
  useEffect(() => {
    if (tabId == null) return undefined;
    const markSeen = () => {
      if (document.visibilityState === 'visible') chrome.runtime.sendMessage({ type: 'seen', tabId }).catch(() => {});
    };
    markSeen();
    document.addEventListener('visibilitychange', markSeen);
    return () => document.removeEventListener('visibilitychange', markSeen);
  }, [tabId, requests.length]);

  const select = (id) => {
    setSelectedId(id);
    if (route.name !== 'home') navigate('#/');
  };

  const onListKey = (e) => {
    if (!visible.length) return;
    const at = visible.findIndex(r => r.id === selectedId);
    let next = null;
    if (e.key === 'ArrowDown') next = visible[Math.min(visible.length - 1, at + 1)];
    else if (e.key === 'ArrowUp') next = visible[Math.max(0, at - 1)];
    else if (e.key === 'Home') next = visible[0];
    else if (e.key === 'End') next = visible[visible.length - 1];
    else if ((e.key === 'Enter' || e.key === 'ArrowRight') && selected) {
      e.preventDefault();
      detailRef.current && detailRef.current.focus();
      return;
    }
    if (next) {
      e.preventDefault();
      select(next.id);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current && searchRef.current.focus();
      } else if (e.key === 'Escape' && !typing) {
        if (route.name !== 'home') window.history.back();
        else if (selectedId && window.matchMedia('(max-width: 720px)').matches) setSelectedId(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [route.name, selectedId]);

  const clear = () => {
    const count = requests.length;
    chrome.runtime.sendMessage({ type: 'clear', tabId: scopeTabId }).then(() => {
      setSelectedId(null);
      notify(count ? `Cleared ${count} ${count === 1 ? 'request' : 'requests'}` : 'History is empty');
    }).catch(() => notify("Couldn't clear the history", 'error'));
  };

  const exportShown = async () => {
    const items = await Promise.all(visible.map(async meta => ({ ...meta, body: await getBody(meta.id) })));
    download(`contember-requests-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`, items);
    notify(`Exported ${items.length} ${items.length === 1 ? 'request' : 'requests'}`);
  };

  const openTab = mode === 'panel'
    ? () => chrome.tabs.create({ url: chrome.runtime.getURL(`history.html?tabId=${tabId}`) })
    : null;

  const scrollTop = () => {
    if (listRef.current) listRef.current.scrollTop = 0;
    setNewCount(0);
  };

  const failedCount = useMemo(() => requests.filter(r => r.outcome === 'error').length, [requests]);
  const viewerActive = selected && route.name !== 'home';

  return (
    <div className={`insp insp--${mode}${selected ? ' has-selection' : ''}`}>
      {mode === 'page' && (
        <header className="insp-head">
          <span className="brand"><Logo />Contember requests</span>
        </header>
      )}
      <Toolbar
        settings={settings}
        filters={filters}
        setFilters={setFilters}
        entities={entities}
        searchRef={searchRef}
        scope={scope}
        onScope={mode === 'page' && tabId != null ? (s) => { setScope(s); setSelectedId(null); } : null}
        onClear={clear}
        onExport={exportShown}
        onOpenTab={openTab}
      />
      {!settings.recording && (
        <div className="insp-banner" role="status">
          Recording is paused. New requests aren't saved.
          <button type="button" className="btn btn-small" onClick={() => setSettings({ recording: true })}>Resume</button>
        </div>
      )}
      <div className="insp-main">
        <section className="insp-list-pane" aria-label="Requests">
          {newCount > 0 && (
            <button type="button" className="insp-new-pill" onClick={scrollTop}>
              ↑ {newCount} new {newCount === 1 ? 'request' : 'requests'}
            </button>
          )}
          {!loading && visible.length === 0 ? (
            <EmptyList
              total={requests.length}
              filtered={visible.length}
              settings={settings}
              tabState={tabState}
              scope={scope}
              onReload={onReloadTab}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
            />
          ) : (
            <RequestList
              requests={visible}
              selectedId={selectedId}
              freshIds={freshIds}
              showProject={showProject}
              onSelect={select}
              listRef={listRef}
              onKeyDown={onListKey}
              onScroll={(e) => { if (e.currentTarget.scrollTop <= 8 && newCount) setNewCount(0); }}
            />
          )}
          <footer className="insp-status">
            {hasActiveFilters(filters) ? `${visible.length} of ${requests.length}` : requests.length} {requests.length === 1 ? 'request' : 'requests'}
            {failedCount > 0 && <span className="insp-tone-error"> · {failedCount} failed</span>}
            {hasActiveFilters(filters) && (
              <button type="button" className="btn-inline" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
            )}
          </footer>
        </section>
        <section className="insp-detail-pane" ref={detailRef} tabIndex={-1} aria-label="Details">
          {!selected && <Placeholder requests={requests} />}
          {selected && (
            <SessionProvider meta={selected} active={tab === 'changes' || viewerActive} notify={notify}>
              {viewerActive ? (
                <ViewerPane
                  route={route}
                  hash={hash}
                  meta={selected}
                  backLabel={summarize(selected).text}
                  onBack={() => window.history.back()}
                />
              ) : (
                <RequestDetail
                  key={selected.id}
                  meta={selected}
                  tab={TABS.some(([id]) => id === tab) ? tab : 'overview'}
                  onTab={setTab}
                  notify={notify}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </SessionProvider>
          )}
        </section>
      </div>
      <Toasts toasts={toasts} />
    </div>
  );
};
