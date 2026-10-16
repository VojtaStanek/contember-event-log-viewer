import React, { useEffect, useMemo, useState } from 'react';
import { href } from '../../../src/useHashRoute';
import { absoluteTime, shortId } from '../../../src/format';
import { getBody } from '../lib/db';
import { summarize } from '../lib/analyze';
import { JsonTree } from './JsonTree';
import { QueryView, formatQuery } from './QueryView';
import { ChangesTab } from './ChangesTab';
import { formatBytes, formatDuration, outcomeLabel } from './format';

export const TABS = [
  ['overview', 'Overview'],
  ['query', 'Query'],
  ['variables', 'Variables'],
  ['response', 'Response'],
  ['changes', 'Changes'],
  ['headers', 'Headers'],
];

const copy = (text, notify, what) =>
  navigator.clipboard.writeText(text).then(() => notify(`Copied ${what}`), () => notify("Couldn't copy to the clipboard", 'error'));

const shellQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

const requestJson = (body) => JSON.stringify({ query: body.query, variables: body.variables || {} });

const asCurl = (meta, body) => [
  `curl ${shellQuote(meta.url)}`,
  `  -H 'content-type: application/json'`,
  `  -H 'cookie: <your admin session cookie>'`,
  `  --data-raw ${shellQuote(requestJson(body))}`,
].join(' \\\n');

const asFetch = (meta, body) =>
  `await fetch(${JSON.stringify(meta.url)}, {\n  method: 'POST',\n  credentials: 'include',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify(${JSON.stringify({ query: body.query, variables: body.variables || {} }, null, 2).replace(/\n/g, '\n  ')}),\n}).then(r => r.json())`;

const parseResponse = (text) => {
  if (text == null) return { kind: 'none' };
  try {
    return { kind: 'json', value: JSON.parse(text) };
  } catch (e) {
    return { kind: 'text', value: text };
  }
};

// Content API objects name their entity in __typename; link their IDs to the record's history.
const recordLinkFor = (meta) => (meta.api === 'content' && meta.project
  ? (typename, id) => ({ href: href.row(typename, id), title: `Open the history of ${typename} ${id}` })
  : null);

const VERB = { create: 'created', update: 'updated', upsert: 'upserted', delete: 'deleted', get: 'loaded' };

const KIND_LABEL = { validation: 'Validation', mutation: 'Not applied', graphql: 'GraphQL', http: 'HTTP', network: 'Network' };

const ErrorList = ({ errors, total }) => (
  <section className="insp-section">
    <h3 className="insp-section-title insp-tone-error">{total === 1 ? '1 problem' : `${total} problems`}</h3>
    <ul className="insp-errors">
      {errors.map((e, i) => (
        <li key={i} className="insp-error">
          <span className="insp-error-kind">{KIND_LABEL[e.kind] || e.kind}{e.type ? ` · ${e.type}` : ''}</span>
          {(e.field || e.path) && (
            <span className="insp-error-where mono">{[e.field, e.path].filter(Boolean).join(' › ')}</span>
          )}
          <span className="insp-error-msg">{e.message}</span>
        </li>
      ))}
    </ul>
    {total > errors.length && <p className="insp-hint">Showing the first {errors.length}. The Response tab has all of them.</p>}
  </section>
);

