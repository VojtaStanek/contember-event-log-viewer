import React, { useState } from 'react';

const isObj = (v) => v !== null && typeof v === 'object';
const PAGE = 100;
const LONG = 200;

const keyPath = (path, key, isIndex) => (isIndex ? `${path}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? (path ? `${path}.${key}` : key) : `${path}[${JSON.stringify(key)}]`);

const copy = (text) => navigator.clipboard.writeText(text).catch(() => {});

const Primitive = ({ value }) => {
  const [open, setOpen] = useState(false);
  if (value === null) return <span className="jt-null">null</span>;
  if (typeof value === 'string') {
    if (value.length <= LONG || open) {
      return <span className="jt-str">"{value}"{value.length > LONG && <button type="button" className="btn-inline" onClick={() => setOpen(false)}>Show less</button>}</span>;
    }
    return (
      <span className="jt-str">
        "{value.slice(0, LONG)}…"
        <button type="button" className="btn-inline" onClick={() => setOpen(true)}>Show all {value.length} characters</button>
      </span>
    );
  }
  if (typeof value === 'number') return <span className="jt-num">{value}</span>;
  if (typeof value === 'boolean') return <span className="jt-bool">{String(value)}</span>;
  return <span className="jt-null">{String(value)}</span>;
};

const preview = (value) => {
  if (Array.isArray(value)) return value.length ? `[ ${value.length} ${value.length === 1 ? 'item' : 'items'} ]` : '[]';
  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  const shown = keys.slice(0, 4).join(', ');
  return `{ ${shown}${keys.length > 4 ? `, +${keys.length - 4}` : ''} }`;
};

// The `id` of an object that names its type (`__typename`) can link to that record.
const recordLink = (linkFor, parent, key, value) =>
  linkFor && key === 'id' && typeof value === 'string' && isObj(parent) && !Array.isArray(parent) && typeof parent.__typename === 'string'
    ? linkFor(parent.__typename, value)
    : null;

const Node = ({ name, value, path, depth, openDepth, isIndex, link, linkFor }) => {
  const expandable = isObj(value) && Object.keys(value).length > 0;
  const [open, setOpen] = useState(depth < openDepth);
  const [limit, setLimit] = useState(PAGE);
  const entries = expandable ? (Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value)) : [];

  const label = name == null ? null : (
    <span className={isIndex ? 'jt-index' : 'jt-key'}>{name}</span>
  );
  return (
    <li className="jt-node">
      <div className="jt-line">
        {expandable ? (
          <button type="button" className="disclosure jt-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {label}{label && <span className="jt-colon">:</span>}
            {!open && <span className="jt-preview">{preview(value)}</span>}
            {open && <span className="jt-preview">{Array.isArray(value) ? `[${value.length}]` : ''}</span>}
          </button>
        ) : (
          <span className="jt-leaf">
            {label}{label && <span className="jt-colon">:</span>}
            {isObj(value)
              ? <span className="jt-null">{Array.isArray(value) ? '[]' : '{}'}</span>
              : link
                ? <a className="jt-str jt-link" href={link.href} title={link.title}>"{value}"</a>
                : <Primitive value={value} />}
          </span>
        )}
        <span className="jt-actions">
          <button type="button" className="btn-quiet btn-small" onClick={() => copy(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}>Copy</button>
          {path && <button type="button" className="btn-quiet btn-small" title={path} onClick={() => copy(path)}>Copy path</button>}
        </span>
      </div>
      {expandable && open && (
        <ul className="jt-children">
          {entries.slice(0, limit).map(([k, v]) => (
            <Node
              key={k}
              name={k}
              value={v}
              path={keyPath(path, String(k), Array.isArray(value))}
              depth={depth + 1}
              openDepth={openDepth}
              isIndex={Array.isArray(value)}
              link={recordLink(linkFor, value, k, v)}
              linkFor={linkFor}
            />
          ))}
          {entries.length > limit && (
            <li className="jt-more">
              <button type="button" className="btn-inline" onClick={() => setLimit(limit + PAGE)}>
                Show {Math.min(PAGE, entries.length - limit)} more of {entries.length - limit}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
};

// Collapsible JSON with copy value / copy path on every line. With `linkFor(typename, id)`
// returning { href, title }, record IDs become links.
export const JsonTree = ({ value, rootPath = '', openDepth = 3, linkFor }) => {
  const [generation, setGeneration] = useState({ n: 0, depth: openDepth });
  if (!isObj(value)) {
    return <div className="jt"><Primitive value={value} /></div>;
  }
  return (
    <div className="jt">
      <div className="jt-tools">
        <button type="button" className="btn-quiet btn-small" onClick={() => setGeneration(g => ({ n: g.n + 1, depth: 99 }))}>Expand all</button>
        <button type="button" className="btn-quiet btn-small" onClick={() => setGeneration(g => ({ n: g.n + 1, depth: 1 }))}>Collapse all</button>
        <button type="button" className="btn-quiet btn-small" onClick={() => copy(JSON.stringify(value, null, 2))}>Copy all</button>
      </div>
      <ul className="jt-root" key={generation.n}>
        {(Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value)).map(([k, v]) => (
          <Node
            key={k}
            name={k}
            value={v}
            path={keyPath(rootPath, String(k), Array.isArray(value))}
            depth={1}
            openDepth={generation.depth}
            isIndex={Array.isArray(value)}
            link={recordLink(linkFor, value, k, v)}
            linkFor={linkFor}
          />
        ))}
      </ul>
    </div>
  );
};
