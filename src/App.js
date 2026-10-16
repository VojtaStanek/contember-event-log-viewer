import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import { AppContext } from './context';
import { tableLabel } from './schema';
import { useSchema } from './useSchema';
import { href, useHashRoute } from './useHashRoute';
import { shortId } from './format';
import { ConnectionPanel, profileLabel } from './components/ConnectionPanel';
import { SearchBar } from './components/SearchBar';
import { Logo } from './components/Logo';
import { RowView } from './components/RowView';
import { IdentityView, TableView, TransactionView } from './components/StreamViews';
import { ErrorNotice, Toasts } from './components/Notices';

const PROFILES_KEY = 'eventLogProfiles';
const ACTIVE_KEY = 'eventLogActiveProfile';
const RECENT_KEY = 'eventLogRecent';

const storage = {
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
      // Storage may be unavailable (private mode); the app still works for this session.
    }
  },
};

const loadProfiles = () =>
  (storage.get(PROFILES_KEY, []) || []).map(p => ({
    ...p,
    id: p.id || `${p.apiEndpoint}-${p.projectName}`,
    stage: p.stage || 'live',
  }));

const routeLabel = (route, schema) => {
  switch (route.name) {
    case 'row': return `${tableLabel(schema, route.table)} ${shortId(route.pk)}`;
    case 'tx': return `Transaction ${shortId(route.id)}`;
    case 'table': return `${tableLabel(schema, route.table)} changes`;
    case 'identity': return route.label || `Identity ${shortId(route.id)}`;
    default: return null;
  }
};

const Home = ({ recent, connected }) => (
  <main className="home">
    <h1 className="home-title">Trace what happened to a record.</h1>
    <p className="home-text">
      {connected
        ? 'Open a record by entity and ID, an entity alone for its latest changes, or paste a transaction ID. Press / to jump to the search.'
        : 'Connect to a Contember project to start. You need the API endpoint, project name and a token with history access.'}
    </p>
    {connected && recent.length > 0 && (
      <section className="home-recent">
        <h2 className="panel-heading">Recently opened</h2>
        <ul>
          {recent.map(r => (
            <li key={r.hash}><a href={r.hash}>{r.label}</a></li>
          ))}
        </ul>
      </section>
    )}
  </main>
);

const App = () => {
  const [route, hash] = useHashRoute();
  const [profiles, setProfiles] = useState(loadProfiles);
  const [activeId, setActiveId] = useState(() => {
    const saved = storage.get(ACTIVE_KEY, null);
    const list = loadProfiles();
    return (list.find(p => p.id === saved) || list[0] || {}).id || null;
  });
  const [conn, setConn] = useState(() => loadProfiles().find(p => p.id === activeId) || null);
  const [panelOpen, setPanelOpen] = useState(() => !conn);
  const [toasts, setToasts] = useState([]);
  const [trail, setTrail] = useState([]);
  const [recent, setRecent] = useState(() => storage.get(RECENT_KEY, []));
  const schema = useSchema(conn);

  useEffect(() => storage.set(PROFILES_KEY, profiles), [profiles]);
  useEffect(() => storage.set(ACTIVE_KEY, activeId), [activeId]);

  const notify = useCallback((message, kind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  // Navigation trail: revisiting a step cuts the trail back to it.
  useEffect(() => {
    const label = routeLabel(route, schema.index);
    if (!label) return;
    setTrail(t => {
      const at = t.findIndex(s => s.hash === hash);
      if (at !== -1) return t.slice(0, at + 1).map(s => (s.hash === hash ? { hash, label } : s));
      return [...t, { hash, label }].slice(-8);
    });
    if (route.name === 'row') {
      setRecent(r => {
        const next = [{ hash, label }, ...r.filter(x => x.hash !== hash)].slice(0, 12);
        storage.set(RECENT_KEY, next);
        return next;
      });
    }
  }, [hash, schema.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectProfile = (id) => {
    const p = profiles.find(x => x.id === id);
    if (!p) return;
    setActiveId(id);
    setConn(p);
    setTrail([]);
    setPanelOpen(false);
  };

  const saveProfile = (data, id) => {
    const profile = { ...data, id: id || Date.now().toString(36) };
    setProfiles(list => (id ? list.map(p => (p.id === id ? profile : p)) : [...list, profile]));
    setActiveId(profile.id);
    setConn(profile);
    notify(`Saved profile ${profileLabel(profile)}`);
  };

  const deleteProfile = (id) => {
    setProfiles(list => list.filter(p => p.id !== id));
    if (id === activeId) {
      setActiveId(null);
      setConn(null);
    }
    notify('Deleted profile');
  };

  const connect = (data) => {
    setConn(data);
    setTrail([]);
    setPanelOpen(false);
  };

  const ctx = useMemo(
    () => ({ conn, schema: schema.index, schemaStatus: schema.status, notify }),
    [conn, schema.index, schema.status, notify],
  );

  // Views don't wait for the schema: events load in parallel and labels upgrade once it arrives.
  const ready = conn && schema.status !== 'error';
  let view;
  if (!ready || route.name === 'home') view = <Home recent={recent} connected={!!conn} />;
  else if (route.name === 'row') view = <RowView key={hash} table={route.table} pk={route.pk} />;
  else if (route.name === 'tx') view = <TransactionView key={hash} id={route.id} />;
  else if (route.name === 'table') view = <TableView key={hash} table={route.table} />;
  else if (route.name === 'identity') view = <IdentityView key={hash} id={route.id} label={route.label} />;

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <a className="brand" href={href.home()}><Logo />Event log</a>
          <button
            type="button"
            className={`profile-chip${panelOpen ? ' is-on' : ''}`}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen(!panelOpen)}
          >
            {conn ? profileLabel(conn) : 'Set up connection'}
            {conn && <span className="profile-stage">{conn.stage || 'live'}</span>}
          </button>
          <SearchBar route={route} disabled={!ready} />
        </header>

        {panelOpen && (
          <ConnectionPanel
            profiles={profiles}
            activeId={activeId}
            onSelect={selectProfile}
            onSave={saveProfile}
            onDelete={deleteProfile}
            onConnect={connect}
            onClose={conn ? () => setPanelOpen(false) : null}
          />
        )}

        {schema.status === 'loading' && <div className="banner" role="status">Loading schema…</div>}
        {schema.status === 'error' && (
          <div className="banner banner--error">
            <ErrorNotice error={schema.error} onRetry={() => setConn({ ...conn })} />
          </div>
        )}

        {ready && trail.length > 1 && (
          <nav className="trail" aria-label="Navigation trail">
            <ol>
              {trail.map(step => (
                <li key={step.hash}>
                  {step.hash === hash ? <span aria-current="page">{step.label}</span> : <a href={step.hash}>{step.label}</a>}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {view}
        <Toasts toasts={toasts} />
      </div>
    </AppContext.Provider>
  );
};

export default App;
