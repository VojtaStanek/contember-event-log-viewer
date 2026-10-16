import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { Value } from './Value';

const toText = (field, value) => {
  if (value === null || value === undefined) return '';
  if (field.type === 'Json') return JSON.stringify(value, null, 2);
  return String(value);
};

const parseDraft = (field, isRelation, isNull, text) => {
  if (isNull) return { value: null };
  const t = text.trim();
  if (isRelation) return t ? { value: t } : { error: 'Enter the ID of the record to connect.' };
  switch (field.type) {
    case 'Int':
      return /^-?\d+$/.test(t) ? { value: parseInt(t, 10) } : { error: 'Enter a whole number.' };
    case 'Double': {
      const n = Number(t);
      return t !== '' && isFinite(n) ? { value: n } : { error: 'Enter a number.' };
    }
    case 'Bool':
      return { value: t === 'true' };
    case 'Json':
      try {
        return { value: JSON.parse(text) };
      } catch (e) {
        return { error: `Invalid JSON: ${e.message}` };
      }
    case 'DateTime':
      return isNaN(Date.parse(t)) ? { error: 'Enter an ISO date and time, e.g. 2024-05-01T12:00:00Z.' } : { value: t };
    case 'Date':
      return /^\d{4}-\d{2}-\d{2}$/.test(t) ? { value: t } : { error: 'Enter a date as YYYY-MM-DD.' };
    default:
      return { value: text };
  }
};

export const toApiValue = (meta, value) => {
  if (meta.kind !== 'relation') return value;
  return value === null ? { disconnect: true } : { connect: { [meta.target.primary]: value } };
};

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const FieldEditor = ({ meta, current, initial, saving, error, onSave, onCancel }) => {
  const { schema } = useApp();
  const field = meta.field;
  const isRelation = meta.kind === 'relation';
  const start = initial !== undefined ? initial : current;
  const [isNull, setIsNull] = useState(start === null || start === undefined);
  const [text, setText] = useState(() => (field.type === 'Bool' && start == null ? 'false' : toText(field, start)));
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current && inputRef.current.focus();
  }, [isNull]);

  const parsed = parseDraft(field, isRelation, isNull, text);
  const unchanged = !parsed.error && same(parsed.value, current);
  const canSave = !parsed.error && !unchanged && !saving;

  const submit = (e) => {
    e && e.preventDefault();
    if (canSave) onSave(toApiValue(meta, parsed.value), parsed.value);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && (e.target.tagName !== 'TEXTAREA' || e.metaKey || e.ctrlKey)) {
      submit(e);
    }
  };

  // Decided once so the input doesn't swap to a textarea mid-typing.
  const [multiline] = useState(() =>
    field.type === 'Json' || (!isRelation && field.type === 'String' && (text.length > 60 || text.includes('\n'))));
  const enumValues = field.type === 'Enum' && schema ? schema.enums[field.columnType] || [] : null;
  const inputId = `edit-${field.name}`;

  let input;
  if (isNull) {
    input = null;
  } else if (field.type === 'Bool') {
    input = (
      <div className="seg" role="radiogroup" aria-label={field.name}>
        {['true', 'false'].map(v => (
          <button
            type="button"
            key={v}
            role="radio"
            aria-checked={text === v}
            className={`seg-btn${text === v ? ' is-on' : ''}`}
            onClick={() => setText(v)}
            ref={text === v ? inputRef : undefined}
          >
            {v}
          </button>
        ))}
      </div>
    );
  } else if (enumValues && enumValues.length) {
    input = (
      <select id={inputId} ref={inputRef} value={text} onChange={e => setText(e.target.value)}>
        {!enumValues.includes(text) && <option value={text}>{text || 'Choose a value'}</option>}
        {enumValues.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  } else if (multiline) {
    input = (
      <textarea
        id={inputId}
        ref={inputRef}
        className="mono"
        rows={Math.min(14, Math.max(3, text.split('\n').length + 1))}
        value={text}
        onChange={e => setText(e.target.value)}
        spellCheck={field.type !== 'Json'}
      />
    );
  } else {
    input = (
      <input
        id={inputId}
        ref={inputRef}
        className={isRelation || field.type === 'Uuid' ? 'mono' : undefined}
        type={field.type === 'Date' ? 'date' : 'text'}
        inputMode={field.type === 'Int' || field.type === 'Double' ? 'decimal' : undefined}
        placeholder={isRelation ? `${meta.target.name} ID` : field.type === 'DateTime' ? '2024-05-01T12:00:00Z' : undefined}
        value={text}
        onChange={e => setText(e.target.value)}
      />
    );
  }

  return (
    <form className="editor" onSubmit={submit} onKeyDown={onKeyDown}>
      <label className="editor-label" htmlFor={inputId}>
        Edit <span className="mono">{field.name}</span>
        <span className="editor-type">{isRelation ? `${meta.target.name} ID` : field.type}</span>
      </label>
      {input}
      {field.nullable !== false && (
        <label className="check">
          <input type="checkbox" checked={isNull} onChange={e => setIsNull(e.target.checked)} />
          {isRelation ? 'Not connected (null)' : 'Null'}
        </label>
      )}
      {parsed.error && !isNull && <p className="editor-hint editor-hint--error">{parsed.error}</p>}
      {!parsed.error && !unchanged && (
        <div className="editor-preview" aria-label="Change preview">
          <span className="diff-val diff-val--old"><Value value={current} meta={meta} /></span>
          <span className="diff-arrow" aria-hidden="true">→</span>
          <span className="diff-val diff-val--new"><Value value={parsed.value} meta={meta} /></span>
        </div>
      )}
      {error && <p className="editor-hint editor-hint--error" role="alert">{error}</p>}
      <div className="editor-actions">
        <button type="submit" className="btn btn-primary" disabled={!canSave}>
          {saving ? 'Saving…' : 'Save change'}
        </button>
        <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
        <span className="editor-keys">{multiline ? 'Ctrl+Enter to save' : 'Enter to save'}, Esc to cancel</span>
      </div>
    </form>
  );
};
