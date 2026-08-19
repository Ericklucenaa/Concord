import React, { useRef, useEffect } from 'react';
import { useVoice } from '../context/VoiceContext';
import { useScreenShare } from '../context/ScreenShareContext';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { Maximize2, X, Radio, Volume2 } from 'lucide-react';

export default function MiniStreamPlayer() {
  const { user } = useAuth();
  const { activeVoiceChannel, joinVoice } = useVoice();
  const { activeChannel, setActiveChannel } = useServer();
  const { 
    isScreenSharing, 
    localScreenStream, 
    remoteScreenStreams, 
    activePresenter,
    setActivePresenter,
    stopScreenShare 
  } = useScreenShare();

  const videoRef = useRef(null);

  const isPresenter = isScreenSharing;
  const isViewer = Boolean(activePresenter && activePresenter.userId !== user?.id);
  const streamReady = isPresenter 
    ? Boolean(localScreenStream && localScreenStream.active) 
    : Boolean(activePresenter && remoteScreenStreams.has(activePresenter.userId));
  const hasStream = isPresenter || isViewer;

  // Only show mini player if we have an active stream BUT the user is currently viewing a text channel
  const isViewingTextChannel = activeChannel?.type === 'text';

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !hasStream || !isViewingTextChannel) return;

    let currentStream = null;
    if (isPresenter && localScreenStream) {
      currentStream = localScreenStream;
    } else if (activePresenter && remoteScreenStreams.has(activePresenter.userId)) {
      currentStream = remoteScreenStreams.get(activePresenter.userId);
    }

    if (currentStream && currentStream.active && currentStream.getVideoTracks().some((t) => t.readyState === 'live')) {
      videoEl.srcObject = currentStream;
      videoEl.play().catch(() => {});
    } else {
      videoEl.srcObject = null;
      try { videoEl.load(); } catch (e) {}
    }
  }, [hasStream, isViewingTextChannel, isPresenter, localScreenStream, activePresenter, remoteScreenStreams]);

  if (!hasStream || !isViewingTextChannel || !activeVoiceChannel) {
    return null;
  }

  const handleExpand = () => {
    setActiveChannel(activeVoiceChannel);
  };

  return (
    <div 
      className="mini-stream-player"
      style={{
        position: 'fixed',
        bottom: '80px',
        right: '260px',
        width: '280px',
        height: '160px',
        backgroundColor: '#06070a',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        animation: 'slideUp 0.2s ease',
        backdropFilter: 'blur(10px)'
      }}
      onClick={handleExpand}
      title="Clique para voltar para a transmissão"
    >
      {/* Video Stream Element */}
      {streamReady ? (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f111a' }}>
          <Radio size={28} style={{ color: 'var(--accent-primary)', animation: 'pulse 1.5s infinite' }} />
        </div>
      )}

      {/* Header Overlay */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '6px 10px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 2
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ 
            fontSize: 9, 
            fontWeight: 800, 
            backgroundColor: 'var(--accent-danger)', 
            color: '#fff', 
            padding: '1px 5px', 
            borderRadius: 3,
            boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)'
          }}>
            AO VIVO
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
            {isPresenter ? 'Sua Tela' : activePresenter?.username}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button 
            className="icon-btn"
            style={{ padding: 3, color: '#fff' }}
            onClick={(e) => {
              e.stopPropagation();
              handleExpand();
            }}
            title="Expandir Transmissão"
          >
            <Maximize2 size={13} />
          </button>
          <button 
            className="icon-btn"
            style={{ padding: 3, color: '#fff' }}
            onClick={(e) => {
              e.stopPropagation();
              if (isPresenter) {
                stopScreenShare();
              } else {
                setActivePresenter(null);
              }
            }}
            title="Ocultar Mini Player"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Footer Voice Room Info */}
      <div 
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '4px 10px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          color: 'rgba(255, 255, 255, 0.8)',
          zIndex: 2
        }}
      >
        <Volume2 size={11} style={{ color: 'var(--accent-success)' }} />
        <span>{activeVoiceChannel.name}</span>
      </div>
    </div>
  );
}
