import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import './styles/features.css';
import './styles/voice.css';

// Apply the saved theme before the first paint.
document.documentElement.setAttribute('data-theme', localStorage.getItem('concord_theme') || 'dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
