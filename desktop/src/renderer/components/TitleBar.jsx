import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Radio, Heart } from 'lucide-react';

const DONATE_URL = 'https://ko-fi.com/ericklucena';

export default function TitleBar() {
  const [isMax, setIsMax] = useState(false);
  const isElectron = Boolean(window.electronAPI?.isElectron);

  useEffect(() => {
    if (isElectron && window.electronAPI.isMaximized) {
      window.electronAPI.isMaximized().then(setIsMax);
    }
  }, [isElectron]);

  const handleMinimize = () => {
    if (isElectron) window.electronAPI.minimizeWindow();
  };

  const handleMaximize = async () => {
    if (isElectron) {
      await window.electronAPI.maximizeWindow();
      const state = await window.electronAPI.isMaximized();
      setIsMax(state);
    }
  };

  const handleClose = () => {
    if (isElectron) window.electronAPI.closeWindow();
  };

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <Radio className="titlebar-logo" />
        <span>CONCORD</span>
      </div>

      <div className="titlebar-actions">
        {/* target=_blank: the Electron window-open handler sends it to the default browser. */}
        <a
          className="titlebar-donate"
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="O Concord é grátis. Apoie o projeto no Ko-fi"
        >
          <Heart size={13} />
          <span>Apoiar</span>
        </a>

        {isElectron && (
          <div className="titlebar-controls">
            <button className="titlebar-btn" onClick={handleMinimize} title="Minimizar">
              <Minus size={14} />
            </button>
            <button className="titlebar-btn" onClick={handleMaximize} title={isMax ? 'Restaurar' : 'Maximizar'}>
              <Square size={12} />
            </button>
            <button className="titlebar-btn close" onClick={handleClose} title="Fechar">
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
