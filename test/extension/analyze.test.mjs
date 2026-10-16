import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectEndpoint } from '../../extension/src/lib/detect.js';
import { analyzeCapture, analyzeOperation, formatPath, summarize } from '../../extension/src/lib/analyze.js';

const capture = (over) => ({
  url: 'https://admin.example.com/_api/content/blog/live',
  method: 'POST',
  status: 200,
  startedAt: 1000,
  duration: 42,
  pageUrl: 'https://admin.example.com/blog/articles',
  ...over,
});

const gqlBody = (query, variables = {}) => JSON.stringify({ query, variables });

test('detects engine routes behind any prefix', () => {
  assert.deepEqual(detectEndpoint('https://a.test/_api/content/blog/live'), {
    api: 'content', url: 'https://a.test/_api/content/blog/live', apiEndpoint: 'https://a.test/_api', project: 'blog', stage: 'live',
  });
  assert.equal(detectEndpoint('https://api.test/content/blog/prod/').apiEndpoint, 'https://api.test');
  assert.equal(detectEndpoint('/system/blog', 'https://a.test/x').api, 'system');
  assert.equal(detectEndpoint('https://a.test/_api/tenant').api, 'tenant');
  assert.equal(detectEndpoint('https://a.test/api/graphql'), null);
  assert.equal(detectEndpoint('https://a.test/api/graphql', undefined, ['/api/graphql']).api, 'other');
  assert.equal(detectEndpoint('https://a.test/content/blog/live/extra'), null);
});

test('reads root fields, aliases, variables and fragments', () => {
  const op = analyzeOperation(
    `query Q($id: UUID!) { a: getArticle(by: { id: $id }) { id } ...F }
     fragment F on Query { listCategory { id } }`,
    { id: 'x1' },
  );
  assert.equal(op.operationType, 'query');
  assert.equal(op.operationName, 'Q');
  assert.deepEqual(op.rootFields.map(f => [f.alias, f.name, f.entity, f.action]), [
    ['a', 'getArticle', 'Article', 'get'],
    ['listCategory', 'listCategory', 'Category', 'list'],
  ]);
  assert.deepEqual(op.rootFields[0].args, { by: { id: 'x1' } });
});

test('flattens fields inside a transaction mutation', () => {
  const op = analyzeOperation('mutation { transaction { u: updateArticle(by: {id: "1"}, data: {}) { ok } } }');
  assert.deepEqual(op.rootFields.map(f => f.path.join('.')), ['transaction', 'transaction.u']);
  assert.equal(op.rootFields[1].entity, 'Article');
});

test('a successful query lists the records it loaded', () => {
  const { meta } = analyzeCapture(capture({
    requestBody: gqlBody('query { getArticle(by: {id: "a1"}) { id title } }'),
    responseText: JSON.stringify({ data: { getArticle: { id: 'a1', title: 'Hi' } } }),
  }));
  assert.equal(meta.outcome, 'ok');
  assert.equal(meta.api, 'content');
  assert.equal(meta.project, 'blog');
  assert.deepEqual(meta.entities, ['Article']);
  assert.deepEqual(meta.records, [{ entity: 'Article', id: 'a1', action: 'get', alias: 'getArticle' }]);
  assert.deepEqual(summarize(meta), { text: 'getArticle', more: 0 });
});

test('a mutation with ok: false and validation errors is a failure', () => {
  const { meta } = analyzeCapture(capture({
    requestBody: gqlBody(
      'mutation ($id: UUID!, $data: ArticleUpdateInput!) { updateArticle(by: {id: $id}, data: $data) { ok errorMessage validation { valid errors { path { ... on _FieldPathFragment { field } } message { text } } } node { id } } }',
      { id: 'a1', data: { title: '' } },
    ),
    responseText: JSON.stringify({ data: { updateArticle: {
      ok: false,
      errorMessage: 'Validation failed',
      validation: { valid: false, errors: [{ path: [{ field: 'title' }], message: { text: 'Title is required' } }] },
      node: null,
    } } }),
  }));
  assert.equal(meta.outcome, 'error');
  assert.equal(meta.reason, 'Validation');
  assert.deepEqual(meta.errors.map(e => [e.kind, e.path, e.message]), [['validation', 'title', 'Title is required']]);
  assert.deepEqual(meta.records.map(r => r.id), ['a1']);
});

