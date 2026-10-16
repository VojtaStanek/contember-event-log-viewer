import React, { useMemo } from 'react';
import { parse, print } from 'graphql';

const TOKEN = /("""[\s\S]*?"""|"(?:\\.|[^"\\])*")|(#[^\n]*)|(\$[_A-Za-z][_0-9A-Za-z]*)|(\b(?:query|mutation|subscription|fragment|on|true|false|null)\b)|(@[_A-Za-z][_0-9A-Za-z]*)|(-?\d+(?:\.\d+)?)|([_A-Za-z][_0-9A-Za-z]*)(\s*(?=[(:{]|$))?|([{}()[\]:!=,|.]+)/gm;

// Lightweight GraphQL highlighting: enough to tell keywords, fields, variables and literals apart.
const highlight = (text) => {
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [whole, str, comment, variable, keyword, directive, num, name, , punct] = m;
    const cls = str ? 'q-str' : comment ? 'q-comment' : variable ? 'q-var' : keyword ? 'q-kw' : directive ? 'q-dir' : num ? 'q-num' : name ? 'q-name' : punct ? 'q-punct' : null;
    out.push(cls ? <span key={i++} className={cls}>{whole}</span> : whole);
    last = m.index + whole.length;
    if (whole.length === 0) TOKEN.lastIndex++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

export const formatQuery = (query) => {
  try {
    return { text: print(parse(query)), error: null };
  } catch (e) {
    return { text: query, error: e.message };
  }
};

export const QueryView = ({ query }) => {
  const { text, error } = useMemo(() => formatQuery(query || ''), [query]);
  return (
    <>
      {error && <p className="insp-hint">This query couldn't be parsed ({error}). It is shown as sent.</p>}
      <pre className="insp-code">{highlight(text)}</pre>
    </>
  );
};
