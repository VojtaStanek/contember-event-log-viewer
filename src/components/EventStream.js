import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { connectionKey, fetchEvents } from '../api';
import { TxGroup } from './EventCard';
import { ErrorNotice } from './Notices';

const PAGE = 50;
// Engine maximum. Asking for everything lets Postgres filter by row/transaction
// first and sort the few matches; ORDER BY + small LIMIT makes it walk the whole
// time index instead.
const ALL = 10000;

// Loaded events survive navigation so going back doesn't refetch.
const cache = new Map();

const groupByTransaction = (events) => {
  const groups = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last[0].transactionId === ev.transactionId) last.push(ev);
    else groups.push([ev]);
  }
  return groups;
};

const compare = (desc) => (a, b) => {
  const d = a.appliedAt.localeCompare(b.appliedAt) || a.createdAt.localeCompare(b.createdAt);
  return desc ? -d : d;
};

// Rebuilds UpdateEvent.oldValues for the changed columns by replaying events oldest
// first. Only possible when the stream holds a row's complete history; columns whose
// earlier value isn't known stay undefined.
const withPreviousValues = (events) => {
  const rows = new Map();
  const out = new Map();
  for (const ev of [...events].sort(compare(false))) {
    const key = `${ev.tableName}|${(ev.primaryKey || []).join(',')}`;
    if (ev.type === 'CREATE') {
      rows.set(key, { ...ev.newValues });
    } else if (ev.type === 'UPDATE') {
      const state = rows.get(key) || {};
      const oldValues = {};
      for (const column of Object.keys(ev.diffValues || {})) {
        if (column in state) oldValues[column] = state[column];
      }
      out.set(ev.id, { ...ev, oldValues });
      rows.set(key, { ...state, ...ev.diffValues });
    } else if (ev.type === 'DELETE') {
      rows.delete(key);
    }
  }
  return events.map(ev => out.get(ev.id) || ev);
};

const EMPTY = { events: [], hasMore: true, loading: false, error: null };

// all: load every matching event in one request (single record, transaction);
//      type filter and order are then applied in the browser without refetching.
// otherwise: paged by applied time, newest or oldest first; types filtered on the server.
export const EventStream = ({
  filter,
  types = [],
  order = 'desc',
  all = false,
  showRow,
  showTxLink = true,
  onRestore,
  clientFilter,
  focusColumn,
  onSelectColumn,
  refreshToken = 0,
  empty,
}) => {
  const { conn } = useApp();
  const desc = order === 'desc';
  const serverFilter = useMemo(
    () => (all || !types.length ? filter : { ...filter, types }),
    [all, filter, types],
  );
  const serverOrder = desc ? 'APPLIED_AT_DESC' : 'APPLIED_AT_ASC';
  const key = useMemo(
    () => `${connectionKey(conn)}|${all ? 'all' : serverOrder}|${JSON.stringify(serverFilter)}`,
    [conn, all, serverOrder, serverFilter],
  );
  const [state, setState] = useState(() => cache.get(key) || EMPTY);
  const [freshIds, setFreshIds] = useState(null);
  const abortRef = useRef(null);
  const sentinelRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(async (reset) => {
    const current = stateRef.current;
    if (!reset && (current.loading || !current.hasMore)) return;
    abortRef.current && abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const offset = reset ? 0 : current.events.length;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const page = await fetchEvents(
        conn,
        all
          ? { filter: serverFilter, order: 'APPLIED_AT_DESC', limit: ALL }
          : { filter: serverFilter, order: serverOrder, limit: PAGE, offset },
        controller.signal,
      );
      setState(s => {
        const events = reset ? (all ? withPreviousValues(page) : page) : [...s.events, ...page];
        const next = {
          events,
          hasMore: !all && page.length === PAGE,
          truncated: all && page.length === ALL,
          loading: false,
          error: null,
        };
        cache.set(key, next);
        return next;
      });
      if (reset && current.events.length) {
        const before = new Set(current.events.map(e => e.id));
        setFreshIds(new Set(page.filter(e => !before.has(e.id)).map(e => e.id)));
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      setState(s => ({ ...s, loading: false, error: e }));
    }
  }, [conn, all, serverFilter, serverOrder, key]);

  // New query: start from cache or the first page.
  useEffect(() => {
    const cached = cache.get(key);
    setFreshIds(null);
    if (cached) {
      setState(cached);
    } else {
      stateRef.current = EMPTY;
      setState(EMPTY);
      load(true);
    }
    return () => abortRef.current && abortRef.current.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstRefresh = useRef(true);
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    load(true);
  }, [refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the next page when the end of the list scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !stateRef.current.error) load(false);
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [load, state.hasMore, state.events.length]);

  const visible = useMemo(() => {
    let list = state.events;
    if (all && types.length) list = list.filter(e => types.includes(e.type));
    if (clientFilter) list = list.filter(clientFilter);
    // The server orders by applied time only; break ties within a transaction by creation.
    return [...list].sort(compare(desc));
  }, [state.events, all, types, clientFilter, desc]);
  const groups = groupByTransaction(visible);
  const filtered = clientFilter || (all && types.length > 0);

  return (
    <div className="stream">
      {groups.length > 0 && (
        <div className="spine">
          {groups.map(g => (
            <TxGroup
              key={g[0].id}
              events={g}
              showRow={showRow}
              showTxLink={showTxLink}
              onRestore={onRestore}
              freshIds={freshIds}
              focusColumn={focusColumn}
              onSelectColumn={onSelectColumn}
            />
          ))}
        </div>
      )}
      {state.loading && <div className="stream-loading" role="status">Loading events…</div>}
      {state.error && <ErrorNotice error={state.error} onRetry={() => load(state.events.length === 0)} />}
      {!state.loading && !state.error && visible.length === 0 && (
        <div className="empty">
          {filtered && state.events.length > 0
            ? `None of the ${state.events.length} events match the filter.`
            : (empty || 'No events found.')}
        </div>
      )}
      {state.hasMore && !state.error && (
        <div ref={sentinelRef} className="stream-more">
          {!state.loading && state.events.length > 0 && (
            <button type="button" className="btn" onClick={() => load(false)}>
              {desc ? 'Load older events' : 'Load newer events'}
            </button>
          )}
        </div>
      )}
      {!state.hasMore && state.events.length > 0 && (
        <div className="stream-end">
          {state.truncated
            ? `Showing the latest ${ALL} events, the most the server returns at once`
            : `${state.events.length} ${state.events.length === 1 ? 'event' : 'events'} total`}
          {filtered ? `, ${visible.length} shown` : ''}
        </div>
      )}
    </div>
  );
};
