import { useEffect, useState } from 'react';
import { connectionKey, fetchSchema } from './api';
import { buildSchemaIndex } from './schema';

// Loads the project schema once per session (cached in sessionStorage) and indexes it.
// status: idle | loading | ready | unavailable (no permission, extras off) | error (blocks everything)
const IDLE = { index: null, status: 'idle', error: null };

export const useSchema = (conn) => {
  // Tagged with its connection: right after `conn` changes, and before the effect
  // below runs, the previous connection's schema must not be reported as ready.
  const [state, setStateFor] = useState({ ...IDLE, conn: null });
  useEffect(() => {
    const setState = (next) => setStateFor({ ...next, conn });
    if (!conn) {
      setState(IDLE);
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
  if (!conn || state.conn !== conn) return IDLE;
  return state;
};
