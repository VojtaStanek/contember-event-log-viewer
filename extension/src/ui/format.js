export const formatBytes = (n) => {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export const formatDuration = (ms) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
};

export const outcomeLabel = (meta) => {
  if (meta.outcome === 'ok') return 'OK';
  if (meta.outcome === 'aborted') return 'Cancelled';
  return meta.reason ? `Failed: ${meta.reason}` : 'Failed';
};

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const clockTime = (ms) => clock.format(new Date(ms));

export const pageLabel = (url) => {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch (e) {
    return url || 'Unknown page';
  }
};
