// Builds lookups from the Contember model so DB-level events (tables, columns)
// can be shown and edited in terms of entities and fields.

const ucfirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const isOwningRelation = (field) =>
  (field.type === 'ManyHasOne' || field.type === 'OneHasOne') && !!field.joiningColumn;

export function buildSchemaIndex(rawSchema) {
  const model = rawSchema && (rawSchema.model || rawSchema);
  if (!model || !model.entities) return null;

  const entities = model.entities;
  const enums = model.enums || {};
  const byTable = {};

  for (const entity of Object.values(entities)) {
    const columns = {};
    for (const field of Object.values(entity.fields)) {
      if (field.columnName) {
        columns[field.columnName] = { field, kind: 'column' };
      } else if (isOwningRelation(field)) {
        columns[field.joiningColumn.columnName] = { field, kind: 'relation', target: entities[field.target] };
      }
    }
    byTable[entity.tableName] = { kind: 'entity', entity, columns };
  }

  // Junction tables of many-has-many relations
  for (const entity of Object.values(entities)) {
    for (const field of Object.values(entity.fields)) {
      if (field.type !== 'ManyHasMany' || !field.joiningTable) continue;
      const { tableName, joiningColumn, inverseJoiningColumn } = field.joiningTable;
      const target = entities[field.target];
      byTable[tableName] = {
        kind: 'junction',
        owner: entity,
        field,
        target,
        columns: {
          [joiningColumn.columnName]: { kind: 'relation', target: entity, label: entity.name },
          [inverseJoiningColumn.columnName]: { kind: 'relation', target, label: field.target },
        },
      };
    }
  }

  // inferred: rebuilt from the Content API on engines without the System API's schema query.
  return { entities, enums, byTable, inferred: !!(rawSchema.inferred || model.inferred) };
}

// Resolves what the user typed (entity name or table name) to a table name.
export function resolveTable(index, input) {
  const text = input.trim();
  if (!index) return text;
  const lower = text.toLowerCase();
  const entity = Object.values(index.entities).find(e => e.name.toLowerCase() === lower);
  if (entity) return entity.tableName;
  return text;
}

export function tableInfo(index, tableName) {
  return (index && tableName && index.byTable[tableName]) || null;
}

export function tableLabel(index, tableName) {
  const info = tableInfo(index, tableName);
  if (!info) return tableName || 'Unknown table';
  if (info.kind === 'entity') return info.entity.name;
  return `${info.owner.name}.${info.field.name}`;
}

export function columnInfo(index, tableName, column) {
  const info = tableInfo(index, tableName);
  return (info && info.columns[column]) || null;
}

export function columnLabel(index, tableName, column) {
  const col = columnInfo(index, tableName, column);
  if (!col) return column;
  if (col.label) return col.label;
  return col.field.name;
}

// Relations listed in the "Related records" panel: everything that can hold
// more than the single id already shown among the current values.
export function collectionRelations(entity) {
  return Object.values(entity.fields).filter(f =>
    f.type === 'OneHasMany' ||
    f.type === 'ManyHasMany' ||
    (f.type === 'OneHasOne' && !f.joiningColumn)
  );
}

export function editableFields(entity) {
  if (entity.view) return [];
  return Object.values(entity.fields).filter(f =>
    (f.columnName && f.name !== entity.primary) || isOwningRelation(f)
  );
}

export const gqlNames = (entity) => ({
  get: `get${entity.name}`,
  update: `update${entity.name}`,
  uniqueWhere: `${entity.name}UniqueWhere`,
  updateInput: `${entity.name}UpdateInput`,
});

export const paginateFieldName = (field) => `paginate${ucfirst(field.name)}`;
