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
  Settings2
} from 'lucide-react';

export default function VoiceRoomArea() {
  const { user } = useAuth();
  const { 
    activeVoiceChannel, 
    voiceUsers, 
    isSpeaking, 
    isMuted,
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

  // Attach active video stream (local or remote) to video element
  useEffect(() => {
    if (!videoRef.current) return;

    if (isScreenSharing && localScreenStream) {
      videoRef.current.srcObject = localScreenStream;
      videoRef.current.play().catch((e) => console.warn('Local screen video play:', e));
    } else if (activePresenter && remoteScreenStreams.has(activePresenter.userId)) {
      const stream = remoteScreenStreams.get(activePresenter.userId);
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((e) => console.warn('Remote screen video play:', e));
    } else {
      videoRef.current.srcObject = null;
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

  const isViewer = Boolean(activePresenter && activePresenter.userId !== user?.id);
  const streamReady = isScreenSharing ? Boolean(localScreenStream) : (activePresenter && remoteScreenStreams.has(activePresenter.userId));
  const hasActiveStream = isScreenSharing || isViewer;

  return (
    <div className="voice-stream-view" ref={containerRef}>
      {/* Stream Video Area (if sharing or watching screen) */}
      {hasActiveStream ? (
        <div className="stream-player-container" style={{ position: 'relative', width: '100%', height: '100%', minHeight: 360, backgroundColor: '#090a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {streamReady ? (
            <video 
              ref={videoRef} 
              className="screen-video" 
              autoPlay 
              playsInline 
              muted={isScreenSharing}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center' }}>
              <Radio size={48} style={{ color: 'var(--accent-primary)', animation: 'pulse 1.5s infinite' }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Conectando à transmissão de {activePresenter?.username || 'apresentador'}...
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 360 }}>
                Aguardando canal de vídeo WebRTC em tempo real ({screenQuality} @ {screenFps}fps).
              </div>
            </div>
          )}

          <div className="stream-overlay-badge" style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0, 0, 0, 0.65)', padding: '6px 12px', borderRadius: 'var(--radius-full)', backdropFilter: 'blur(8px)', zIndex: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: 'var(--accent-danger)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>
              <Radio size={12} />
              AO VIVO
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
              {isScreenSharing ? 'Você está transmitindo' : `${activePresenter?.username} está transmitindo`}
            </span>
            <span style={{ opacity: 0.6, fontSize: 11, color: '#fff' }}>({screenQuality} @ {screenFps}fps)</span>
          </div>

          <div 
            style={{
              position: 'absolute',
              bottom: 24,
              right: 24,
              display: 'flex',
              gap: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              zIndex: 10
            }}
          >
            {isScreenSharing && (
              <button 
                className="btn btn-danger" 
                style={{ padding: '4px 12px', fontSize: 12 }}
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

            <button 
              className="icon-btn" 
              onClick={toggleFullscreen} 
              title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
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

          <button 
            className="btn btn-primary"
            onClick={() => setIsPickerOpen(true)}
            style={{ marginTop: 8 }}
          >
            <Tv size={16} />
            Transmitir Minha Tela
          </button>
        </div>
      )}

      {/* Voice Participants Grid */}
      <div className="voice-grid">
        {voiceUsers.map((u) => {
          const isMe = u.userId === user?.id;
          const speaking = isMe ? isSpeaking : u.isSpeaking;
          const muted = isMe ? isMuted : u.isMuted;

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
              <span className="name">{u.username} {isMe ? '(Você)' : ''}</span>

              <div className="voice-card-status">
                {muted && <MicOff size={14} style={{ color: 'var(--accent-danger)' }} />}
                {u.isScreenSharing && (
                  <span style={{ fontSize: 9, backgroundColor: 'var(--accent-danger)', color: '#fff', padding: '1px 4px', borderRadius: 3, fontWeight: 800 }}>LIVE</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
