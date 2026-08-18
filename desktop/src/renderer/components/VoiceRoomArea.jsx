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
    setIsPickerOpen 
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

  const hasActiveStream = isScreenSharing || (activePresenter && remoteScreenStreams.has(activePresenter.userId));

  return (
    <div className="voice-stream-view" ref={containerRef}>
      {/* Stream Video Area (if sharing or watching screen) */}
      {hasActiveStream ? (
        <div className="stream-player-container">
          <video 
            ref={videoRef} 
            className="screen-video" 
            autoPlay 
            playsInline 
            muted={isScreenSharing} // mute self loopback
          />

          <div className="stream-overlay-badge">
            <span className="live-badge">AO VIVO</span>
            <span>{isScreenSharing ? 'Você está transmitindo' : `${activePresenter?.username} está transmitindo`}</span>
            <span style={{ opacity: 0.6, fontSize: 11 }}>({screenQuality} @ {screenFps}fps)</span>
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
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            {isScreenSharing && (
              <button 
                className="btn btn-danger" 
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={stopScreenShare}
              >
                Parar Transmissão
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
