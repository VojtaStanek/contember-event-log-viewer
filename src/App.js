import React, { useState, useEffect } from 'react';
import EventLog from './EventLog';
import './App.css'; // Import the CSS file for styling

const App = () => {
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [projectName, setProjectName] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [tableName, setTableName] = useState('');
  const [primaryKey, setPrimaryKey] = useState('');
  const [eventLogData, setEventLogData] = useState([]);

  useEffect(() => {
    const savedConfig = JSON.parse(localStorage.getItem('eventLogConfig'));
    if (savedConfig) {
      setApiEndpoint(savedConfig.apiEndpoint);
      setProjectName(savedConfig.projectName);
      setAuthToken(savedConfig.authToken);
      setTableName(savedConfig.tableName);
      setPrimaryKey(savedConfig.primaryKey);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('eventLogConfig', JSON.stringify({
      apiEndpoint,
      projectName,
      authToken,
      tableName,
      primaryKey
    }));
  }, [apiEndpoint, projectName, authToken, tableName, primaryKey]);

  const fetchEventLogData = async () => {

    const response = await fetch(apiEndpoint.replace(/\/$/, '') + '/system/' + projectName, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        query: `query ($tableName: String!, $primaryKey: PrimaryKey!) {
          events(args: { stage: "live", filter: { rows: { tableName: $tableName primaryKey: [$primaryKey] } } }) {
            type
            identityId
            identityDescription
            appliedAt 
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
          tableName,
          primaryKey
        }
      })
    });
    const data = await response.json();
    setEventLogData(data.data.events);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchEventLogData();
  };

  return (
    <div className="app-container">
      <h1>Contember Event Log Viewer</h1>
      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-group">
          <label>API Endpoint:</label>
          <input type="text" value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Project Name:</label>
          <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Bearer Auth Token:</label>
          <input type="text" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Table Name:</label>
          <input type="text" value={tableName} onChange={(e) => setTableName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Primary Key:</label>
          <input type="text" value={primaryKey} onChange={(e) => setPrimaryKey(e.target.value)} />
        </div>
        <button type="submit" className="submit-button">Fetch Event Log</button>
      </form>
      <EventLog data={eventLogData} />
    </div>
  );
};

export default App;
