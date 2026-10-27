import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import './styles/features.css';
import './styles/voice.css';
import './styles/v12.css';

// Apply the saved theme before the first paint.
document.documentElement.setAttribute('data-theme', localStorage.getItem('concord_theme') || 'dark');

// The desktop overlay window loads this same bundle with #overlay and must not
// start Firebase, so each entry is loaded on demand.
const entry = window.location.hash === '#overlay' ? import('./OverlayApp') : import('./App');

entry.then(({ default: Root }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  );
});
