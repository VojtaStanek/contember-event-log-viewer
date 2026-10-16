import React from 'react';

export const ErrorNotice = ({ error, onRetry }) => (
  <div className="notice notice--error" role="alert">
    <p className="notice-text">{error.message || String(error)}</p>
    {onRetry && <button type="button" className="btn btn-small" onClick={onRetry}>Try again</button>}
  </div>
);

export const Toasts = ({ toasts }) => (
  <div className="toasts" aria-live="polite">
    {toasts.map(t => (
      <div key={t.id} className={`toast toast--${t.kind || 'ok'}`}>{t.message}</div>
    ))}
  </div>
);
