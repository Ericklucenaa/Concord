import React, { useEffect, useRef, useState } from 'react';
import {
  Tv,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Radio,
  PictureInPicture2,
  Sparkles,
  Video,
  VideoOff,
  Headphones,
  HeadphoneOff,
  PhoneOff,
  Volume2,
  Signal,
  UserX,
  Eye,
  EyeOff
} from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useScreenShare } from '../context/ScreenShareContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import SoundboardModal from './SoundboardModal';
import { isModerator } from '../services/permissions';
import { defaultAvatar } from '../services/cloud/util';
import { logWarn } from '../services/log';

const QUALITY_LABEL = {
  good: 'Conexão estável',
  ok: 'Conexão instável',
  bad: 'Conexão ruim',
  connecting: 'Conectando…',
  unknown: 'Conectado'
};

function CameraVideo({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className="voice-tile-video" />;
}

function ParticipantTile({ participant, isMe, compact, canModerate, onKick, onWatch, cameraStream }) {
  const showCamera = isMe && cameraStream;
  return (
    <div className={`voice-tile ${participant.isSpeaking ? 'speaking' : ''} ${compact ? 'compact' : ''}`}>
      <div className="voice-tile-backdrop" style={{ backgroundImage: `url("${participant.avatar || defaultAvatar(participant.username)}")` }} />
      {showCamera ? (
        <CameraVideo stream={cameraStream} />
      ) : (
        <div className="voice-tile-avatar-wrap">
          <img src={participant.avatar || defaultAvatar(participant.username)} alt="" className="voice-tile-avatar" />
        </div>
      )}

      {participant.isScreenSharing && (
        <div className="voice-tile-live">
          <span className="live-badge"><Radio size={10} /> AO VIVO</span>
          {!isMe && onWatch && (
            <button className="voice-tile-watch" onClick={() => onWatch(participant)}>
              <Eye size={13} /> Assistir
            </button>
          )}
        </div>
      )}

      {canModerate && !isMe && (
        <button className="voice-tile-kick" onClick={() => onKick(participant)} title="Desconectar do canal">
          <UserX size={14} />
        </button>
      )}

      <div className="voice-tile-name">
        {participant.isMuted && <MicOff size={13} className="danger" />}
        {participant.isDeafened && <HeadphoneOff size={13} className="danger" />}
        <span>{participant.username}{isMe ? ' (você)' : ''}</span>
      </div>
    </div>
  );
}

export default function VoiceRoomArea() {
  const { showConfirm } = useNotification();
  const { user } = useAuth();
  const {
    activeVoiceChannel,
    voiceServer,
    voiceUsers,
    isMuted,
    isDeafened,
    isCameraOn,
    localCameraStream,
    toggleCamera,
    toggleMute,
    toggleDeafen,
    leaveVoice,
    kickUserFromVoice,
    connectionQuality,
    averagePing
  } = useVoice();
  const {
    isScreenSharing,
    localScreenStream,
    remoteScreenStreams,
    activePresenter,
    screenQuality,
    screenFps,
    stopScreenShare,
    setIsPickerOpen,
    stopWatching,
    watchStream
  } = useScreenShare();

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSoundboardOpen, setIsSoundboardOpen] = useState(false);

  const isViewer = Boolean(activePresenter && activePresenter.userId !== user?.id);
  const streamReady = isScreenSharing
    ? Boolean(localScreenStream?.active)
    : Boolean(activePresenter && remoteScreenStreams.has(activePresenter.userId));
  const hasActiveStream = isScreenSharing || isViewer;
  const canModerate = isModerator(voiceServer, user?.id);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const stream = isScreenSharing ? localScreenStream : remoteScreenStreams.get(activePresenter?.userId);
    if (stream?.active && stream.getVideoTracks().some((t) => t.readyState === 'live')) {
      videoEl.srcObject = stream;
      videoEl.play().catch((err) => logWarn('screen video play', err));
    } else {
      videoEl.srcObject = null;
    }
  }, [isScreenSharing, localScreenStream, activePresenter, remoteScreenStreams, streamReady]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch((err) => logWarn('fullscreen', err));
    else document.exitFullscreen().catch((err) => logWarn('fullscreen', err));
  };

  const togglePictureInPicture = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current?.requestPictureInPicture();
    } catch (err) {
      logWarn('picture-in-picture', err);
    }
  };

  const kick = async (participant) => {
    const confirmed = await showConfirm('Desconectar usuário', `Desconectar @${participant.username} do canal de voz?`, { isDanger: true, confirmText: 'Desconectar' });
    if (confirmed && activeVoiceChannel) kickUserFromVoice(activeVoiceChannel.id, participant.userId);
  };

  const tiles = voiceUsers.map((u) => (
    <ParticipantTile
      key={u.userId}
      participant={u}
      isMe={u.userId === user?.id}
      compact={hasActiveStream}
      canModerate={canModerate}
      onKick={kick}
      onWatch={(p) => watchStream(p, activeVoiceChannel)}
      cameraStream={u.userId === user?.id && isCameraOn ? localCameraStream : null}
    />
  ));

  return (
    <div className="voice-stream-view" ref={containerRef}>
      <header className="chat-header voice-header">
        <div className="chat-header-info">
          <Volume2 size={20} className="muted-icon" />
          <span className="chat-header-title">{activeVoiceChannel?.name}</span>
          <span className="chat-header-desc">
            {voiceUsers.length} {voiceUsers.length === 1 ? 'pessoa' : 'pessoas'} na sala
          </span>
        </div>
        <div className={`quality-chip ${connectionQuality}`} title={averagePing !== null ? `Latência média: ${averagePing} ms` : undefined}>
          <Signal size={13} />
          {QUALITY_LABEL[connectionQuality]}
          {averagePing !== null && <span className="quality-ping">{averagePing} ms</span>}
        </div>
      </header>

      {hasActiveStream ? (
        <div className="voice-stage with-stream">
          <div className="stream-frame">
            {streamReady ? (
              <video ref={videoRef} className="screen-video" autoPlay playsInline muted={isScreenSharing} />
            ) : (
              <div className="stream-waiting">
                <div className="pulse-ring"><Radio size={28} /></div>
                <strong>Conectando à transmissão de {activePresenter?.username || 'apresentador'}…</strong>
                <span>{screenQuality} • {screenFps} FPS</span>
              </div>
            )}
            <div className="stream-overlay-badge">
              <span className="live-badge">AO VIVO</span>
              {isScreenSharing ? 'Você está transmitindo' : `${activePresenter?.username} está transmitindo`}
            </div>
            <div className="stream-tools">
              {streamReady && document.pictureInPictureEnabled && (
                <button className="icon-btn" onClick={togglePictureInPicture} title="Janela flutuante">
                  <PictureInPicture2 size={17} />
                </button>
              )}
              {isViewer && (
                <button className="icon-btn" onClick={stopWatching} title="Parar de assistir">
                  <EyeOff size={17} />
                </button>
              )}
              <button className="icon-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
                {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            </div>
          </div>
          <div className="voice-filmstrip">{tiles}</div>
        </div>
      ) : (
        <div className="voice-stage">
          <div className={`voice-grid count-${Math.min(voiceUsers.length, 9)}`}>{tiles}</div>
        </div>
      )}

      <div className="voice-dock">
        <button className={`dock-btn ${isMuted ? 'off' : ''}`} onClick={toggleMute} title={isMuted ? 'Ativar microfone' : 'Silenciar microfone'}>
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button className={`dock-btn ${isDeafened ? 'off' : ''}`} onClick={toggleDeafen} title={isDeafened ? 'Ativar áudio' : 'Desativar áudio'}>
          {isDeafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
        </button>
        <button className={`dock-btn ${isCameraOn ? 'on' : ''}`} onClick={toggleCamera} title={isCameraOn ? 'Desligar câmera' : 'Ligar câmera'}>
          {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        <button
          className={`dock-btn ${isScreenSharing ? 'on' : ''}`}
          onClick={() => (isScreenSharing ? stopScreenShare() : setIsPickerOpen(true))}
          title={isScreenSharing ? 'Parar transmissão' : 'Transmitir tela'}
        >
          <Tv size={20} />
        </button>
        <button className="dock-btn" onClick={() => setIsSoundboardOpen(true)} title="Soundboard">
          <Sparkles size={20} />
        </button>
        <span className="dock-divider" />
        <button className="dock-btn leave" onClick={leaveVoice} title="Sair da chamada">
          <PhoneOff size={20} />
        </button>
      </div>

      <SoundboardModal isOpen={isSoundboardOpen} onClose={() => setIsSoundboardOpen(false)} />
    </div>
  );
}
