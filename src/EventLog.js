import React from 'react';
import './EventLog.css'; // Import the CSS file for styling

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
            <td>
              {entry.type === 'CreateEvent' && JSON.stringify(entry.newValues)}
              {entry.type === 'UpdateEvent' && JSON.stringify(entry.diffValues)}
              {entry.type === 'DeleteEvent' && JSON.stringify(entry.oldValues)}
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
