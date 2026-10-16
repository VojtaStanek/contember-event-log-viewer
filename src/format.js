export const shortId = (id) => {
  const s = String(id);
  // Head and tail: sequential IDs (e.g. UUIDv7) share their prefix.
  return s.length > 13 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
};

export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const absoluteFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
export const absoluteTime = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? String(iso) : absoluteFormat.format(d);
};

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];
export const relativeTime = (iso) => {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  if (isNaN(diff)) return String(iso);
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diff) >= seconds || unit === 'second') {
      return rtf.format(Math.round(diff / seconds), unit);
    }
  }
  return '';
};

export const eventVerb = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  TRUNCATE: 'Truncated',
};
