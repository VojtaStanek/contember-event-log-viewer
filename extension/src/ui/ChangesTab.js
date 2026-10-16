import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../../src/context';
import { fetchEvents } from '../../../src/api';
import { href } from '../../../src/useHashRoute';
import { shortId } from '../../../src/format';
import { resolveTable } from '../../../src/schema';
import { EventStream } from '../../../src/components/EventStream';
import { RowView } from '../../../src/components/RowView';
import { IdentityView, TableView, TransactionView } from '../../../src/components/StreamViews';
import { tableFor } from './session';

const WRITES = new Set(['create', 'update', 'upsert', 'delete']);
const LIKELY_MS = 60 * 1000;
const VERB = { create: 'created', update: 'updated', upsert: 'upserted', delete: 'deleted', get: 'loaded' };

// Problems talking to the engine through the admin's session, in plain words.
export const SessionNotice = ({ error, meta, onRetry }) => {
  const noTab = error && error.status === 'no-tab';
  const denied = error && (error.status === 403 || error.graphql);
  return (
    <div className="notice notice--error" role="alert">
      <p className="notice-text">
        {denied
          ? "Your admin user can't read the event log (it needs history access). The rest of the inspector still works."
          : error.message || String(error)}
      </p>
      {noTab && meta.pageUrl && (
        <button type="button" className="btn btn-small" onClick={() => chrome.tabs.create({ url: meta.pageUrl })}>Open the admin</button>
      )}
      {onRetry && !denied && <button type="button" className="btn btn-small" onClick={onRetry}>Try again</button>}
    </div>
  );
};

const useSchemaGate = () => {
  const { schemaStatus, schemaError } = useApp();
  if (schemaStatus === 'idle' || schemaStatus === 'loading') return { ready: false, node: <p className="insp-hint" role="status">Loading the project schema…</p> };
  if (schemaStatus === 'error') return { ready: false, error: schemaError };
  return { ready: true };
};

const distance = (iso, start, end) => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  if (t < start) return start - t;
  if (t > end) return t - end;
  return 0;
};

