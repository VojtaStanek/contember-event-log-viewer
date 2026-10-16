import React, { useState } from 'react';
import { href } from '../useHashRoute';
import { absoluteTime, shortId } from '../format';

export const CopyButton = ({ text, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      // Clipboard can be blocked (e.g. insecure context); nothing useful to do.
    }
  };
  return (
    <button type="button" className="btn-quiet btn-small" onClick={copy} title={`Copy ${text}`}>
      {copied ? 'Copied' : label}
    </button>
  );
};

export const RowLink = ({ table, pk, entityName, full }) => (
  <a className="row-link" href={href.row(table, pk)} title={`${entityName || table} ${pk}`}>
    {entityName && <span className="row-link-entity">{entityName}</span>}
    <span className="mono">{full ? String(pk) : shortId(pk)}</span>
  </a>
);

const LONG_TEXT = 160;

const LongText = ({ text }) => {
  const [open, setOpen] = useState(false);
  if (text.length <= LONG_TEXT) return <span className="v-str">{text}</span>;
  return (
    <span className="v-str">
      {open ? text : `${text.slice(0, LONG_TEXT)}…`}
      <button type="button" className="btn-inline" onClick={() => setOpen(!open)}>
        {open ? 'Show less' : `Show all ${text.length} characters`}
      </button>
    </span>
  );
};

const JsonValue = ({ value }) => {
  const text = JSON.stringify(value, null, 2);
  const lines = text.split('\n').length;
  const [open, setOpen] = useState(lines <= 6);
  return (
    <span className="v-json">
      {open ? <pre>{text}</pre> : <span className="v-json-preview mono">{JSON.stringify(value)}</span>}
      {lines > 6 && (
        <button type="button" className="btn-inline" onClick={() => setOpen(!open)}>
          {open ? 'Collapse' : `Expand ${lines} lines`}
        </button>
      )}
    </span>
  );
};

// meta: { kind: 'column' | 'relation', field?, target? } from schema.js columnInfo, or null
export const Value = ({ value, meta }) => {
  if (value === null || value === undefined) return <span className="v-null">null</span>;
  if (meta && meta.kind === 'relation' && meta.target && (typeof value === 'string' || typeof value === 'number')) {
    return <RowLink table={meta.target.tableName} pk={value} entityName={meta.target.name} />;
  }
  if (typeof value === 'boolean') return <span className="v-bool">{String(value)}</span>;
  if (typeof value === 'number') return <span className="v-num">{value}</span>;
  if (typeof value === 'object') return <JsonValue value={value} />;
  const text = String(value);
  if (text === '') return <span className="v-null">empty text</span>;
  const type = meta && meta.field && meta.field.type;
  if (type === 'DateTime') {
    return <time className="v-date" dateTime={text} title={text}>{absoluteTime(text)}</time>;
  }
  return <LongText text={text} />;
};
