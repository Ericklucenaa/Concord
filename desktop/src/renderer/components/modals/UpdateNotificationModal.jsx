import React, { useState, useEffect } from 'react';
import { Sparkles, Download, RefreshCw, X, CheckCircle2, ArrowRight } from 'lucide-react';
import { listenToAppVersionInCloud, getLatestAppVersionFromCloud } from '../../services/cloudSync';

export const CURRENT_APP_VERSION = '1.0.0';

// Helper to compare semver versions (e.g. 1.0.1 > 1.0.0)
function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const parse = (v) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);

  if (lMaj > cMaj) return true;
  if (lMaj === cMaj && lMin > cMin) return true;
  if (lMaj === cMaj && lMin === cMin && lPat > cPat) return true;
  return false;
}

export default function UpdateNotificationModal() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);

  // Check version on startup and listen for live broadcasts
  useEffect(() => {
    let isMounted = true;

    const checkVersion = async () => {
      try {
        // 1. Try fetching from cloud Firestore
        let latestData = await getLatestAppVersionFromCloud();

        // 2. Fallback to public version.json
        if (!latestData) {
          try {
            const res = await fetch('/version.json?t=' + Date.now());
            if (res.ok) {
              latestData = await res.json();
            }
          } catch (e) {}
        }

        if (latestData && isMounted) {
          handleIncomingVersion(latestData);
        }
      } catch (err) {}
    };

    checkVersion();

    // 3. Realtime listener from Cloud Firestore
    const unsubscribe = listenToAppVersionInCloud((cloudData) => {
      if (cloudData && isMounted) {
        handleIncomingVersion(cloudData);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleIncomingVersion = (info) => {
    if (!info || !info.version) return;

    const hasNewUpdate = isNewerVersion(info.version, CURRENT_APP_VERSION);
    if (hasNewUpdate) {
      const dismissedVer = sessionStorage.getItem('concord_dismissed_update');
      if (dismissedVer !== info.version || info.isMandatory) {
        setUpdateInfo(info);
        setIsOpen(true);
      }
    }
  };

  const handleDismiss = () => {
    if (updateInfo?.version) {
      sessionStorage.setItem('concord_dismissed_update', updateInfo.version);
    }
    setIsOpen(false);
  };

  const handleApplyUpdate = () => {
    setIsUpdating(true);

    if (isElectron) {
      // Desktop: Open download link or GitHub releases page
      const targetUrl = updateInfo?.downloadUrl || 'https://github.com/Ericklucenaa/Concord/releases/latest';
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(targetUrl);
      } else {
        window.open(targetUrl, '_blank');
      }
      setTimeout(() => {
        setIsUpdating(false);
        setIsOpen(false);
      }, 1000);
    } else {
      // Web: Clear service workers / cache and reload immediately
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((reg) => reg.unregister());
          });
        }
        if ('caches' in window) {
          caches.keys().then((names) => {
            names.forEach((name) => caches.delete(name));
          });
        }
      } catch (e) {}

      setTimeout(() => {
        window.location.reload(true);
      }, 500);
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
          {!updateInfo.isMandatory && (
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
            Nova Versão Disponível!
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span style={{ backgroundColor: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
              v{CURRENT_APP_VERSION}
            </span>
            <ArrowRight size={14} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 700, padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
              v{updateInfo.version}
            </span>
          </div>
        </div>

        {/* Body with Release Notes */}
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

          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {isElectron 
              ? '💡 Ao clicar em Atualizar, o novo instalador atualizado (.exe) será baixado para o seu computador.' 
              : '💡 A aplicação será recarregada instantaneamente com a versão mais recente.'}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            {!updateInfo.isMandatory && (
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
              {isElectron ? (
                <>
                  <Download size={16} />
                  {isUpdating ? 'Abrindo...' : 'Baixar Atualização'}
                </>
              ) : (
                <>
                  <RefreshCw size={16} className={isUpdating ? 'spin' : ''} />
                  {isUpdating ? 'Atualizando...' : 'Atualizar Agora'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
