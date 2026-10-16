// Turns a raw captured request into what the inspector lists and searches:
// operation, root fields, the entities and records they touch, and the outcome.
// Pure: no browser APIs, so it is unit-tested in Node.
import { Kind, parse, valueFromASTUntyped } from 'graphql';
import { detectEndpoint } from './detect.js';

export const MAX_BODY = 5 * 1024 * 1024;
const MAX_SEARCH = 4000;
const MAX_ERRORS = 50;

const ENTITY_FIELD = /^(get|list|paginate|create|update|upsert|delete|validateCreate|validateUpdate)([A-Z]\w*)$/;
const ACTIONS = {
  get: 'get',
  list: 'list',
  paginate: 'list',
  create: 'create',
  update: 'update',
  upsert: 'upsert',
  delete: 'delete',
  validateCreate: 'validate',
  validateUpdate: 'validate',
};
const WRITES = new Set(['create', 'update', 'upsert', 'delete']);

export const entityOf = (fieldName) => {
  const m = ENTITY_FIELD.exec(fieldName);
  return m ? { entity: m[2], action: ACTIONS[m[1]] } : { entity: null, action: null };
};

const safeJson = (text) => {
  if (typeof text !== 'string' || !text) return undefined;
  try {
    return JSON.parse(text);
  } catch (e) {
    return undefined;
  }
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The GraphQL body: a single operation or (rarely) a batch array.
export function parseRequestBody(text) {
  const body = safeJson(text);
  const op = Array.isArray(body) ? body[0] : body;
  if (!isObject(op) || typeof op.query !== 'string') return null;
  return { query: op.query, variables: isObject(op.variables) ? op.variables : {}, operationName: op.operationName || null };
}

const argsOf = (node, variables) => {
  const args = {};
  for (const arg of node.arguments || []) {
    try {
      // Plain objects (graphql-js builds null-prototype ones) so they clone and compare normally.
      const value = valueFromASTUntyped(arg.value, variables);
      args[arg.name.value] = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    } catch (e) {
      args[arg.name.value] = undefined;
    }
  }
  return args;
};

// Root fields of the chosen operation. Fields nested in a Contember `transaction`
// mutation are flattened with the path to their result.
export function analyzeOperation(query, variables = {}, operationName = null) {
  let doc;
  try {
    doc = parse(query, { noLocation: true });
  } catch (e) {
    return { operationType: null, operationName, rootFields: [], parseError: e.message };
  }
  const ops = doc.definitions.filter(d => d.kind === Kind.OPERATION_DEFINITION);
  const op = (operationName && ops.find(o => o.name && o.name.value === operationName)) || ops[0];
  if (!op) return { operationType: null, operationName, rootFields: [], parseError: 'No operation in the document' };
  const fragments = Object.fromEntries(
    doc.definitions.filter(d => d.kind === Kind.FRAGMENT_DEFINITION).map(d => [d.name.value, d]),
  );

  const fields = [];
  const collect = (selectionSet, path) => {
    for (const sel of selectionSet.selections) {
      if (sel.kind === Kind.FIELD) {
        const name = sel.name.value;
        if (name === '__typename') continue;
        const alias = sel.alias ? sel.alias.value : name;
        if (name === 'transaction' && op.operation === 'mutation' && sel.selectionSet) {
          fields.push({ name, alias, path: [...path, alias], entity: null, action: 'transaction', args: argsOf(sel, variables) });
          collect(sel.selectionSet, [...path, alias]);
          continue;
        }
        fields.push({ name, alias, path: [...path, alias], ...entityOf(name), args: argsOf(sel, variables) });
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        collect(sel.selectionSet, path);
      } else if (sel.kind === Kind.FRAGMENT_SPREAD && fragments[sel.name.value]) {
        collect(fragments[sel.name.value].selectionSet, path);
      }
    }
  };
  collect(op.selectionSet, []);
  return {
    operationType: op.operation,
    operationName: op.name ? op.name.value : operationName,
    rootFields: fields,
    parseError: null,
  };
}

const at = (data, path) => path.reduce((v, k) => (isObject(v) ? v[k] : undefined), data);

// Contember paths are lists of { field } and { index, alias } fragments.
export function formatPath(path) {
  if (!Array.isArray(path)) return '';
  return path.reduce((out, part) => {
    if (isObject(part) && part.field != null) return out ? `${out}.${part.field}` : String(part.field);
    if (isObject(part) && (part.index != null || part.alias != null)) return `${out}[${part.alias != null ? part.alias : part.index}]`;
    if (typeof part === 'number') return `${out}[${part}]`;
    if (typeof part === 'string') return out ? `${out}.${part}` : part;
    return out;
  }, '');
}

// Errors a Contember mutation result reports with HTTP 200: ok: false, errorMessage,
// errors[] and validation.errors[].
function mutationErrors(result, field) {
  const errors = [];
  if (!isObject(result)) return errors;
  const where = field.path.join('.');
  if (isObject(result.validation) && Array.isArray(result.validation.errors)) {
    for (const e of result.validation.errors) {
      errors.push({
        kind: 'validation',
        field: where,
        path: formatPath(e.path),
        message: (isObject(e.message) ? e.message.text : e.message) || 'Invalid value',
      });
    }
  }
  if (Array.isArray(result.errors)) {
    for (const e of result.errors) {
      const paths = Array.isArray(e.paths) ? e.paths : e.path ? [e.path] : [];
      const formatted = paths.map(p => formatPath(Array.isArray(p) ? p : [p])).filter(Boolean);
      errors.push({
        kind: 'mutation',
        field: where,
        path: formatted.join(', '),
        type: e.type || null,
        message: e.message || e.type || 'Mutation failed',
      });
    }
  }
  if (result.ok === false && !errors.length) {
    errors.push({ kind: 'mutation', field: where, path: '', message: result.errorMessage || 'The mutation was not applied (ok: false)' });
  }
  return errors;
}

// Records a request read or wrote, so their event-log history can be opened.
function recordsOf(fields, data) {
  const out = [];
  const seen = new Set();
  const add = (entity, id, action, alias) => {
    if (!entity || id == null || (typeof id !== 'string' && typeof id !== 'number')) return;
    const key = `${entity}|${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ entity, id: String(id), action, alias });
  };
  for (const f of fields) {
    if (!f.entity) continue;
    const result = at(data, f.path);
    const by = isObject(f.args.by) ? f.args.by : null;
    if (WRITES.has(f.action)) {
      const node = isObject(result) && isObject(result.node) ? result.node : null;
      const id = (node && node.id) || (by && by.id) || (isObject(f.args.data) && f.args.data.id);
      add(f.entity, id, f.action, f.alias);
    } else if (f.action === 'get') {
      add(f.entity, (isObject(result) && result.id) || (by && by.id), f.action, f.alias);
    }
  }
  return out;
}

const truncate = (text, max) => (typeof text === 'string' && text.length > max ? text.slice(0, max) : text);

// capture: { url, method, requestBody, requestHeaders, status, responseText, networkError,
//            aborted, startedAt, duration, pageUrl, pageLoadId, tabId, frameId }
export function analyzeCapture(capture, extraPatterns = []) {
  const endpoint = detectEndpoint(capture.url, capture.pageUrl, extraPatterns) || {
    api: 'other', url: capture.url, apiEndpoint: null, project: null, stage: null,
  };
  const request = parseRequestBody(capture.requestBody);
  const op = request
    ? analyzeOperation(request.query, request.variables, request.operationName)
    : { operationType: null, operationName: null, rootFields: [], parseError: 'Not a GraphQL request body' };

  const responseText = capture.responseText == null ? null : String(capture.responseText);
  const truncated = responseText != null && responseText.length > MAX_BODY;
  const response = truncated ? undefined : safeJson(responseText);
  const data = isObject(response) ? response.data : undefined;

  const errors = [];
  if (Array.isArray(response && response.errors)) {
    for (const e of response.errors) {
      errors.push({ kind: 'graphql', field: Array.isArray(e.path) ? e.path.join('.') : '', path: '', message: e.message || 'GraphQL error' });
    }
  }
  if (op.operationType === 'mutation') {
    for (const f of op.rootFields) {
      if (WRITES.has(f.action) || f.action === 'transaction') errors.push(...mutationErrors(at(data, f.path), f));
    }
  }

  let outcome = 'ok';
  let reason = null;
  const status = capture.status || 0;
  if (capture.aborted) {
    outcome = 'aborted';
    reason = 'Cancelled';
  } else if (capture.networkError) {
    outcome = 'error';
    reason = 'Network error';
    errors.unshift({ kind: 'network', field: '', path: '', message: capture.networkError });
  } else if (status && (status < 200 || status >= 300)) {
    outcome = 'error';
    reason = `HTTP ${status}`;
    if (!errors.length) errors.push({ kind: 'http', field: '', path: '', message: `The server answered ${status}.` });
  } else if (errors.some(e => e.kind === 'graphql')) {
    outcome = 'error';
    reason = 'GraphQL error';
  } else if (errors.length) {
    outcome = 'error';
    reason = errors.some(e => e.kind === 'validation') ? 'Validation' : 'Not applied';
  } else if (responseText != null && !truncated && response === undefined) {
    outcome = 'error';
    reason = 'Not JSON';
  }

  const rootFields = op.rootFields.map(({ args, ...rest }) => rest);
  const entities = [...new Set(op.rootFields.map(f => f.entity).filter(Boolean))];
  const records = data ? recordsOf(op.rootFields, data) : recordsOf(op.rootFields, {});
  const variablesText = request ? JSON.stringify(request.variables) : '';

  const searchText = [
    op.operationName,
    op.operationType,
    ...rootFields.map(f => (f.alias !== f.name ? `${f.alias} ${f.name}` : f.name)),
    ...entities,
    ...records.map(r => r.id),
    ...errors.map(e => `${e.path} ${e.message}`),
    endpoint.project,
    endpoint.stage,
    reason,
    variablesText.slice(0, MAX_SEARCH),
  ].filter(Boolean).join(' ').toLowerCase().slice(0, MAX_SEARCH * 2);

  const meta = {
    tabId: capture.tabId == null ? null : capture.tabId,
    frameId: capture.frameId || 0,
    pageLoadId: capture.pageLoadId || null,
    pageUrl: capture.pageUrl || null,
    url: endpoint.url,
    method: capture.method || 'POST',
    api: endpoint.api,
    apiEndpoint: endpoint.apiEndpoint,
    project: endpoint.project,
    stage: endpoint.stage,
    operationType: op.operationType,
    operationName: op.operationName,
    parseError: op.parseError,
    rootFields,
    entities,
    records,
    errors: errors.slice(0, MAX_ERRORS),
    errorCount: errors.length,
    outcome,
    reason,
    status,
    startedAt: capture.startedAt,
    duration: capture.duration,
    requestSize: capture.requestBody ? capture.requestBody.length : 0,
    responseSize: responseText ? responseText.length : 0,
    truncated,
    searchText,
  };
  const body = {
    query: request ? request.query : null,
    variables: request ? request.variables : null,
    rawRequest: request ? null : truncate(capture.requestBody, MAX_BODY),
    responseText: truncate(responseText, MAX_BODY),
    requestHeaders: capture.requestHeaders || {},
    args: Object.fromEntries(op.rootFields.map(f => [f.path.join('.'), f.args])),
  };
  return { meta, body };
}

// One-line description used in the list: operation name, else root fields.
export function summarize(meta, max = 2) {
  if (meta.operationName) return { text: meta.operationName, more: 0 };
  const names = meta.rootFields.filter(f => f.action !== 'transaction').map(f => f.name);
  const unique = [...new Set(names)];
  if (!unique.length) return { text: meta.parseError ? 'Unreadable request' : meta.api, more: 0 };
  return { text: unique.slice(0, max).join(' · '), more: Math.max(0, unique.length - max) };
}
