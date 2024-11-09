import React from 'react';
import './EventLog.css';

const EventLog = ({ data }) => {
  return (
    <table className="event-log-table">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Event Type</th>
          <th>Details</th>
          <th>Identity Description</th>
        </tr>
      </thead>
      <tbody>
        {data.map((entry, index) => (
          <tr key={index}>
            <td title={new Date(entry.appliedAt).toLocaleString() + ' in ' + Intl.DateTimeFormat().resolvedOptions().timeZone} className="timestamp">
              {entry.appliedAt}
            </td>
            <td>{entry.type}</td>
            <td className="details">
              {entry.type === 'CREATE' && JSON.stringify(entry.newValues, null, 2)}
              {entry.type === 'UPDATE' && JSON.stringify(entry.diffValues, null, 2)}
              {entry.type === 'DELETE' && JSON.stringify(entry.oldValues, null, 2)}
            </td>
            <td title={entry.identityId}>{entry.identityDescription}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default EventLog;
