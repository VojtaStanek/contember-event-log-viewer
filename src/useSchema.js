import { useEffect, useState } from 'react';
import { connectionKey, fetchSchema } from './api';
import { buildSchemaIndex } from './schema';

// Loads the project schema once per session (cached in sessionStorage) and indexes it.
// status: idle | loading | ready | unavailable (no permission, extras off) | error (blocks everything)
export const useSchema = (conn) => {
  const [state, setState] = useState({ index: null, status: 'idle', error: null });
  useEffect(() => {
    if (!conn) {
      setState({ index: null, status: 'idle', error: null });
      return;
    }
    const cacheKey = `eventLogSchema|${connectionKey(conn)}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setState({ index: buildSchemaIndex(JSON.parse(cached)), status: 'ready', error: null });
        return;
      }
    } catch (e) {
      // Fall through to fetching.
    }
    const controller = new AbortController();
    setState({ index: null, status: 'loading', error: null });
    fetchSchema(conn, controller.signal)
      .then(raw => {
        const index = buildSchemaIndex(raw);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(raw));
        } catch (e) {
          // Too large or unavailable: it'll be fetched again next session.
        }
        setState({ index, status: index ? 'ready' : 'unavailable', error: null });
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        // Auth/network problems block everything; missing schema permission only disables extras.
        const fatal = !e.graphql;
        setState({ index: null, status: fatal ? 'error' : 'unavailable', error: e });
      });
    return () => controller.abort();
  }, [conn]);
  return state;
};
