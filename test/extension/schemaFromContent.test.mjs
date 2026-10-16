import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchema, graphqlSync } from 'graphql';
import { CONTENT_INTROSPECTION, modelFromIntrospection } from '../../src/schemaFromContent.js';
import { buildSchemaIndex } from '../../src/schema.js';

const sdl = `
  scalar UUID
  scalar DateTime
  enum ArticleState { draft published }
  type ArticleMeta { id: String }
  type Article { _meta: ArticleMeta id: UUID! title: String state: ArticleState publishedAt: DateTime
    author: Author tags: [Tag!]! comments: [Comment!]! paginateComments: CommentConnection! }
  type Author { id: UUID! name: String! articles: [Article!]! profile: Profile }
  type Profile { id: UUID! bio: String author: Author }
  type Tag { id: UUID! label: String articles: [Article!]! }
  type Comment { id: UUID! text: String article: Article }
  type CommentConnection { totalCount: Int }
  type Query { getArticle: Article listArticle: [Article!]! getAuthor: Author getProfile: Profile getTag: Tag getComment: Comment }
`;

const introspection = graphqlSync({ schema: buildSchema(sdl), source: CONTENT_INTROSPECTION }).data;

test('infers a model from Content API introspection', () => {
  const model = modelFromIntrospection(introspection);
  assert.deepEqual(Object.keys(model.entities).sort(), ['Article', 'Author', 'Comment', 'Profile', 'Tag']);
  const article = model.entities.Article;
  assert.equal(article.fields._meta, undefined);
  assert.equal(article.fields.paginateComments, undefined);
  assert.equal(article.fields.publishedAt.columnName, 'published_at');
  assert.equal(article.fields.state.type, 'Enum');
  assert.deepEqual(model.enums.ArticleState, ['draft', 'published']);
  assert.equal(article.fields.author.type, 'ManyHasOne');
  assert.equal(article.fields.author.joiningColumn.columnName, 'author_id');
  assert.equal(article.fields.comments.type, 'OneHasMany');
  assert.equal(article.fields.tags.type, 'ManyHasMany');
  assert.equal(article.fields.tags.joiningTable.tableName, 'article_tags');
  assert.equal(model.entities.Author.fields.profile.type, 'OneHasOne');

  const index = buildSchemaIndex(model);
  assert.equal(index.inferred, true);
  assert.equal(index.byTable.article.columns.author_id.field.name, 'author');
  assert.equal(index.byTable.article_tags.kind, 'junction');
});
