// Full-page request history: all tabs, or one tab when opened with ?tabId=.
import React from 'react';
import ReactDOM from 'react-dom';
import '../../src/App.css';
import './ui/inspector.css';
import { Inspector } from './ui/Inspector';

const param = new URLSearchParams(window.location.search).get('tabId');
const tabId = param ? Number(param) : null;
ReactDOM.render(
  <Inspector mode="page" tabId={tabId} onReloadTab={tabId != null ? () => chrome.tabs.reload(tabId) : null} />,
  document.getElementById('root'),
);
