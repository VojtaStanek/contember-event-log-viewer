import { useEffect, useState } from 'react';

// Routes:
//   #/row/{table}/{pk}   pk of junction rows is comma-separated
//   #/tx/{transactionId}
//   #/table/{table}
//   #/identity/{identityId}
export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'row':
      if (parts[1] && parts[2]) return { name: 'row', table: parts[1], pk: parts[2] };
      break;
    case 'tx':
      if (parts[1]) return { name: 'tx', id: parts[1] };
      break;
    case 'table':
      if (parts[1]) return { name: 'table', table: parts[1] };
      break;
    case 'identity':
      if (parts[1]) return { name: 'identity', id: parts[1], label: parts[2] };
      break;
    default:
  }
  return { name: 'home' };
}

const enc = encodeURIComponent;

export const href = {
  row: (table, pk) => `#/row/${enc(table)}/${enc(Array.isArray(pk) ? pk.join(',') : pk)}`,
  tx: (id) => `#/tx/${enc(id)}`,
  table: (table) => `#/table/${enc(table)}`,
  identity: (id, label) => `#/identity/${enc(id)}${label ? `/${enc(label)}` : ''}`,
  home: () => '#/',
};

export function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return [parseHash(hash), hash];
}

export const navigate = (to) => {
  window.location.hash = to;
};