// Arguments as GraphQL literals: by: {id: "a1"}, data: {title: ""}
const gqlLiteral = (v) => {
  if (Array.isArray(v)) return `[${v.map(gqlLiteral).join(', ')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${k}: ${gqlLiteral(x)}`).join(', ')}}`;
  return v === undefined ? 'null' : JSON.stringify(v);
};

const ArgsPreview = ({ args }) => {
  if (!args || !Object.keys(args).length) return null;
  const text = Object.entries(args).map(([k, v]) => `${k}: ${gqlLiteral(v)}`).join(', ');
  return <span className="insp-args mono" title={JSON.stringify(args, null, 2)}>({text.length > 160 ? `${text.slice(0, 160)}…` : text})</span>;
};

const Overview = ({ meta, body, onTab }) => {
  const notApplied = meta.operationType === 'mutation' && meta.outcome !== 'ok';
  const fields = meta.rootFields.filter(f => f.action !== 'transaction');
  return (
    <>
      {meta.errors.length > 0 && <ErrorList errors={meta.errors} total={meta.errorCount} />}
      {meta.records.length > 0 && (
        <section className="insp-section">
          <h3 className="insp-section-title">Records</h3>
          <ul className="insp-records">
            {meta.records.map(r => (
              <li key={`${r.entity}|${r.id}`}>
                <span className="row-link-entity">{r.entity}</span> <span className="mono" title={r.id}>{shortId(r.id)}</span>
                <span className="insp-muted"> {notApplied && r.action !== 'get' ? `not ${VERB[r.action] || r.action}` : VERB[r.action] || r.action}</span>
                {meta.api === 'content' && meta.project && (
                  <a className="insp-record-link" href={href.row(r.entity, r.id)}>History</a>
                )}
              </li>
            ))}
          </ul>
          {meta.operationType === 'mutation' && meta.api === 'content' && !notApplied && (
            <p className="insp-hint">
              <button type="button" className="btn-inline insp-inline-first" onClick={() => onTab('changes')}>See what this request changed</button>
            </p>
          )}
        </section>
      )}
      {fields.length > 0 && (
        <section className="insp-section">
          <h3 className="insp-section-title">{fields.length === 1 ? 'Field' : `${fields.length} fields`}</h3>
          <ul className="insp-fields">
            {fields.map(f => (
              <li key={f.path.join('.')}>
                {f.alias !== f.name && <span className="insp-muted mono">{f.alias}: </span>}
                <span className="mono insp-field-name">{f.name}</span>
                <ArgsPreview args={body && body.args && body.args[f.path.join('.')]} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="insp-section">
        <h3 className="insp-section-title">Request</h3>
        <dl className="insp-dl">
          <dt>Endpoint</dt><dd className="mono">{meta.url}</dd>
          {meta.project && <><dt>Project</dt><dd>{meta.project}{meta.stage && <span className="insp-muted"> · stage {meta.stage}</span>}</dd></>}
          <dt>Page</dt><dd className="mono">{meta.pageUrl}</dd>
          <dt>Started</dt><dd>{absoluteTime(new Date(meta.startedAt).toISOString())}</dd>
          <dt>Took</dt><dd>{formatDuration(meta.duration)}</dd>
          <dt>Size</dt><dd>{formatBytes(meta.requestSize)} sent · {formatBytes(meta.responseSize)} received</dd>
        </dl>
      </section>
    </>
  );
};

const Headers = ({ meta, body }) => (
  <section className="insp-section">
    <dl className="insp-dl">
      <dt>Method</dt><dd className="mono">{meta.method}</dd>
      <dt>URL</dt><dd className="mono">{meta.url}</dd>
      <dt>Status</dt><dd className="mono">{meta.status || '—'}</dd>
      {Object.entries((body && body.requestHeaders) || {}).map(([k, v]) => (
        <React.Fragment key={k}><dt className="mono">{k}</dt><dd className="mono">{v}</dd></React.Fragment>
      ))}
    </dl>
    <p className="insp-hint">The admin's session cookie is HttpOnly. Neither the page nor this extension can read it, and it is never stored.</p>
  </section>
);

export const RequestDetail = ({ meta, tab, onTab, notify, onClose }) => {
  const [body, setBody] = useState(null);
  useEffect(() => {
    let live = true;
    setBody(null);
    getBody(meta.id).then(b => live && setBody(b || {}));
    return () => { live = false; };
  }, [meta.id]);

  const response = useMemo(() => (body ? parseResponse(body.responseText) : null), [body]);
  const { text: summary, more } = summarize(meta, 3);
  const isMutation = meta.operationType === 'mutation';
  const outcome = outcomeLabel(meta);

  const copyItems = body ? [
    body.query && ['Query', () => copy(formatQuery(body.query).text, notify, 'the query')],
    body.variables && ['Variables', () => copy(JSON.stringify(body.variables, null, 2), notify, 'the variables')],
    body.responseText != null && ['Response', () => copy(response.kind === 'json' ? JSON.stringify(response.value, null, 2) : body.responseText, notify, 'the response')],
    body.query && ['As fetch()', () => copy(asFetch(meta, body), notify, 'a fetch() call. Run it in the admin\'s console')],
    body.query && ['As cURL', () => copy(asCurl(meta, body), notify, 'a cURL command. Add your session cookie to run it')],
  ].filter(Boolean) : [];

  return (
    <article className="insp-detail" aria-label="Request details">
      <header className="insp-detail-head">
        {onClose && <button type="button" className="btn-quiet insp-back" onClick={onClose}>← Requests</button>}
        <div className="insp-detail-title">
          <span className={`insp-kind insp-kind--${isMutation ? 'mutation' : 'query'}`}>{isMutation ? 'Mutation' : meta.operationType === 'query' ? 'Query' : meta.api}</span>
          <h2 className="insp-detail-name">{summary}{more > 0 && <span className="insp-muted"> +{more}</span>}</h2>
          <span className={`insp-pill insp-pill--${meta.outcome}`}>{outcome}</span>
        </div>
        <div className="insp-detail-meta">
          {meta.project && <span>{meta.project} · {meta.stage || meta.api}</span>}
          <span title={new Date(meta.startedAt).toISOString()}>{new Date(meta.startedAt).toLocaleTimeString()}</span>
          <span>{formatDuration(meta.duration)}</span>
          <span>{formatBytes(meta.responseSize)}</span>
          {copyItems.length > 0 && (
            <details className="insp-menu">
              <summary className="btn-quiet btn-small">Copy</summary>
              <div className="insp-menu-list" role="menu">
                {copyItems.map(([label, run]) => (
                  <button key={label} type="button" role="menuitem" className="insp-menu-item" onClick={(e) => { run(); e.currentTarget.closest('details').open = false; }}>{label}</button>
                ))}
              </div>
            </details>
          )}
        </div>
        <nav className="insp-tabs" role="tablist" aria-label="Request details">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`insp-tab${tab === id ? ' is-on' : ''}`}
              onClick={() => onTab(id)}
            >
              {label}
              {id === 'overview' && meta.errorCount > 0 && <span className="insp-tab-count">{meta.errorCount}</span>}
            </button>
          ))}
        </nav>
      </header>
      <div className="insp-detail-body" role="tabpanel">
        {!body && <p className="insp-hint" role="status">Loading…</p>}
        {body && tab === 'overview' && <Overview meta={meta} body={body} onTab={onTab} />}
        {body && tab === 'query' && (body.query
          ? <QueryView query={body.query} />
          : <pre className="insp-code">{body.rawRequest || 'No request body was captured.'}</pre>)}
        {body && tab === 'variables' && (body.variables && Object.keys(body.variables).length
          ? <JsonTree value={body.variables} rootPath="variables" />
          : <p className="insp-hint">This request has no variables.</p>)}
        {body && tab === 'response' && (
          <>
            {meta.truncated && <p className="insp-hint">The response is larger than 5 MB, so only its beginning was kept.</p>}
            {response.kind === 'json' && <JsonTree value={response.value} openDepth={4} linkFor={recordLinkFor(meta)} />}
            {response.kind === 'text' && <pre className="insp-code">{response.value}</pre>}
            {response.kind === 'none' && <p className="insp-hint">{meta.outcome === 'aborted' ? 'The admin cancelled this request before the response arrived.' : 'No response was received.'}</p>}
          </>
        )}
        {body && tab === 'changes' && <ChangesTab meta={meta} />}
        {body && tab === 'headers' && <Headers meta={meta} body={body} />}
      </div>
    </article>
  );
};
