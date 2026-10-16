import React, { useState } from 'react';
import { useApp } from '../context';
import { content } from '../api';
import { collectionRelations, gqlNames, paginateFieldName } from '../schema';
import { RowLink } from './Value';
import { ErrorNotice } from './Notices';

const PAGE = 20;

const Relation = ({ entity, pk, field }) => {
  const { conn, schema } = useApp();
  const target = schema.entities[field.target];
  const names = gqlNames(entity);
  const single = field.type === 'OneHasOne';
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ ids: [], total: null, loading: false, error: null, done: false, paginate: true });

  const run = (query) => content(conn, `query ($by: ${names.uniqueWhere}!) { row: ${names.get}(by: $by) { ${query} } }`, {
    by: { [entity.primary]: pk },
  });

  const load = async () => {
    const offset = state.ids.length;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      if (single) {
        const data = await run(`rel: ${field.name} { ${target.primary} }`);
        const rel = data.row && data.row.rel;
        setState(s => ({ ...s, ids: rel ? [rel[target.primary]] : [], total: rel ? 1 : 0, loading: false, done: true }));
        return;
      }
      if (state.paginate) {
        try {
          const data = await run(`rel: ${paginateFieldName(field)}(first: ${PAGE}, skip: ${offset}) {
            pageInfo { totalCount } edges { node { ${target.primary} } }
          }`);
          const rel = data.row ? data.row.rel : { pageInfo: { totalCount: 0 }, edges: [] };
          const ids = rel.edges.map(e => e.node[target.primary]);
          setState(s => {
            const all = [...s.ids, ...ids];
            return { ...s, ids: all, total: rel.pageInfo.totalCount, loading: false, done: all.length >= rel.pageInfo.totalCount };
          });
          return;
        } catch (e) {
          // Older engines don't expose paginate<Field>; fall back to the plain list below.
          if (!e.graphql) throw e;
        }
      }
      const data = await run(`rel: ${field.name}(limit: ${PAGE + 1}, offset: ${offset}) { ${target.primary} }`);
      const list = data.row ? data.row.rel : [];
      setState(s => ({
        ...s,
        paginate: false,
        ids: [...s.ids, ...list.slice(0, PAGE).map(r => r[target.primary])],
        loading: false,
        done: list.length <= PAGE,
      }));
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e }));
    }
  };

  const toggle = () => {
    if (!open && state.ids.length === 0 && !state.done) load();
    setOpen(!open);
  };

  return (
    <li className="rel">
      <button type="button" className="disclosure rel-toggle" aria-expanded={open} onClick={toggle}>
        <span className="rel-name">{field.name}</span>
        <span className="rel-target">{target.name}</span>
        {state.total !== null && <span className="rel-count">{state.total}</span>}
      </button>
      {open && (
        <div className="rel-body">
          {state.ids.length > 0 && (
            <ul className="rel-list">
              {state.ids.map(id => (
                <li key={id}><RowLink table={target.tableName} pk={id} entityName={target.name} /></li>
              ))}
            </ul>
          )}
          {state.loading && <p className="panel-hint" role="status">Loading…</p>}
          {state.error && <ErrorNotice error={state.error} onRetry={load} />}
          {!state.loading && !state.error && state.done && state.ids.length === 0 && (
            <p className="panel-hint">No {target.name} records connected right now.</p>
          )}
          {!state.loading && !state.error && !state.done && state.ids.length > 0 && (
            <button type="button" className="btn btn-small" onClick={load}>
              Load more{state.total !== null ? ` (${state.total - state.ids.length} left)` : ''}
            </button>
          )}
        </div>
      )}
    </li>
  );
};

export const RelationsPanel = ({ entity, pk }) => {
  const relations = collectionRelations(entity);
  if (relations.length === 0) return null;
  return (
    <section className="panel-section">
      <h2 className="panel-heading">Related records</h2>
      <p className="panel-hint">Records connected right now. Expand a relation to load it.</p>
      <ul className="rels">
        {relations.map(f => <Relation key={f.name} entity={entity} pk={pk} field={f} />)}
      </ul>
    </section>
  );
};
