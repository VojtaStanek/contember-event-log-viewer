import React, { useMemo } from 'react';
import { AppContext } from '../../../src/context';
import { useSchema } from '../../../src/useSchema';
import { connectionFor } from '../lib/transport';
import { toSnake } from '../../../src/schemaFromContent';

// One connection object per (tab, endpoint, project, stage), so the viewer's caches
// (schema, loaded events) keep working when you move between requests.
const connections = new Map();

export const connectionKeyFor = (meta) =>
  meta && meta.apiEndpoint && meta.project
    ? `${meta.tabId}|${meta.frameId}|${meta.apiEndpoint}|${meta.project}|${meta.stage || 'live'}`
    : null;

export const useConnection = (meta) => {
  const key = connectionKeyFor(meta);
  return useMemo(() => {
    if (!key) return null;
    if (!connections.has(key)) connections.set(key, connectionFor(meta));
    return connections.get(key);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
};

// Table of an entity; without the schema, Contember's default naming.
export const tableFor = (schema, entity) =>
  (schema && schema.entities[entity] && schema.entities[entity].tableName) || toSnake(entity);

// Provides the viewer's AppContext for a request's project. The schema (a system API
// call through the admin's session) is only loaded while `active`.
export const SessionProvider = ({ meta, active, notify, children }) => {
  const conn = useConnection(meta);
  const schema = useSchema(active ? conn : null);
  const value = useMemo(
    () => ({ conn, schema: schema.index, schemaStatus: schema.status, schemaError: schema.error, notify }),
    [conn, schema.index, schema.status, schema.error, notify],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
