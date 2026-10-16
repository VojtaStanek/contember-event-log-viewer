import { createContext, useContext } from 'react';

// { conn, schema (index or null), schemaStatus, notify(message, kind) }
export const AppContext = createContext(null);

export const useApp = () => useContext(AppContext);
