import React from 'react';

// Same mark as public/favicon.svg, drawn with the theme tokens.
export const Logo = ({ size = 26 }) => (
  <svg className="logo" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
    <path d="M16 2v28" stroke="var(--ink-muted)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="16" cy="5.5" r="3.6" fill="var(--create)" />
    <circle cx="16" cy="16" r="3.4" fill="var(--sheet)" stroke="var(--update)" strokeWidth="2.2" />
    <circle cx="16" cy="26.5" r="3.4" fill="var(--sheet)" stroke="var(--delete)" strokeWidth="2.2" />
    <path d="M13.9 28.6l4.2-4.2" stroke="var(--delete)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
