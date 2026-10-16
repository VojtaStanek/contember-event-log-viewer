import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { resolveTable, tableInfo } from '../schema';
import { href, navigate } from '../useHashRoute';

const fromRoute = (route, schema) => {
  if (route.name === 'row' || route.name === 'table') {
    const info = tableInfo(schema, route.table);
    const name = info && info.kind === 'entity' ? info.entity.name : route.table;
    return { target: name, id: route.pk || '' };
  }
  if (route.name === 'tx') return { target: '', id: route.id };
  return null;
};

export const SearchBar = ({ route, disabled }) => {
  const { schema } = useApp();
  const [target, setTarget] = useState('');
  const [id, setId] = useState('');
  const targetRef = useRef(null);

  useEffect(() => {
    const values = fromRoute(route, schema);
    if (values) {
      setTarget(values.target);
      setId(values.id);
    }
  }, [route.name, route.table, route.pk, route.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        e.preventDefault();
        targetRef.current && targetRef.current.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const t = target.trim();
    const i = id.trim();
    if (t && i) navigate(href.row(resolveTable(schema, t), i));
    else if (t) navigate(href.table(resolveTable(schema, t)));
    else if (i) navigate(href.tx(i));
  };

  const entities = schema ? Object.values(schema.entities).sort((a, b) => a.name.localeCompare(b.name)) : [];

  return (
    <form className="search" onSubmit={submit} role="search">
      <input
        ref={targetRef}
        className="search-target"
        list="entity-options"
        value={target}
        onChange={e => setTarget(e.target.value)}
        placeholder="Entity or table"
        aria-label="Entity or table"
        disabled={disabled}
        title="Press / to focus"
      />
      <datalist id="entity-options">
        {entities.map(e => <option key={e.name} value={e.name}>{e.tableName}</option>)}
      </datalist>
      <input
        className="search-id mono"
        value={id}
        onChange={e => setId(e.target.value)}
        placeholder={target ? 'ID, or empty for latest changes' : 'ID or transaction ID'}
        aria-label="ID or transaction ID"
        disabled={disabled}
      />
      <button type="submit" className="btn btn-primary" disabled={disabled || (!target.trim() && !id.trim())}>Open</button>
    </form>
  );
};
