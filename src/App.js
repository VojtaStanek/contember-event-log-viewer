import React, { useState, useEffect } from 'react';
import EventLog from './EventLog';
import './App.css';

const App = () => {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [projectName, setProjectName] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [tableName, setTableName] = useState('');
  const [primaryKey, setPrimaryKey] = useState('');
  const [eventLogData, setEventLogData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const savedProfiles = JSON.parse(localStorage.getItem('eventLogProfiles')) || [];
    setProfiles(savedProfiles);
    if (savedProfiles.length > 0) {
      const defaultProfile = savedProfiles[0];
      setSelectedProfile(`${defaultProfile.apiEndpoint}-${defaultProfile.projectName}`);
      setApiEndpoint(defaultProfile.apiEndpoint);
      setProjectName(defaultProfile.projectName);
      setAuthToken(defaultProfile.authToken);
      setTableName(defaultProfile.tableName);
      setPrimaryKey(defaultProfile.primaryKey);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('eventLogProfiles', JSON.stringify(profiles));
  }, [profiles]);

  const handleProfileChange = (e) => {
    const profileKey = e.target.value;
    setSelectedProfile(profileKey);
    const profile = profiles.find(p => `${p.apiEndpoint}-${p.projectName}` === profileKey);
    if (profile) {
      setApiEndpoint(profile.apiEndpoint);
      setProjectName(profile.projectName);
      setAuthToken(profile.authToken);
      setTableName(profile.tableName);
      setPrimaryKey(profile.primaryKey);
    }
  };

  const handleSaveProfile = () => {
    const newProfile = {
      apiEndpoint,
      projectName,
      authToken,
      tableName,
      primaryKey
    };
    setProfiles([...profiles.filter(p => `${p.apiEndpoint}-${p.projectName}` !== selectedProfile), newProfile]);
    setSelectedProfile(`${apiEndpoint}-${projectName}`);
  };

  const fetchEventLogData = async () => {
    try {
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
      if (!response.ok) {
        throw new Error(`Error: ${response.status}: ${await response.text()}`);
      }
      const data = await response.json();
      setEventLogData(data.data.events);
      setError(null);
    } catch (err) {
      setError(err.message);
      setEventLogData([]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchEventLogData();
  };

  return (
    <div className="app-container">
      <h1>Contember Event Log Viewer</h1>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-group">
          <label>Profile:</label>
          <select value={selectedProfile} onChange={handleProfileChange}>
            {profiles.map(profile => (
              <option key={`${profile.apiEndpoint}-${profile.projectName}`} value={`${profile.apiEndpoint}-${profile.projectName}`}>
                {`${profile.apiEndpoint} - ${profile.projectName}`}
              </option>
            ))}
          </select>
        </div>
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
          <input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Table Name:</label>
          <input type="text" value={tableName} onChange={(e) => setTableName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Primary Key:</label>
          <input type="text" value={primaryKey} onChange={(e) => setPrimaryKey(e.target.value)} />
        </div>
        <div className="button-group">
          <button type="button" onClick={handleSaveProfile} className="save-button">Save Profile</button>
          <button type="submit" className="submit-button">Fetch Event Log</button>
        </div>
      </form>
      <EventLog data={eventLogData} />
    </div>
  );
};

export default App;
