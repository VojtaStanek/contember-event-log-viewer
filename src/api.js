// Thin GraphQL client for the Contember system and content APIs.
import { CONTENT_INTROSPECTION, modelFromIntrospection } from './schemaFromContent';

export class ApiError extends Error {
  constructor(message, { status, graphql } = {}) {
    super(message);
    this.status = status;
    this.graphql = graphql;
  }
}

const baseUrl = (conn) => conn.apiEndpoint.replace(/\/+$/, '');
export const systemUrl = (conn) => `${baseUrl(conn)}/system/${conn.projectName}`;
export const contentUrl = (conn) => `${baseUrl(conn)}/content/${conn.projectName}/${conn.stage || 'live'}`;

export const connectionKey = (conn) => `${baseUrl(conn)}|${conn.projectName}|${conn.stage || 'live'}`;

// Default transport: the browser's fetch with the profile's bearer token.
// Another transport (e.g. the browser extension relaying through a page that holds
// a session cookie) can be passed on the connection as `conn.transport`.
export async function fetchTransport({ url, token, body, signal }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { method: 'POST', headers, body, signal });
  return { status: response.status, ok: response.ok, text: await response.text() };
}

const sessionAuth = (conn) => conn && conn.auth === 'session';

export async function gql(conn, url, query, variables, signal) {
  const transport = (conn && conn.transport) || fetchTransport;
  let response;
  try {
    response = await transport({ url, token: conn && conn.authToken, body: JSON.stringify({ query, variables }), signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    if (e instanceof ApiError) throw e;
    throw new ApiError(`Couldn't reach ${url}. Check the API endpoint and that the server allows requests from this origin (CORS).`);
  }
  if (response.status === 401) {
    throw new ApiError(
      sessionAuth(conn)
        ? 'Your admin session has expired (401). Log in to the admin again, then retry.'
        : 'The server rejected the token (401). Update it in the profile.',
      { status: 401 },
    );
  }
  if (response.status === 403) {
    throw new ApiError(
      sessionAuth(conn)
        ? 'Your admin user is not allowed to do that (403).'
        : 'This token is not allowed to do that (403). Use a token with the needed permissions.',
      { status: 403 },
    );
  }
  if (response.status === 404) {
    throw new ApiError(`Nothing found at ${url} (404). Check the API endpoint, project name and stage.`, { status: 404 });
  }
  let body;
  try {
    body = JSON.parse(response.text);
  } catch (e) {
    throw new ApiError(`The server answered ${response.status} with a response that isn't JSON.`, { status: response.status });
  }
  if (body.errors && body.errors.length) {
    throw new ApiError(body.errors.map(e => e.message).join('\n'), { status: response.status, graphql: body.errors });
  }
  const ok = response.ok !== undefined ? response.ok : response.status >= 200 && response.status < 300;
  if (!ok) {
    throw new ApiError(`The server answered ${response.status}.`, { status: response.status });
  }
  return body.data;
}

// --- System API -----------------------------------------------------------

// UpdateEvent.oldValues is deliberately not requested: it repeats the whole previous
// row for every update, which for big records (e.g. articles with rich content)
// multiplies the response size. Previous values are rebuilt client-side instead.
const EVENT_FIELDS = `
  id
  transactionId
  type
  identityId
  identityDescription
  createdAt
  appliedAt
  tableName
  primaryKey
  ... on CreateEvent { newValues }
  ... on UpdateEvent { diffValues }
  ... on DeleteEvent { oldValues }
`;

export async function fetchEvents(conn, { filter, order = 'CREATED_AT_DESC', limit = 50, offset = 0 }, signal) {
  const data = await gql(
    conn,
    systemUrl(conn),
    `query ($args: EventsArgs) { events(args: $args) { ${EVENT_FIELDS} } }`,
    { args: { stage: conn.stage || 'live', filter, order, limit, offset } },
    signal,
  );
  return data.events;
}

// Engines older than the System API's `schema` query get a model inferred from the
// Content API's introspection instead.
export async function fetchSchema(conn, signal) {
  try {
    const data = await gql(conn, systemUrl(conn), 'query { schema }', undefined, signal);
    return data.schema;
  } catch (e) {
    if (!(e.graphql && e.graphql.some(err => /Cannot query field "schema"/.test(err.message || '')))) throw e;
  }
  return modelFromIntrospection(await gql(conn, contentUrl(conn), CONTENT_INTROSPECTION, undefined, signal));
}

// --- Content API ----------------------------------------------------------

export async function content(conn, query, variables, signal) {
  return gql(conn, contentUrl(conn), query, variables, signal);
}
