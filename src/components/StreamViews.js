import React, { useMemo, useState } from 'react';
import { useApp } from '../context';
import { tableInfo, tableLabel } from '../schema';
import { CopyButton } from './Value';
import { EventStream } from './EventStream';
import { OrderToggle, TypeFilter } from './RowView';

const StreamPage = ({ title, sub, id, baseFilter, defaultOrder = 'desc', all = false, showTxLink = true, empty }) => {
  const [types, setTypes] = useState([]);
  const [order, setOrder] = useState(defaultOrder);
  const [refreshToken, setRefreshToken] = useState(0);
  return (
    <main className="stream-page">
      <header className="page-head">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
        {id && (
          <div className="record-pk">
            <span className="mono">{id}</span>
            <CopyButton text={id} />
          </div>
        )}
      </header>
      <div className="toolbar">
        <TypeFilter types={types} onChange={setTypes} />
        <OrderToggle order={order} onChange={setOrder} />
        <button type="button" className="btn-quiet" onClick={() => setRefreshToken(n => n + 1)}>Refresh</button>
      </div>
      <EventStream
        filter={baseFilter}
        types={types}
        order={order}
        all={all}
        showRow
        showTxLink={showTxLink}
        refreshToken={refreshToken}
        empty={empty}
      />
    </main>
  );
};

export const TransactionView = ({ id }) => {
  const filter = useMemo(() => ({ transactions: [id] }), [id]);
  return (
    <StreamPage
      title="Transaction"
      sub="Every change committed together in this transaction."
      id={id}
      baseFilter={filter}
      defaultOrder="asc"
      all
      showTxLink={false}
      empty="No events in this transaction. Check the ID and the stage."
    />
  );
};

export const TableView = ({ table }) => {
  const { schema } = useApp();
  const filter = useMemo(() => ({ tables: [table] }), [table]);
  const info = tableInfo(schema, table);
  return (
    <StreamPage
      title={tableLabel(schema, table)}
      sub={info && info.kind === 'entity' && info.entity.name === table ? 'Latest changes' : `Latest changes in table ${table}`}
      baseFilter={filter}
      empty="No events in this table yet."
    />
  );
};

export const IdentityView = ({ id, label }) => {
  const filter = useMemo(() => ({ identities: [id] }), [id]);
  return (
    <StreamPage
      title={label || 'Identity'}
      sub="Latest changes made by this identity."
      id={id}
      baseFilter={filter}
      empty="This identity hasn't changed anything on this stage."
    />
  );
};
