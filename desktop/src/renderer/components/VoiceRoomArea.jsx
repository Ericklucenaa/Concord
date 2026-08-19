import React, { useEffect, useRef, useState } from 'react';
import { useVoice } from '../context/VoiceContext';
import { useScreenShare } from '../context/ScreenShareContext';
import { useAuth } from '../context/AuthContext';
import { 
  Tv, 
  Maximize2, 
  Minimize2, 
  MicOff, 
  Radio, 
  Volume2, 
  VolumeX,
  Sliders,
  Settings2,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import SoundboardModal from './SoundboardModal';

export default function VoiceRoomArea() {
  const { user } = useAuth();
  const { 
    activeVoiceChannel, 
    voiceUsers, 
    isSpeaking, 
    isMuted,
    isDeafened,
    setUserVolume 
  } = useVoice();
  const { 
    isScreenSharing, 
    localScreenStream, 
    remoteScreenStreams, 
    activePresenter, 
    screenQuality, 
    screenFps, 
    setScreenQuality, 
    setScreenFps, 
    stopScreenShare, 
    setIsPickerOpen,
    setActivePresenter 
  } = useScreenShare();

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [isSoundboardOpen, setIsSoundboardOpen] = useState(false);

  // Attach active video stream (local or remote) to video element
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    let currentStream = null;
    if (isScreenSharing && localScreenStream) {
      currentStream = localScreenStream;
    } else if (activePresenter && remoteScreenStreams.has(activePresenter.userId)) {
      currentStream = remoteScreenStreams.get(activePresenter.userId);
    }

    if (currentStream && currentStream.active && currentStream.getVideoTracks().some((t) => t.readyState === 'live')) {
      videoEl.srcObject = currentStream;
      videoEl.play().catch((e) => console.warn('Screen video play:', e));
    } else {
      videoEl.srcObject = null;
      try { videoEl.load(); } catch (e) {}
    }
  }, [isScreenSharing, localScreenStream, activePresenter, remoteScreenStreams]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const togglePictureInPicture = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {}
  };

  const isViewer = Boolean(activePresenter && activePresenter.userId !== user?.id);
  const streamReady = isScreenSharing 
    ? Boolean(localScreenStream && localScreenStream.active) 
    : Boolean(activePresenter && remoteScreenStreams.has(activePresenter.userId));
  const hasActiveStream = isScreenSharing || isViewer;

  return (
    <div className="voice-stream-view" ref={containerRef}>
      {/* Stream Video Area (if sharing or watching screen) */}
      {hasActiveStream ? (
        <div className="stream-player-container" style={{ position: 'relative', width: '100%', height: '100%', minHeight: 380, backgroundColor: '#06070a', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {streamReady ? (
            <video 
              ref={videoRef} 
              className="screen-video" 
              autoPlay 
              playsInline 
              muted={isScreenSharing}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain',
                imageRendering: '-webkit-optimize-contrast',
                borderRadius: 'var(--radius-md)'
              }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, textAlign: 'center' }}>
              <Radio size={52} style={{ color: 'var(--accent-primary)', animation: 'pulse 1.5s infinite' }} />
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                Conectando à transmissão de {activePresenter?.username || 'apresentador'}...
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 400, lineHeight: 1.5 }}>
                Estabelecendo canal direto WebRTC P2P em alta definição ({screenQuality} @ {screenFps}fps).
              </div>
            </div>
          )}

          <div className="stream-overlay-badge" style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0, 0, 0, 0.7)', padding: '6px 14px', borderRadius: 'var(--radius-full)', backdropFilter: 'blur(10px)', zIndex: 10, border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: 'var(--accent-danger)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.5px', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }}>
              <Radio size={12} />
              AO VIVO
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              {isScreenSharing ? 'Você está transmitindo' : `${activePresenter?.username} está transmitindo`}
            </span>
            <span style={{ opacity: 0.7, fontSize: 11, color: '#fff', fontFamily: 'var(--font-mono)' }}>({screenQuality} @ {screenFps}fps)</span>
          </div>

          <div 
            style={{
              position: 'absolute',
              bottom: 20,
              right: 20,
              display: 'flex',
              gap: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              zIndex: 10
            }}
          >
            {isScreenSharing && (
              <button 
                className="btn btn-danger" 
                style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700 }}
                onClick={stopScreenShare}
              >
                Parar Transmissão
              </button>
            )}

            {isViewer && (
              <button 
                className="btn btn-secondary" 
                style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => setActivePresenter(null)}
              >
                Ocultar Stream
              </button>
            )}

            {streamReady && document.pictureInPictureEnabled && (
              <button 
                className="icon-btn" 
                onClick={togglePictureInPicture} 
                title="Modo Picture-in-Picture (Janela Flutuante)"
                style={{ padding: '6px' }}
              >
                <ExternalLink size={16} />
              </button>
            )}

            <button 
              className="icon-btn" 
              onClick={() => setIsSoundboardOpen(true)} 
              title="Abrir Soundboard"
              style={{ padding: '6px', color: 'var(--accent-warning)' }}
            >
              <Sparkles size={16} />
            </button>

            <button 
              className="icon-btn" 
              onClick={toggleFullscreen} 
              title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
              style={{ padding: '6px' }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Radio size={48} style={{ color: 'var(--accent-primary)', opacity: 0.8 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Canal de Voz: {activeVoiceChannel?.name}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Você está conectado. Fale livremente ou compartilhe sua tela com o grupo.
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button 
              className="btn btn-primary"
              onClick={() => setIsPickerOpen(true)}
            >
              <Tv size={16} />
              Transmitir Minha Tela
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => setIsSoundboardOpen(true)}
            >
              <Sparkles size={16} style={{ color: 'var(--accent-warning)' }} />
              Soundboard
            </button>
          </div>
        </div>
      )}

      {/* Voice Participants Grid */}
      <div className="voice-grid">
        {voiceUsers.map((u) => {
          const isMe = u.userId === user?.id;
          const speaking = isMe ? isSpeaking : u.isSpeaking;
          const muted = isMe ? isMuted : u.isMuted;
          const deafened = isMe ? isDeafened : u.isDeafened;

          return (
            <div 
              key={u.userId} 
              className={`voice-card ${speaking ? 'speaking' : ''}`}
            >
              <img 
                src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`} 
                alt="" 
                className="avatar" 
              />
              <span className="name">{u.username}</span>

              <div className="voice-card-status" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {muted && <MicOff size={14} style={{ color: 'var(--accent-danger)' }} title="Microfone Desativado" />}
                {deafened && <Headphones size={14} style={{ color: 'var(--accent-danger)' }} title="Áudio Desativado" />}
                {u.isScreenSharing && (
                  <span style={{ fontSize: 9, backgroundColor: 'var(--accent-danger)', color: '#fff', padding: '1px 4px', borderRadius: 3, fontWeight: 800 }}>LIVE</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Soundboard Modal */}
      <SoundboardModal 
        isOpen={isSoundboardOpen} 
        onClose={() => setIsSoundboardOpen(false)} 
      />
    </div>
  );
}
