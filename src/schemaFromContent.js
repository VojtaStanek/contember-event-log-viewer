// Older Contember engines have no `schema` query in the System API. For those, a model
// in the same shape is rebuilt from the Content API's GraphQL introspection, assuming
// Contember's default naming (snake_case tables and columns, `<field>_id` joining
// columns, `<owner>_<field>` junction tables). Introspection doesn't say which side of
// a one-has-one or many-has-many relation owns it, so both sides are treated as owning:
// the guessed column or junction table of the inverse side simply never matches an event.

export const toSnake = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const TYPE_REF = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';

export const CONTENT_INTROSPECTION = `query {
  __schema {
    queryType { name }
    types { kind name enumValues { name } fields { name type { ${TYPE_REF} } } }
  }
}`;

const SCALARS = {
  String: 'String',
  Int: 'Int',
  Float: 'Double',
  Boolean: 'Bool',
  Json: 'Json',
  UUID: 'Uuid',
  Date: 'Date',
  DateTime: 'DateTime',
};

// { name, kind, list, nullable } of a field's type with NON_NULL/LIST wrappers removed.
const unwrap = (type) => {
  let list = false;
  const nullable = type.kind !== 'NON_NULL';
  let t = type;
  while (t.ofType) {
    if (t.kind === 'LIST') list = true;
    t = t.ofType;
  }
  return { name: t.name, kind: t.kind, list, nullable };
};

export function modelFromIntrospection(introspection) {
  const types = {};
  for (const t of introspection.__schema.types) types[t.name] = t;
  const query = types[introspection.__schema.queryType.name];

  // Entities are the types the Content API offers a `get<Entity>` for.
  const names = new Set();
  for (const f of query.fields || []) {
    const m = /^get(.+)$/.exec(f.name);
    const type = unwrap(f.type);
    if (m && type.name === m[1] && types[m[1]] && types[m[1]].kind === 'OBJECT') names.add(m[1]);
  }

  const enums = {};
  const relations = {}; // entity -> [{ field, target, list }]
  const entities = {};
  for (const name of names) {
    const fields = {};
    relations[name] = [];
    for (const f of types[name].fields || []) {
      const type = unwrap(f.type);
      if (names.has(type.name)) {
        relations[name].push({ name: f.name, target: type.name, list: type.list, nullable: type.nullable });
      } else if (type.kind === 'ENUM') {
        enums[type.name] = (types[type.name].enumValues || []).map(v => v.name);
        fields[f.name] = { name: f.name, type: 'Enum', columnType: type.name, columnName: toSnake(f.name), nullable: type.nullable };
      } else if (type.kind === 'SCALAR' && SCALARS[type.name] && !type.list) {
        fields[f.name] = { name: f.name, type: SCALARS[type.name], columnName: toSnake(f.name), nullable: type.nullable };
      }
    }
    entities[name] = { name, primary: 'id', tableName: toSnake(name), fields };
  }

  for (const name of names) {
    for (const rel of relations[name]) {
      const back = relations[rel.target].filter(r => r.target === name && !(rel.target === name && r.name === rel.name));
      const field = { name: rel.name, target: rel.target, nullable: rel.nullable };
      if (!rel.list) {
        field.type = back.some(r => r.list) ? 'ManyHasOne' : back.length ? 'OneHasOne' : 'ManyHasOne';
        field.joiningColumn = { columnName: `${toSnake(rel.name)}_id` };
      } else if (back.some(r => !r.list)) {
        field.type = 'OneHasMany';
      } else {
        const owner = toSnake(name);
        const target = toSnake(rel.target);
        field.type = 'ManyHasMany';
        field.joiningTable = {
          tableName: `${owner}_${toSnake(rel.name)}`,
          joiningColumn: { columnName: `${owner}_id` },
          inverseJoiningColumn: { columnName: `${target}_id` },
        };
      }
      entities[name].fields[rel.name] = field;
    }
  }

  return { entities, enums, inferred: true };
}