const seconds = (ms) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`);

// For each record a mutation wrote, the event-log transaction closest in time to the request.
const MatchedTransactions = ({ meta, writes }) => {
  const { conn, schema } = useApp();
  const [state, setState] = useState({ loading: true, error: null, matches: [] });
  const [attempt, setAttempt] = useState(0);
  const start = meta.startedAt;
  const end = meta.startedAt + (meta.duration || 0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: null, matches: [] });
    Promise.all(writes.slice(0, 5).map(async (record) => {
      const tableName = tableFor(schema, record.entity);
      const events = await fetchEvents(conn, {
        filter: { rows: [{ tableName, primaryKey: [record.id] }] },
        order: 'CREATED_AT_DESC',
        limit: 100,
      }, controller.signal);
      let best = null;
      for (const ev of events) {
        const d = distance(ev.createdAt, start, end);
        if (!best || d < best.delta) best = { event: ev, delta: d };
      }
      return { record, tableName, ...(best || {}) };
    }))
      .then(matches => setState({ loading: false, error: null, matches }))
      .catch(e => {
        if (e.name !== 'AbortError') setState({ loading: false, error: e, matches: [] });
      });
    return () => controller.abort();
  }, [conn, schema, writes, start, end, attempt]);

  if (state.loading) return <p className="insp-hint" role="status">Looking up the changes in the event log…</p>;
  if (state.error) return <SessionNotice error={state.error} meta={meta} onRetry={() => setAttempt(n => n + 1)} />;

  const txs = new Map();
  const unmatched = [];
  for (const m of state.matches) {
    if (m.event && m.delta <= LIKELY_MS) {
      const tx = txs.get(m.event.transactionId) || { id: m.event.transactionId, delta: m.delta, records: [] };
      tx.delta = Math.min(tx.delta, m.delta);
      tx.records.push(m);
      txs.set(tx.id, tx);
    } else {
      unmatched.push(m);
    }
  }

  return (
    <>
      {[...txs.values()].map(tx => (
        <section className="insp-section" key={tx.id}>
          <header className="insp-section-head">
            <h3 className="insp-section-title">Transaction <span className="mono">{shortId(tx.id)}</span></h3>
            <span className="insp-hint-inline" title="Matched by comparing the event time with the time of this request">
              {tx.delta === 0 ? 'Made during this request' : `Made ${seconds(tx.delta)} from this request`} · matched by time
            </span>
            <span className="insp-section-links">
              {tx.records.map(m => (
                <a key={`${m.record.entity}|${m.record.id}`} href={href.row(m.tableName, m.record.id)}>
                  {m.record.entity} {shortId(m.record.id)} history
                </a>
              ))}
              <a href={href.tx(tx.id)}>Open transaction</a>
            </span>
          </header>
          <EventStream filter={{ transactions: [tx.id] }} all order="asc" showRow showTxLink={false} empty="No events in this transaction." />
        </section>
      ))}
      {unmatched.map(m => (
        <section className="insp-section" key={`${m.record.entity}|${m.record.id}`}>
          <p className="insp-hint">
            {m.event
              ? <>No change to {m.record.entity} <span className="mono">{shortId(m.record.id)}</span> close to the time of this request. It may not have changed any value. </>
              : <>The event log has no changes for {m.record.entity} <span className="mono">{shortId(m.record.id)}</span>. </>}
            <a href={href.row(m.tableName, m.record.id)}>Open its history</a>
          </p>
        </section>
      ))}
    </>
  );
};

export const ChangesTab = ({ meta }) => {
  const gate = useSchemaGate();
  const writes = useMemo(() => (meta.records || []).filter(r => WRITES.has(r.action)), [meta.records]);
  const reads = (meta.records || []).filter(r => !WRITES.has(r.action));

  if (meta.api !== 'content') {
    return <p className="insp-hint">The event log covers data changed through the Content API. This is a {meta.api} API request.</p>;
  }
  if (gate.error) return <SessionNotice error={gate.error} meta={meta} />;
  if (!gate.ready) return gate.node;

  return (
    <div className="insp-changes">
      {meta.operationType === 'mutation' && meta.outcome !== 'ok' && (
        <section className="insp-section">
          <p className="insp-hint">
            {meta.outcome === 'aborted'
              ? 'The admin cancelled this mutation, so it may not have reached the server.'
              : "This mutation reported a failure, so it wasn't applied and the event log has no changes from it."}
          </p>
          {writes.length > 0 && (
            <ul className="insp-records">
              {writes.map(r => (
                <li key={`${r.entity}|${r.id}`}>
                  <a href={href.row(r.entity, r.id)}>
                    <span className="row-link-entity">{r.entity}</span> <span className="mono">{shortId(r.id)}</span> history
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {meta.operationType === 'mutation' && meta.outcome === 'ok' && writes.length > 0 && <MatchedTransactions meta={meta} writes={writes} />}
      {meta.operationType === 'mutation' && meta.outcome === 'ok' && writes.length === 0 && (
        <p className="insp-hint">
          This mutation doesn't say which record it wrote: there is no <code>by: {'{ id }'}</code> argument and no <code>node {'{ id }'}</code> in the result.
          {meta.entities.length > 0 && ' See the latest changes instead: '}
          {meta.entities.map((e, i) => (
            <React.Fragment key={e}>{i > 0 && ', '}<a href={href.table(e)}>{e}</a></React.Fragment>
          ))}
        </p>
      )}
      {reads.length > 0 && (
        <section className="insp-section">
          <h3 className="insp-section-title">Records this request loaded</h3>
          <ul className="insp-records">
            {reads.map(r => (
              <li key={`${r.entity}|${r.id}`}>
                <a href={href.row(r.entity, r.id)}>
                  <span className="row-link-entity">{r.entity}</span> <span className="mono">{shortId(r.id)}</span>
                </a>
                <span className="insp-muted"> {VERB[r.action] || r.action} by {r.alias}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {meta.operationType !== 'mutation' && reads.length === 0 && (
        <p className="insp-hint">
          This query didn't load a single record by ID, so there's no one history to show.
          {meta.entities.length > 0 && ' Latest changes: '}
          {meta.entities.map((e, i) => (
            <React.Fragment key={e}>{i > 0 && ', '}<a href={href.table(e)}>{e}</a></React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
};

// A viewer route (#/row, #/tx, #/table, #/identity) for the selected request's project.
export const ViewerPane = ({ route, hash, meta, backLabel, onBack }) => {
  const { schema } = useApp();
  const gate = useSchemaGate();
  let view = null;
  if (gate.ready) {
    if (route.name === 'row') view = <RowView key={hash} table={resolveTable(schema, route.table)} pk={route.pk} />;
    else if (route.name === 'tx') view = <TransactionView key={hash} id={route.id} />;
    else if (route.name === 'table') view = <TableView key={hash} table={resolveTable(schema, route.table)} />;
    else if (route.name === 'identity') view = <IdentityView key={hash} id={route.id} label={route.label} />;
  }
  return (
    <div className="insp-viewer">
      <div className="insp-viewer-bar">
        <button type="button" className="btn-quiet" onClick={onBack}>← {backLabel}</button>
        <span className="insp-muted">{meta.project} · {meta.stage}</span>
      </div>
      <div className="insp-viewer-body">
        {gate.error && <div className="insp-pad"><SessionNotice error={gate.error} meta={meta} /></div>}
        {!gate.ready && !gate.error && <div className="insp-pad">{gate.node}</div>}
        {view}
      </div>
    </div>
  );
};
