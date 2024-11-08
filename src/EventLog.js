import React from 'react';
import './EventLog.css';

const EventLog = ({ data }) => {
  return (
    <table className="event-log-table">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Event Type</th>
          <th>Table Name</th>
          <th>Primary Key</th>
          <th>Details</th>
          <th>Identity Description</th>
          <th>Identity ID</th>
        </tr>
      </thead>
      <tbody>
        {data.map((entry, index) => (
          <tr key={index}>
            <td>{entry.appliedAt}</td>
            <td>{entry.type}</td>
            <td>{entry.tableName}</td>
            <td>{entry.primaryKey}</td>
            <td className="details">
              {entry.type === 'CREATE' && JSON.stringify(entry.newValues, null, 2)}
              {entry.type === 'UPDATE' && JSON.stringify(entry.diffValues, null, 2)}
              {entry.type === 'DELETE' && JSON.stringify(entry.oldValues, null, 2)}
            </td>
            <td>{entry.identityDescription}</td>
            <td>{entry.identityId}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default EventLog;
