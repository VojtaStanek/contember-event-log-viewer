// Runs in the page's own JavaScript world at document_start. It wraps fetch and
// XMLHttpRequest to copy Contember API calls (request body, response text, timing)
// and posts them to relay.js. The page always gets its original response, and the
// wrapper's own failures are swallowed.
import { detectEndpoint } from './lib/detect.js';

const MARK = '__contemberInspector';
const MAX_BODY = 5 * 1024 * 1024 + 1;

(() => {
  if (window[MARK]) return;
  Object.defineProperty(window, MARK, { value: true });

  let extraPatterns = [];
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data[MARK] === 'config') {
      extraPatterns = Array.isArray(e.data.patterns) ? e.data.patterns : [];
    }
  });

  const matches = (url, method) => {
    try {
      return String(method || 'GET').toUpperCase() === 'POST' && !!detectEndpoint(url, window.location.href, extraPatterns);
    } catch (e) {
      return false;
    }
  };

  const emit = (capture) => {
    try {
      window.postMessage({ [MARK]: 'capture', capture }, '*');
    } catch (e) {
      // Not cloneable; nothing to record.
    }
  };

  const clip = (text) => (typeof text === 'string' && text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text);

  const headersToObject = (headers) => {
    const out = {};
    try {
      if (!headers) return out;
      const entries = typeof headers.forEach === 'function' && !Array.isArray(headers)
        ? (() => { const list = []; headers.forEach((v, k) => list.push([k, v])); return list; })()
        : Array.isArray(headers) ? headers : Object.entries(headers);
      for (const [k, v] of entries) out[String(k).toLowerCase()] = String(v);
    } catch (e) {
      // Unusual header container; leave it out.
    }
    return out;
  };

  const bodyText = async (body) => {
    if (body == null) return null;
    if (typeof body === 'string') return body;
    if (body instanceof Blob) return body.text();
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
    if (body instanceof URLSearchParams) return body.toString();
    return null; // FormData (uploads), streams: not GraphQL JSON.
  };

  // ---- fetch ----
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    const wrapped = function fetch(input, init) {
      let url;
      let method;
      try {
        url = input instanceof Request ? input.url : String(input);
        method = (init && init.method) || (input instanceof Request ? input.method : 'GET');
      } catch (e) {
        return originalFetch.apply(this, arguments);
      }
      if (!matches(url, method)) return originalFetch.apply(this, arguments);

      const startedAt = Date.now();
      const t0 = performance.now();
      let requestBody;
      let requestHeaders;
      try {
        requestHeaders = headersToObject((init && init.headers) || (input instanceof Request ? input.headers : null));
        requestBody = init && init.body != null
          ? bodyText(init.body)
          : input instanceof Request ? input.clone().text() : Promise.resolve(null);
      } catch (e) {
        requestBody = Promise.resolve(null);
      }

      const finish = (result) => {
        Promise.resolve(requestBody).catch(() => null).then((body) => emit({
          url, method: String(method).toUpperCase(), requestBody: clip(body), requestHeaders,
          startedAt, duration: Math.round(performance.now() - t0), ...result,
        }));
      };

      const promise = originalFetch.apply(this, arguments);
      promise.then(
        (response) => {
          try {
            response.clone().text().then(
              (text) => finish({ status: response.status, responseText: clip(text) }),
              (e) => finish({ status: response.status, responseText: null, aborted: e && e.name === 'AbortError' }),
            );
          } catch (e) {
            finish({ status: response.status, responseText: null });
          }
        },
        (error) => {
          const aborted = error && error.name === 'AbortError';
          finish({ status: 0, responseText: null, aborted, networkError: aborted ? null : String((error && error.message) || error) });
        },
      );
      return promise;
    };
    try {
      Object.defineProperty(wrapped, 'name', { value: 'fetch' });
    } catch (e) {
      // Cosmetic only.
    }
    window.fetch = wrapped;
  }

  // ---- XMLHttpRequest ----
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const state = new WeakMap();
    const { open, send, setRequestHeader } = XHR.prototype;
    XHR.prototype.open = function (method, url) {
      try {
        const href = String(url);
        state.set(this, matches(href, method) ? { method: String(method).toUpperCase(), url: href, headers: {} } : null);
      } catch (e) {
        state.delete(this);
      }
      return open.apply(this, arguments);
    };
    XHR.prototype.setRequestHeader = function (name, value) {
      const s = state.get(this);
      if (s) s.headers[String(name).toLowerCase()] = String(value);
      return setRequestHeader.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      const s = state.get(this);
      if (s) {
        s.startedAt = Date.now();
        s.t0 = performance.now();
        const requestBody = bodyText(body).catch(() => null);
        let aborted = false;
        this.addEventListener('abort', () => { aborted = true; });
        this.addEventListener('loadend', () => {
          let responseText = null;
          try {
            if (this.responseType === '' || this.responseType === 'text') responseText = this.responseText;
            else if (this.responseType === 'json') responseText = JSON.stringify(this.response);
          } catch (e) {
            responseText = null;
          }
          const status = this.status;
          const duration = Math.round(performance.now() - s.t0);
          requestBody.then((text) => emit({
            url: s.url, method: s.method, requestBody: clip(text), requestHeaders: s.headers,
            startedAt: s.startedAt, duration, status, responseText: clip(responseText), aborted,
            networkError: !aborted && status === 0 ? 'The request failed' : null,
          }));
        });
      }
      return send.apply(this, arguments);
    };
  }
})();