test('mutation errors with paths and a created node id', () => {
  const { meta } = analyzeCapture(capture({
    requestBody: gqlBody('mutation { createArticle(data: {}) { ok errors { type message paths { field } } node { id } } }'),
    responseText: JSON.stringify({ data: { createArticle: {
      ok: false,
      errors: [{ type: 'UniqueConstraintViolation', message: 'Slug already used', paths: [[{ field: 'tags' }, { index: 2, alias: null }, { field: 'slug' }]] }],
      node: null,
    } } }),
  }));
  assert.equal(meta.reason, 'Not applied');
  assert.equal(meta.errors[0].path, 'tags[2].slug');
  assert.equal(meta.errors[0].type, 'UniqueConstraintViolation');

  const ok = analyzeCapture(capture({
    requestBody: gqlBody('mutation { createArticle(data: {}) { ok node { id } } }'),
    responseText: JSON.stringify({ data: { createArticle: { ok: true, node: { id: 'new1' } } } }),
  })).meta;
  assert.equal(ok.outcome, 'ok');
  assert.deepEqual(ok.records, [{ entity: 'Article', id: 'new1', action: 'create', alias: 'createArticle' }]);
});

test('graphql errors, HTTP status, network failures and cancellations', () => {
  const body = gqlBody('{ listArticle { id } }');
  assert.equal(analyzeCapture(capture({ requestBody: body, responseText: JSON.stringify({ errors: [{ message: 'Boom' }] }) })).meta.reason, 'GraphQL error');
  assert.equal(analyzeCapture(capture({ requestBody: body, status: 401, responseText: '{"errors":[{"message":"Unauthorized"}]}' })).meta.reason, 'HTTP 401');
  const net = analyzeCapture(capture({ requestBody: body, status: 0, networkError: 'Failed to fetch' })).meta;
  assert.deepEqual([net.outcome, net.reason], ['error', 'Network error']);
  assert.equal(analyzeCapture(capture({ requestBody: body, status: 0, aborted: true })).meta.outcome, 'aborted');
  assert.equal(analyzeCapture(capture({ requestBody: body, responseText: '<html>' })).meta.reason, 'Not JSON');
});

test('unparsable bodies are kept but marked', () => {
  const { meta, body } = analyzeCapture(capture({ requestBody: 'not json', responseText: '{}' }));
  assert.equal(meta.operationType, null);
  assert.equal(body.rawRequest, 'not json');
  assert.equal(summarize(meta).text, 'Unreadable request');
});

test('formatPath', () => {
  assert.equal(formatPath([{ field: 'a' }, { index: 0, alias: null }, { field: 'b' }, { index: 1, alias: 'x' }]), 'a[0].b[x]');
});

test('filters and page-load groups', async () => {
  const { matchesFilters, groupByPageLoad } = await import('../../extension/src/lib/filter.js');
  const base = { text: '', ops: [], apis: [], failedOnly: false, entity: '' };
  const m = { operationType: 'mutation', api: 'content', outcome: 'error', entities: ['Article'], searchText: 'updatearticle validation', url: 'https://a/_api/content/blog/live' };
  assert.ok(matchesFilters(m, base));
  assert.ok(matchesFilters(m, { ...base, ops: ['mutation'], failedOnly: true, entity: 'Article', text: 'Update valid' }));
  assert.ok(!matchesFilters(m, { ...base, ops: ['query'] }));
  assert.ok(!matchesFilters(m, { ...base, apis: ['system'] }));
  assert.ok(!matchesFilters(m, { ...base, text: 'category' }));
  assert.ok(!matchesFilters({ ...m, outcome: 'aborted' }, { ...base, failedOnly: true }));
  const groups = groupByPageLoad([
    { id: 3, tabId: 1, pageLoadId: 'b' }, { id: 2, tabId: 1, pageLoadId: 'a' }, { id: 1, tabId: 1, pageLoadId: 'a' },
  ]);
  assert.deepEqual(groups.map(g => g.items.map(i => i.id)), [[3], [2, 1]]);
});
