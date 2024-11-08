import React, { useState } from 'react';
import EventLog from './EventLog';

const App = () => {
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [projectName, setProjectName] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [tableName, setTableName] = useState('');
  const [primaryKey, setPrimaryKey] = useState('');
  const [eventLogData, setEventLogData] = useState([]);

  const fetchEventLogData = async () => {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        query: `query ($since: DateTime!) {
          events(args: { stage: "live", filter: { appliedAt: { from: $since } }, limit: 100000 }) {
            type
            identityId
            identityDescription
            ... on CreateEvent {
              tableName
              primaryKey
              newValues
            }
            ... on UpdateEvent {
              tableName
              primaryKey
              diffValues
            }
            ... on DeleteEvent {
              tableName
              primaryKey
              oldValues
            }
          }
        }`,
        variables: {
          since: ""
        }
      })
    });
    const data = await response.json();
    setEventLogData(data);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchEventLogData();
  };

  return (
    <div>
      <h1>React Event Log Viewer</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>API Endpoint:</label>
          <input type="text" value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} />
        </div>
        <div>
          <label>Project Name:</label>
          <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        </div>
        <div>
          <label>Bearer Auth Token:</label>
          <input type="text" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
        </div>
        <div>
          <label>Table Name:</label>
          <input type="text" value={tableName} onChange={(e) => setTableName(e.target.value)} />
        </div>
        <div>
          <label>Primary Key:</label>
          <input type="text" value={primaryKey} onChange={(e) => setPrimaryKey(e.target.value)} />
        </div>
        <button type="submit">Fetch Event Log</button>
      </form>
      <EventLog data={eventLogData} />
    </div>
  );
};

export default App;
