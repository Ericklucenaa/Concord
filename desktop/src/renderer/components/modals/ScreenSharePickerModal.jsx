import React, { useState, useEffect } from 'react';
import { useScreenShare } from '../../context/ScreenShareContext';
import { X, Tv, Monitor, AppWindow, Play } from 'lucide-react';

export default function ScreenSharePickerModal() {
  const { 
    isPickerOpen, 
    setIsPickerOpen, 
    startScreenShare, 
    screenQuality, 
    setScreenQuality, 
    screenFps, 
    setScreenFps 
  } = useScreenShare();

  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [activeTab, setActiveTab] = useState('screens'); // 'screens' or 'windows'
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isPickerOpen) return;

    let isMounted = true;
    async function loadSources() {
      setIsLoading(true);
      try {
        if (window.electronAPI?.getDesktopSources) {
          const rawSources = await window.electronAPI.getDesktopSources();
          if (isMounted) {
            setSources(rawSources);
            if (rawSources.length > 0) {
              setSelectedSourceId(rawSources[0].id);
            }
          }
        } else {
          // Web fallback
          setSources([
            { id: 'screen:0', name: 'Tela Principal (Navegador)', thumbnail: '' }
          ]);
          setSelectedSourceId('screen:0');
        }
      } catch (err) {
        console.error('Failed to get desktop sources:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadSources();
    return () => { isMounted = false; };
  }, [isPickerOpen]);

  if (!isPickerOpen) return null;

  const screens = sources.filter((s) => s.id.startsWith('screen:'));
  const windows = sources.filter((s) => s.id.startsWith('window:'));

  const displayedSources = activeTab === 'screens' 
    ? (screens.length > 0 ? screens : sources)
    : windows;

  const handleStart = () => {
    if (!selectedSourceId) return;
    startScreenShare(selectedSourceId);
  };

  return (
    <div className="modal-backdrop" onClick={() => setIsPickerOpen(false)}>
      <div className="modal-container" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tv size={20} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="modal-title">Compartilhar sua Tela</h3>
          </div>
          <button className="icon-btn" onClick={() => setIsPickerOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs: Screens vs Windows */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          <button 
            className={`btn ${activeTab === 'screens' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, borderRadius: 0, border: 'none' }}
            onClick={() => {
              setActiveTab('screens');
              if (screens.length > 0) setSelectedSourceId(screens[0].id);
            }}
          >
            <Monitor size={16} />
            Telas Inteiras ({screens.length || sources.length})
          </button>
          {windows.length > 0 && (
            <button 
              className={`btn ${activeTab === 'windows' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, borderRadius: 0, border: 'none' }}
              onClick={() => {
                setActiveTab('windows');
                if (windows.length > 0) setSelectedSourceId(windows[0].id);
              }}
            >
              <AppWindow size={16} />
              Janelas de Aplicativos ({windows.length})
            </button>
          )}
        </div>

        <div className="modal-body">
          {isLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
              Carregando telas e janelas disponíveis...
            </div>
          ) : (
            <div className="screen-sources-grid">
              {displayedSources.map((source) => {
                const isSelected = selectedSourceId === source.id;
                return (
                  <div
                    key={source.id}
                    className={`source-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedSourceId(source.id)}
                  >
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt={source.name} className="source-thumbnail" />
                    ) : (
                      <div className="source-thumbnail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Monitor size={32} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}
                    <span className="source-name" title={source.name}>{source.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quality & FPS Controls */}
          <div style={{ display: 'flex', gap: 14, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Qualidade do Vídeo</label>
              <select 
                className="form-select"
                value={screenQuality}
                onChange={(e) => setScreenQuality(e.target.value)}
              >
                <option value="auto">Automática (Adaptativa)</option>
                <option value="720p">720p (HD - Economia de banda)</option>
                <option value="1080p">1080p (Full HD - Alta fidelidade)</option>
              </select>
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Taxa de Quadros (FPS)</label>
              <select 
                className="form-select"
                value={screenFps}
                onChange={(e) => setScreenFps(Number(e.target.value))}
              >
                <option value={30}>30 FPS (Padrão)</option>
                <option value={60}>60 FPS (Ultra Suave / Jogos)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => setIsPickerOpen(false)}
          >
            Cancelar
          </button>
          <button 
            type="button" 
            className="btn btn-primary"
            disabled={!selectedSourceId}
            onClick={handleStart}
          >
            <Play size={16} />
            Iniciar Transmissão
          </button>
        </div>
      </div>
    </div>
  );
}
