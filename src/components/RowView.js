import React, { useMemo, useState } from 'react';
import { useApp } from '../context';
import { collectionRelations, columnLabel, tableInfo, tableLabel } from '../schema';
import { href } from '../useHashRoute';
import { CopyButton, RowLink } from './Value';
import { CurrentState } from './CurrentState';
import { RelationsPanel } from './RelationsPanel';
import { EventStream } from './EventStream';

const TYPES = [
  ['CREATE', 'Created'],
  ['UPDATE', 'Updated'],
  ['DELETE', 'Deleted'],
];

const touches = (column) => (ev) => {
  if (ev.type === 'UPDATE') return !!ev.diffValues && column in ev.diffValues;
  if (ev.type === 'CREATE') return !!ev.newValues && ev.newValues[column] != null;
  return true;
};

export const TypeFilter = ({ types, onChange }) => (
  <div className="chips" role="group" aria-label="Event types">
    {TYPES.map(([type, label]) => {
      const on = types.includes(type);
      return (
        <button
          type="button"
          key={type}
          className={`chip chip--${type.toLowerCase()}${on ? ' is-on' : ''}`}
          aria-pressed={on}
          onClick={() => onChange(on ? types.filter(t => t !== type) : [...types, type])}
        >
          {label}
        </button>
      );
    })}
  </div>
);

export const OrderToggle = ({ order, onChange }) => (
  <button
    type="button"
    className="btn-quiet"
    onClick={() => onChange(order === 'desc' ? 'asc' : 'desc')}
  >
    {order === 'desc' ? 'Newest first' : 'Oldest first'}
  </button>
);

const IconFields = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M3 5h4M3 10h4M3 15h4M10 5h7M10 10h7M10 15h5" />
  </svg>
);

const IconRelations = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="10" r="2.2" />
    <circle cx="15" cy="4.5" r="2.2" />
    <circle cx="15" cy="15.5" r="2.2" />
    <path d="M7 9l6-3.5M7 11l6 3.5" />
  </svg>
);

const PANEL_KEY = 'eventLogRecordPanel';

const readPanel = () => {
  try {
    return localStorage.getItem(PANEL_KEY) || null;
  } catch (e) {
    return null;
  }
};

export const RowView = ({ table, pk }) => {
  const { schema, schemaStatus } = useApp();
  const info = tableInfo(schema, table);
  const entity = info && info.kind === 'entity' ? info.entity : null;
  const pkParts = pk.split(',');

  const [types, setTypes] = useState([]);
  const [column, setColumn] = useState('');
  const [order, setOrder] = useState('desc');
  const [refreshToken, setRefreshToken] = useState(0);
  const [editRequest, setEditRequest] = useState(null);
  const [panel, setPanelState] = useState(readPanel);
  // Panels stay mounted once opened so switching between them doesn't refetch.
  const [visited, setVisited] = useState(() => new Set(panel ? [panel] : []));

  const setPanel = (next) => {
    setPanelState(next);
    if (next) setVisited(v => (v.has(next) ? v : new Set([...v, next])));
    try {
      if (next) localStorage.setItem(PANEL_KEY, next);
      else localStorage.removeItem(PANEL_KEY);
    } catch (e) {
      // Remembering the open panel is a convenience only.
    }
  };

  const filter = useMemo(() => ({ rows: [{ tableName: table, primaryKey: pk.split(',') }] }), [table, pk]);
  const clientFilter = useMemo(() => (column ? touches(column) : null), [column]);
  const refresh = () => setRefreshToken(n => n + 1);
  const onRestore = entity && !entity.view
    ? (field, value) => {
      setPanel('values');
      setEditRequest({ field, value, nonce: Date.now() });
    }
    : null;

  const columns = info ? Object.keys(info.columns) : [];
  const hasRelations = entity && collectionRelations(entity).length > 0;
  const panels = entity
    ? [
      { id: 'values', label: 'Current values', icon: <IconFields /> },
      ...(hasRelations ? [{ id: 'relations', label: 'Related records', icon: <IconRelations /> }] : []),
    ]
    : [];
  const activePanel = panels.some(p => p.id === panel) ? panel : null;

  return (
    <div className="record">
      <header className="record-head">
        <div className="record-id">
          <h1 className="record-title">{tableLabel(schema, table)}</h1>
          <span className="record-pk mono">{pk}</span>
          <CopyButton text={pk} label="Copy ID" />
        </div>
        <div className="record-meta">
          {entity && entity.name !== table && <span className="mono">table {table}</span>}
          {info && info.kind === 'junction' && pkParts.length === 2 && (
            <span className="ev-row">
              <span className="ev-row-sep">links</span>
              <RowLink table={info.owner.tableName} pk={pkParts[0]} entityName={info.owner.name} />
              <span className="ev-row-sep">and</span>
              <RowLink table={info.target.tableName} pk={pkParts[1]} entityName={info.target.name} />
            </span>
          )}
          <a href={href.table(table)}>All changes in {tableLabel(schema, table)}</a>
          {schemaStatus === 'unavailable' && (
            <span>The schema isn't readable with this token, so relations and editing are off.</span>
          )}
          {schema && schema.inferred && (
            <span>This Contember version doesn't publish its schema, so entity and column names are inferred from the Content API.</span>
          )}
          {schema && !info && <span>No entity uses this table in the current schema.</span>}
        </div>
      </header>

      <div className={`record-body${activePanel ? ' has-panel' : ''}${panels.length ? ' has-rail' : ''}`}>
        {panels.length > 0 && (
          <nav className="rail" aria-label="Record panels">
            {panels.map(p => (
              <button
                key={p.id}
                type="button"
                className={`rail-btn${activePanel === p.id ? ' is-on' : ''}`}
                aria-pressed={activePanel === p.id}
                aria-label={p.label}
                data-tooltip={p.label}
                onClick={() => setPanel(activePanel === p.id ? null : p.id)}
              >
                {p.icon}
              </button>
            ))}
          </nav>
        )}

        {entity && visited.size > 0 && (
          <aside className="record-panel" hidden={!activePanel}>
            {visited.has('values') && (
              <div hidden={activePanel !== 'values'}>
                <CurrentState entity={entity} pk={pk} editRequest={editRequest} onSaved={refresh} />
              </div>
            )}
            {hasRelations && visited.has('relations') && (
              <div hidden={activePanel !== 'relations'}>
                <RelationsPanel entity={entity} pk={pk} />
              </div>
            )}
          </aside>
        )}

        <main className="record-history">
          <div className="toolbar">
            <h2 className="toolbar-title">History</h2>
            <TypeFilter types={types} onChange={setTypes} />
            {columns.length > 0 && (
              <label className="toolbar-field">
                <span>Field</span>
                <select value={column} onChange={e => setColumn(e.target.value)}>
                  <option value="">Any</option>
                  {columns.map(c => <option key={c} value={c}>{columnLabel(schema, table, c)}</option>)}
                </select>
              </label>
            )}
            <OrderToggle order={order} onChange={setOrder} />
            <button type="button" className="btn-quiet" onClick={refresh}>Refresh</button>
          </div>
          <EventStream
            filter={filter}
            types={types}
            order={order}
            all
            onRestore={onRestore}
            clientFilter={clientFilter}
            focusColumn={column || null}
            onSelectColumn={setColumn}
            refreshToken={refreshToken}
            empty="No events for this record. It may have been created before the event log was enabled, or the ID is wrong."
          />
        </main>
      </div>
    </div>
  );
};
