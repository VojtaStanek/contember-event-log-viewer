import React, { useEffect, useState } from 'react';
import { useApp } from '../context';
import { columnInfo, columnLabel, tableInfo, tableLabel } from '../schema';
import { absoluteTime, eventVerb, relativeTime, shortId, timeZone } from '../format';
import { href } from '../useHashRoute';
import { RowLink, Value } from './Value';

const isEmpty = (v) => v === null || v === undefined;

// Field name in a diff; clicking it filters History to that field (or clears it).
const FieldLabel = ({ event, column, focusColumn, onSelectColumn }) => {
  const { schema } = useApp();
  const label = columnLabel(schema, event.tableName, column);
  if (!onSelectColumn) return <dt className="diff-field" title={`Column ${column}`}>{label}</dt>;
  const selected = focusColumn === column;
  return (
    <dt className="diff-field">
      <button
        type="button"
        className={`diff-field-btn${selected ? ' is-on' : ''}`}
        onClick={() => onSelectColumn(selected ? '' : column)}
        title={selected ? 'Show changes of all fields' : `Show only changes of ${label} (column ${column})`}
      >
        {label}
      </button>
    </dt>
  );
};

// With a field selected in History, show only that field and a toggle for the rest.
const useFocus = (columns, focusColumn, verb = 'changed') => {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [focusColumn]);
  const active = !!focusColumn && columns.includes(focusColumn) && !expanded;
  const others = focusColumn && columns.includes(focusColumn) ? columns.length - 1 : 0;
  const toggle = others > 0 && (
    <button type="button" className="btn-inline diff-more" onClick={() => setExpanded(!expanded)}>
      {expanded ? 'Show only the selected field' : `${others} other ${others === 1 ? 'field' : 'fields'} ${verb}`}
    </button>
  );
  return { keep: (column) => !active || column === focusColumn, toggle };
};

const ValueList = ({ event, values, tone, focusColumn, onSelectColumn }) => {
  const { schema } = useApp();
  const [showEmpty, setShowEmpty] = useState(false);
  const all = Object.entries(values || {});
  const focus = useFocus(all.filter(([, v]) => !isEmpty(v)).map(([c]) => c), focusColumn, tone === 'gone' ? 'removed' : 'set');
  const entries = all.filter(([c]) => focus.keep(c));
  const filled = entries.filter(([, v]) => !isEmpty(v));
  const emptyCount = entries.length - filled.length;
  const shown = showEmpty ? entries : filled;
  return (
    <>
      <dl className="diff">
        {shown.map(([column, value]) => (
          <div className="diff-row" key={column}>
            <FieldLabel event={event} column={column} focusColumn={focusColumn} onSelectColumn={onSelectColumn} />
            <dd className={`diff-val diff-val--${tone}`}>
              <Value value={value} meta={columnInfo(schema, event.tableName, column)} />
            </dd>
          </div>
        ))}
      </dl>
      {focus.toggle}
      {emptyCount > 0 && (
        <button type="button" className="btn-inline diff-more" onClick={() => setShowEmpty(!showEmpty)}>
          {showEmpty ? 'Hide empty fields' : `Show ${emptyCount} empty ${emptyCount === 1 ? 'field' : 'fields'}`}
        </button>
      )}
    </>
  );
};

const UpdateDiff = ({ event, onRestore, focusColumn, onSelectColumn }) => {
  const { schema } = useApp();
  const entries = Object.entries(event.diffValues || {});
  const focus = useFocus(entries.map(([c]) => c), focusColumn);
  return (
    <>
      <dl className="diff diff--update">
        {entries.filter(([c]) => focus.keep(c)).map(([column, next]) => {
          const meta = columnInfo(schema, event.tableName, column);
          const prev = event.oldValues ? event.oldValues[column] : undefined;
          return (
            <div className="diff-row" key={column}>
              <FieldLabel event={event} column={column} focusColumn={focusColumn} onSelectColumn={onSelectColumn} />
              <dd className="diff-change">
                {prev !== undefined && (
                  <>
                    <span className="diff-val diff-val--old" aria-label="Before">
                      <Value value={prev} meta={meta} />
                    </span>
                    <span className="diff-arrow" aria-hidden="true">→</span>
                  </>
                )}
                <span className="diff-val diff-val--new" aria-label="After">
                  <Value value={next} meta={meta} />
                </span>
              </dd>
              {onRestore && meta && meta.field && prev !== undefined && (
                <button
                  type="button"
                  className="btn-quiet btn-small diff-restore"
                  onClick={() => onRestore(meta.field, prev)}
                  title={`Open the editor with ${meta.field.name} set back to its value before this change`}
                >
                  Restore
                </button>
              )}
            </div>
          );
        })}
      </dl>
      {focus.toggle}
    </>
  );
};

