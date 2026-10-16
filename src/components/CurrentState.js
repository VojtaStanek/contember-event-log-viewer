import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { content } from '../api';
import { editableFields, gqlNames, isOwningRelation } from '../schema';
import { Value } from './Value';
import { FieldEditor } from './FieldEditor';
import { ErrorNotice } from './Notices';

const fieldMeta = (schema, field) =>
  isOwningRelation(field)
    ? { kind: 'relation', field, target: schema.entities[field.target] }
    : { kind: 'column', field };

// Only scalar columns and the id of owning relations: never nested data.
const selection = (schema, entity) =>
  Object.values(entity.fields)
    .map(f => {
      if (f.columnName) return f.name;
      if (isOwningRelation(f)) return `${f.name} { ${schema.entities[f.target].primary} }`;
      return null;
    })
    .filter(Boolean)
    .join(' ');

const normalize = (schema, entity, row) => {
  if (!row) return row;
  const out = {};
  for (const f of Object.values(entity.fields)) {
    if (!(f.name in row)) continue;
    const v = row[f.name];
    out[f.name] = isOwningRelation(f) && v ? v[schema.entities[f.target].primary] : v;
  }
  return out;
};

export const CurrentState = ({ entity, pk, editRequest, onSaved }) => {
  const { conn, schema, notify } = useApp();
  const [state, setState] = useState({ row: undefined, loading: false, error: null });
  const [editing, setEditing] = useState(null); // { field, initial, nonce }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const rootRef = useRef(null);
  const names = gqlNames(entity);
  const editable = new Set(editableFields(entity).map(f => f.name));

  const load = useCallback(async (signal) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await content(
        conn,
        `query ($by: ${names.uniqueWhere}!) { row: ${names.get}(by: $by) { ${selection(schema, entity)} } }`,
        { by: { [entity.primary]: pk } },
        signal,
      );
      setState({ row: normalize(schema, entity, data.row), loading: false, error: null });
    } catch (e) {
      if (e.name !== 'AbortError') setState({ row: undefined, loading: false, error: e });
    }
  }, [conn, schema, entity, pk, names.uniqueWhere, names.get]);

  useEffect(() => {
    setState({ row: undefined, loading: false, error: null });
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => setEditing(null), [entity, pk]);

  useEffect(() => {
    if (!editRequest) return;
    setSaveError(null);
    setEditing({ field: editRequest.field, initial: editRequest.value, nonce: editRequest.nonce });
    rootRef.current && rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [editRequest]);

  const save = async (field, apiValue) => {
    setSaving(true);
    setSaveError(null);
    try {
      const data = await content(
        conn,
        `mutation ($by: ${names.uniqueWhere}!, $data: ${names.updateInput}!) {
          res: ${names.update}(by: $by, data: $data) { ok errorMessage }
        }`,
        { by: { [entity.primary]: pk }, data: { [field.name]: apiValue } },
      );
      if (!data.res.ok) throw new Error(data.res.errorMessage || `Contember refused to update ${field.name}.`);
      setEditing(null);
      notify(`Saved ${field.name}`);
      await load();
      onSaved && onSaved();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const row = state.row;
  const fields = Object.values(entity.fields).filter(f => f.columnName || isOwningRelation(f));

  return (
    <section className="panel-section" ref={rootRef}>
      <h2 className="panel-heading">
        Current values
        {row && (
          <button type="button" className="btn-quiet btn-small" onClick={() => load()} disabled={state.loading}>
            Reload
          </button>
        )}
      </h2>
      {state.loading && row === undefined && <p className="panel-hint" role="status">Loading…</p>}
      {state.error && <ErrorNotice error={state.error} onRetry={() => load()} />}
      {row === null && <p className="panel-hint">This record doesn't exist anymore. Its history is still below.</p>}
      {row && (
        <dl className="fields">
          {fields.map(f => {
            const meta = fieldMeta(schema, f);
            const isEditing = editing && editing.field.name === f.name;
            return (
              <div className={`field${isEditing ? ' is-editing' : ''}`} key={f.name}>
                <dt className="field-name" title={f.columnName ? `Column ${f.columnName}` : `Column ${f.joiningColumn.columnName}`}>
                  {f.name}
                </dt>
                <dd className="field-value">
                  <Value value={row[f.name]} meta={meta} />
                </dd>
                {editable.has(f.name) && !isEditing && (
                  <button
                    type="button"
                    className="btn-quiet btn-small field-edit"
                    onClick={() => { setSaveError(null); setEditing({ field: f, initial: undefined, nonce: Date.now() }); }}
                    aria-label={`Edit ${f.name}`}
                  >
                    Edit
                  </button>
                )}
                {isEditing && (
                  <div className="field-editor">
                    <FieldEditor
                      key={editing.nonce}
                      meta={meta}
                      current={row[f.name]}
                      initial={editing.initial}
                      saving={saving}
                      error={saveError}
                      onCancel={() => setEditing(null)}
                      onSave={(apiValue) => save(f, apiValue)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </dl>
      )}
      {entity.view && <p className="panel-hint">This entity is a database view, so it can't be edited.</p>}
    </section>
  );
};
