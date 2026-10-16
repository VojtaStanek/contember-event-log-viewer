import React, { useEffect, useRef } from 'react';
import { summarize } from '../lib/analyze';
import { groupByPageLoad } from '../lib/filter';
import { clockTime, formatDuration, pageLabel } from './format';

const Row = ({ meta, selected, fresh, showProject, onSelect }) => {
  const { text, more } = summarize(meta);
  const isMutation = meta.operationType === 'mutation';
  const failed = meta.outcome === 'error';
  const badge = isMutation ? 'M' : meta.operationType === 'query' ? 'Q' : '?';
  return (
    <li
      id={`req-${meta.id}`}
      role="option"
      aria-selected={selected}
      className={`insp-row${selected ? ' is-selected' : ''}${failed ? ' is-failed' : ''}${meta.outcome === 'aborted' ? ' is-aborted' : ''}${fresh ? ' is-fresh' : ''}`}
      onClick={() => onSelect(meta.id)}
    >
      <span className={`insp-badge insp-badge--${isMutation ? 'mutation' : 'query'}`} title={isMutation ? 'Mutation' : 'Query'}>{badge}</span>
      <span className="insp-row-main">
        <span className="insp-row-name">{text}{more > 0 && <span className="insp-muted"> +{more}</span>}</span>
        {meta.api !== 'content' && <span className="insp-tag">{meta.api}</span>}
        {showProject && meta.project && <span className="insp-tag">{meta.project}{meta.stage ? `/${meta.stage}` : ''}</span>}
      </span>
      <span className="insp-row-side">
        {failed || meta.outcome === 'aborted'
          ? <span className={failed ? 'insp-row-reason' : 'insp-muted'}>{meta.reason}</span>
          : <span className="insp-muted">{formatDuration(meta.duration)}</span>}
        <time className="insp-row-time" dateTime={new Date(meta.startedAt).toISOString()}>{clockTime(meta.startedAt)}</time>
      </span>
    </li>
  );
};

export const RequestList = ({ requests, selectedId, freshIds, showProject, onSelect, listRef, onKeyDown, onScroll }) => {
  const groups = groupByPageLoad(requests);
  const selectedRef = useRef(null);
  useEffect(() => {
    const el = selectedId && document.getElementById(`req-${selectedId}`);
    if (el && selectedRef.current !== selectedId) el.scrollIntoView({ block: 'nearest' });
    selectedRef.current = selectedId;
  }, [selectedId]);

  return (
    <div className="insp-list-scroll" ref={listRef} onScroll={onScroll}>
      <ul
        className="insp-list"
        role="listbox"
        tabIndex={0}
        aria-label="Captured requests"
        aria-activedescendant={selectedId ? `req-${selectedId}` : undefined}
        onKeyDown={onKeyDown}
      >
        {groups.map(g => (
          <React.Fragment key={g.key + g.items[0].id}>
            <li className="insp-divider" role="presentation" title={g.pageUrl}>
              <span className="insp-divider-page">{pageLabel(g.pageUrl)}</span>
              <span className="insp-muted">from {clockTime(g.items[g.items.length - 1].startedAt)}</span>
            </li>
            {g.items.map(r => (
              <Row
                key={r.id}
                meta={r}
                selected={r.id === selectedId}
                fresh={freshIds.has(r.id)}
                showProject={showProject}
                onSelect={onSelect}
              />
            ))}
          </React.Fragment>
        ))}
      </ul>
    </div>
  );
};