const RowHeader = ({ event }) => {
  const { schema } = useApp();
  const info = tableInfo(schema, event.tableName);
  if (!event.primaryKey || !event.tableName) return null;
  if (info && info.kind === 'junction') {
    const [a, b] = event.primaryKey;
    return (
      <span className="ev-row">
        <a className="row-link" href={href.row(event.tableName, event.primaryKey)}>
          <span className="row-link-entity">{tableLabel(schema, event.tableName)}</span>
        </a>
        <span className="ev-row-sep">linking</span>
        <RowLink table={info.owner.tableName} pk={a} entityName={info.owner.name} />
        <span className="ev-row-sep">and</span>
        <RowLink table={info.target.tableName} pk={b} entityName={info.target.name} />
      </span>
    );
  }
  return (
    <span className="ev-row">
      <RowLink table={event.tableName} pk={event.primaryKey.join(',')} entityName={tableLabel(schema, event.tableName)} />
    </span>
  );
};

// meta: transaction details shown on the first event of a transaction, in the same line.
export const EventEntry = ({ event, showRow, onRestore, fresh, meta, focusColumn, onSelectColumn }) => {
  const type = event.type;
  return (
    <li className={`ev ev--${type.toLowerCase()}${fresh ? ' ev--fresh' : ''}`}>
      <span className="ev-node" aria-hidden="true" />
      <div className="ev-head">
        <span className="ev-type">{eventVerb[type] || type}</span>
        {showRow && <RowHeader event={event} />}
        {meta}
      </div>
      {type === 'UPDATE' && <UpdateDiff event={event} onRestore={onRestore} focusColumn={focusColumn} onSelectColumn={onSelectColumn} />}
      {type === 'CREATE' && <ValueList event={event} values={event.newValues} tone="plain" focusColumn={focusColumn} onSelectColumn={onSelectColumn} />}
      {type === 'DELETE' && <ValueList event={event} values={event.oldValues} tone="gone" focusColumn={focusColumn} onSelectColumn={onSelectColumn} />}
    </li>
  );
};

export const TxMeta = ({ event, showTxLink = true, count }) => (
  <span className="tx-head">
    <time
      className="tx-time"
      dateTime={event.appliedAt}
      title={`${absoluteTime(event.appliedAt)} in ${timeZone}\nCreated ${event.createdAt}\nApplied ${event.appliedAt}`}
    >
      {relativeTime(event.appliedAt)}
    </time>
    <a
      className="tx-identity"
      href={href.identity(event.identityId, event.identityDescription)}
      title={`All changes by identity ${event.identityId}`}
    >
      {event.identityDescription || shortId(event.identityId)}
    </a>
    {showTxLink && (
      <a className="tx-link" href={href.tx(event.transactionId)} title={`All changes in transaction ${event.transactionId}`}>
        Transaction <span className="mono">{shortId(event.transactionId)}</span>
      </a>
    )}
    {count > 1 && <span className="tx-count">{count} changes</span>}
  </span>
);

export const TxGroup = ({ events, showRow, showTxLink, onRestore, freshIds, focusColumn, onSelectColumn }) => (
  <section className="tx">
    <ol className="tx-events">
      {events.map((ev, i) => (
        <EventEntry
          key={ev.id}
          event={ev}
          showRow={showRow}
          onRestore={onRestore}
          fresh={freshIds && freshIds.has(ev.id)}
          focusColumn={focusColumn}
          onSelectColumn={onSelectColumn}
          meta={i === 0 && <TxMeta event={ev} showTxLink={showTxLink} count={events.length} />}
        />
      ))}
    </ol>
  </section>
);
