// DevTools panel: the inspector for the inspected tab, themed like DevTools.
import React from 'react';
import ReactDOM from 'react-dom';
import '../../src/App.css';
import './ui/inspector.css';
import { Inspector } from './ui/Inspector';

const applyTheme = (name) => {
  document.documentElement.dataset.theme = name === 'dark' ? 'dark' : 'light';
};
applyTheme(chrome.devtools.panels.themeName);
if (chrome.devtools.panels.setThemeChangeHandler) chrome.devtools.panels.setThemeChangeHandler(applyTheme);

const tabId = chrome.devtools.inspectedWindow.tabId;
ReactDOM.render(
  <Inspector mode="panel" tabId={tabId} onReloadTab={() => chrome.devtools.inspectedWindow.reload()} />,
  document.getElementById('root'),
);
