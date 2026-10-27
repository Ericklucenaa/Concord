import React, { useState, useEffect } from 'react';
import { Sparkles, Download, RefreshCw, X, ArrowRight } from 'lucide-react';
import { listenToAppVersion, getLatestAppVersion, compareVersions } from '../../services/cloud/version';
import { logWarn } from '../../services/log';

const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

export default function UpdateNotificationModal() {
  return isElectron ? <UpdateNotifier /> : null;
}

function UpdateNotifier() {
  const [currentVersion, setCurrentVersion] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    window.electronAPI.getAppVersion?.().then(setCurrentVersion).catch((err) => logWarn('app version', err));
  }, []);

  // Check the published manifest on startup and listen for new releases.
  useEffect(() => {
    if (!currentVersion) return undefined;
    let isMounted = true;

    const handleIncomingVersion = (info) => {
      if (!isMounted || !info?.version || compareVersions(info.version, currentVersion) <= 0) return;
      const dismissed = sessionStorage.getItem('concord_dismissed_update');
      if (dismissed !== info.version || info.isMandatory) {
        setUpdateInfo(info);
        setIsOpen(true);
      }
    };

    (async () => {
      let latest = await getLatestAppVersion();
      if (!latest) {
        try {
          const res = await fetch(`https://concord-3af70.web.app/version.json?t=${Date.now()}`);
          if (res.ok) latest = await res.json();
        } catch (err) {
          logWarn('version.json', err);
        }
      }
      handleIncomingVersion(latest);
    })();

    const unsubscribe = listenToAppVersion(handleIncomingVersion);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [currentVersion]);

  const handleDismiss = () => {
    if (updateInfo?.version) {
      sessionStorage.setItem('concord_dismissed_update', updateInfo.version);
    }
    setIsOpen(false);
  };

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    setStatusText('Iniciando download da atualização...');
    setDownloadProgress(5);

    try {
      if (window.electronAPI?.onUpdateProgress) {
        window.electronAPI.onUpdateProgress((prog) => {
          if (prog?.percent !== undefined) {
            setDownloadProgress(prog.percent);
            setStatusText(`Baixando atualização... ${prog.percent}%`);
          }
        });
      }

      if (window.electronAPI?.downloadAndInstallUpdate) {
        setStatusText('Baixando nova versão...');
        const res = await window.electronAPI.downloadAndInstallUpdate({
          downloadUrl: updateInfo?.downloadUrl,
          version: updateInfo?.version,
          sha256: updateInfo?.sha256
        });

        if (res && res.success) {
          setStatusText('Atualização pronta! Reiniciando aplicativo...');
          setDownloadProgress(100);
        } else {
          // The main process opens the official releases page when it cannot install.
          setStatusText(res?.error ? `${res.error} Abrimos a página oficial de downloads.` : 'Abrimos a página oficial de downloads.');
          setTimeout(() => setIsOpen(false), 2000);
        }
      } else {
        const targetUrl = updateInfo?.downloadUrl || 'https://github.com/Ericklucenaa/Concord/releases/latest';
        if (window.electronAPI?.openExternal) {
          window.electronAPI.openExternal(targetUrl);
        } else {
          window.open(targetUrl, '_blank');
        }
        setTimeout(() => setIsOpen(false), 1500);
      }
    } catch (err) {
      console.error('Update error:', err);
      setStatusText('Erro ao atualizar automaticamente. Abrindo página de download...');
      const targetUrl = updateInfo?.downloadUrl || 'https://github.com/Ericklucenaa/Concord/releases/latest';
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(targetUrl);
      }
    }
  };

  if (!isOpen || !updateInfo) return null;

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999 }}>
      <div 
        className="modal-container" 
        style={{ 
          width: 480, 
          padding: 0, 
          overflow: 'hidden', 
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)', 
          border: '1px solid var(--accent-primary)' 
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Visual Banner */}
        <div 
          style={{ 
            backgroundColor: 'var(--bg-tertiary)', 
            padding: '24px 20px', 
            textAlign: 'center', 
            borderBottom: '1px solid var(--border-color)',
            position: 'relative'
          }}
        >
          {!updateInfo.isMandatory && !isUpdating && (
            <button 
              className="icon-btn" 
              onClick={handleDismiss} 
              style={{ position: 'absolute', right: 12, top: 12 }}
              title="Fechar"
            >
              <X size={18} />
            </button>
          )}

          <div 
            style={{ 
              width: 52, 
              height: 52, 
              borderRadius: '50%', 
              backgroundColor: 'rgba(99, 102, 241, 0.15)', 
              color: 'var(--accent-primary)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 12px auto' 
            }}
          >
            <Sparkles size={28} />
          </div>

          <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
            Nova Versão do Concord Disponível!
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span style={{ backgroundColor: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
              v{currentVersion}
            </span>
            <ArrowRight size={14} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 700, padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
              v{updateInfo.version}
            </span>
          </div>
        </div>

        {/* Body with Release Notes & Progress Bar */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
              Novidades da Atualização
            </div>
            <div 
              style={{ 
                backgroundColor: 'var(--bg-tertiary)', 
                padding: '12px 14px', 
                borderRadius: 'var(--radius-md)', 
                fontSize: 13, 
                lineHeight: 1.5, 
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                maxHeight: 120,
                overflowY: 'auto'
              }}
            >
              {updateInfo.releaseNotes || 'Melhorias gerais de estabilidade, áudio e novos recursos.'}
            </div>
          </div>

          {/* Download & Installation Progress */}
          {isUpdating ? (
            <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{statusText || 'Atualizando aplicativo...'}</span>
                <strong style={{ color: 'var(--accent-primary)' }}>{downloadProgress}%</strong>
              </div>
              <div style={{ width: '100%', height: 8, backgroundColor: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${downloadProgress}%`, 
                    backgroundColor: 'var(--accent-primary)', 
                    transition: 'width 0.3s ease',
                    borderRadius: 4
                  }} 
                />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              💡 O Concord baixará e instalará a nova versão automaticamente no seu computador.
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {!updateInfo.isMandatory && !isUpdating && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
                onClick={handleDismiss}
              >
                Lembrar Mais Tarde
              </button>
            )}

            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ flex: 1.5, padding: '10px 0', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onClick={handleApplyUpdate}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  Atualizando...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Atualizar Automaticamente
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
