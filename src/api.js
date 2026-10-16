// Thin GraphQL client for the Contember system and content APIs.

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

export async function gql(url, token, query, variables, signal) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(`Couldn't reach ${url}. Check the API endpoint and that the server allows requests from this origin (CORS).`);
  }
  if (response.status === 401) {
    throw new ApiError('The server rejected the token (401). Update it in the profile.', { status: 401 });
  }
  if (response.status === 403) {
    throw new ApiError('This token is not allowed to do that (403). Use a token with the needed permissions.', { status: 403 });
  }
  if (response.status === 404) {
    throw new ApiError(`Nothing found at ${url} (404). Check the API endpoint, project name and stage.`, { status: 404 });
  }
  let body;
  try {
    body = await response.json();
  } catch (e) {
    throw new ApiError(`The server answered ${response.status} with a response that isn't JSON.`, { status: response.status });
  }
  if (body.errors && body.errors.length) {
    throw new ApiError(body.errors.map(e => e.message).join('\n'), { status: response.status, graphql: body.errors });
  }
  if (!response.ok) {
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
    systemUrl(conn),
    conn.authToken,
    `query ($args: EventsArgs) { events(args: $args) { ${EVENT_FIELDS} } }`,
    { args: { stage: conn.stage || 'live', filter, order, limit, offset } },
    signal,
  );
  return data.events;
}

export async function fetchSchema(conn, signal) {
  const data = await gql(systemUrl(conn), conn.authToken, 'query { schema }', undefined, signal);
  return data.schema;
}

// --- Content API ----------------------------------------------------------

export async function content(conn, query, variables, signal) {
  return gql(contentUrl(conn), conn.authToken, query, variables, signal);
}
