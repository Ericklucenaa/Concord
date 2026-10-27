import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useVoice } from './VoiceContext';
import { useServer } from './ServerContext';
import { useNotification } from './NotificationContext';
import { sendScreenSignal, listenToScreenSignals } from '../services/cloud/voice';
import { getIceServers } from '../services/iceServers';
import { logWarn, quietly } from '../services/log';

const ScreenShareContext = createContext(null);

const DIMENSIONS = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 }
};

/**
 * Screen sharing over WebRTC. Viewers ask the presenter for the stream
 * ("viewer_ready"), so upload bandwidth is only spent on people who watch.
 * Signals carry `to: 'viewer' | 'presenter'` so one user can present and
 * watch someone else at the same time.
 */
export function ScreenShareProvider({ children }) {
  const { showError, showToast } = useNotification();
  const { user } = useAuth();
  const { activeServer, activeChannel, setActiveChannel } = useServer();
  const { activeVoiceChannel, voiceUsers, joinVoice, publishVoiceState } = useVoice();
  const userId = user?.id;

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState(new Map());
  const [screenQuality, setScreenQuality] = useState('1080p');
  const [screenFps, setScreenFps] = useState(30);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [watching, setWatching] = useState(null); // { userId, username }

  const localStreamRef = useRef(null);
  const toViewersRef = useRef(new Map()); // viewerId -> pc (I present)
  const fromPresenterRef = useRef(new Map()); // presenterId -> pc (I watch)
  const iceQueueRef = useRef(new Map()); // `${role}:${peerId}` -> candidates
  const channelRef = useRef(null);
  channelRef.current = activeVoiceChannel;

  const presenters = useMemo(() => voiceUsers.filter((u) => u.isScreenSharing), [voiceUsers]);

  // The presenter being shown: my own share, or the stream I chose to watch.
  const activePresenter = useMemo(() => {
    if (isScreenSharing) return { userId, username: user?.username, quality: screenQuality, fps: screenFps };
    return watching;
  }, [isScreenSharing, watching, userId, user?.username, screenQuality, screenFps]);

  const queueKey = (role, peerId) => `${role}:${peerId}`;

  const drainIce = async (role, peerId, pc) => {
    const key = queueKey(role, peerId);
    const queue = iceQueueRef.current.get(key) || [];
    iceQueueRef.current.delete(key);
    for (const c of queue) await pc.addIceCandidate(new RTCIceCandidate(c)).catch((err) => logWarn('screen ice', err));
  };

  const addIce = async (role, peerId, pc, candidate) => {
    if (pc?.remoteDescription?.type) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => logWarn('screen ice', err));
      return;
    }
    const key = queueKey(role, peerId);
    if (!iceQueueRef.current.has(key)) iceQueueRef.current.set(key, []);
    iceQueueRef.current.get(key).push(candidate);
  };

  const signal = (toUserId, type, data) => {
    const channelId = channelRef.current?.id;
    if (!channelId || !userId) return;
    quietly(`screen ${type}`, sendScreenSignal(channelId, userId, toUserId, type, data));
  };

  // --- Presenter side --------------------------------------------------------

  const offerToViewer = async (viewerId) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    toViewersRef.current.get(viewerId)?.close();
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    toViewersRef.current.set(viewerId, pc);

    stream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') {
        try {
          const params = sender.getParameters();
          if (!params.encodings?.length) params.encodings = [{}];
          params.encodings[0].maxBitrate = screenFps >= 60 ? 8_000_000 : 5_000_000;
          params.degradationPreference = 'maintain-resolution';
          sender.setParameters(params).catch((err) => logWarn('screen bitrate', err));
        } catch (err) {
          logWarn('screen encoder params', err);
        }
      }
    });

    pc.onicecandidate = (e) => e.candidate && signal(viewerId, 'candidate', { to: 'viewer', c: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) toViewersRef.current.delete(viewerId);
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal(viewerId, 'offer', { type: offer.type, sdp: offer.sdp });
  };

  const stopScreenShare = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalScreenStream(null);
    setIsScreenSharing(false);
    toViewersRef.current.forEach((pc, viewerId) => {
      signal(viewerId, 'screen_stopped', {});
      pc.close();
    });
    toViewersRef.current.clear();
    publishVoiceState({ isScreenSharing: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishVoiceState]);

  const captureScreen = async (sourceId) => {
    const { width, height } = DIMENSIONS[screenQuality] || DIMENSIONS['1080p'];
    const video = {
      width: { ideal: width, max: width },
      height: { ideal: height, max: height },
      frameRate: { ideal: screenFps, max: screenFps }
    };
    if (window.electronAPI?.selectScreenSource && sourceId) {
      // The main process answers getDisplayMedia with this source (and system
      // audio loopback on Windows when requested).
      await window.electronAPI.selectScreenSource({ sourceId, audio: includeAudio });
    }
    return navigator.mediaDevices.getDisplayMedia({
      video,
      audio: includeAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false
    });
  };

  const startScreenShare = async (sourceId) => {
    let voice = activeVoiceChannel;
    if (!voice) {
      const target = activeChannel?.type === 'voice'
        ? activeChannel
        : activeServer?.channels?.find((c) => c.type === 'voice');
      if (target) {
        await joinVoice(target);
        setActiveChannel?.(target);
        voice = target;
      }
    }
    if (!voice) {
      showError('Canal de Voz Necessário', 'Entre em um canal de voz para transmitir sua tela.');
      return;
    }

    try {
      const stream = await captureScreen(sourceId);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && 'contentHint' in videoTrack) videoTrack.contentHint = screenFps >= 60 ? 'motion' : 'detail';
      if (videoTrack) videoTrack.onended = () => stopScreenShare();

      localStreamRef.current = stream;
      setLocalScreenStream(stream);
      setIsScreenSharing(true);
      setIsPickerOpen(false);
      setWatching(null);
      publishVoiceState({ isScreenSharing: true });
      showToast(
        includeAudio && stream.getAudioTracks().length === 0
          ? 'Transmissão iniciada (o áudio do sistema não está disponível nesta fonte).'
          : 'Transmissão de tela iniciada!',
        'success'
      );
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') return;
      logWarn('start screen share', err);
      showError('Erro na Transmissão', 'Não foi possível iniciar o compartilhamento de tela.');
    }
  };

  // --- Viewer side -----------------------------------------------------------

  const clearRemote = useCallback((presenterId) => {
    fromPresenterRef.current.get(presenterId)?.close();
    fromPresenterRef.current.delete(presenterId);
    iceQueueRef.current.delete(`viewer:${presenterId}`);
    setRemoteScreenStreams((prev) => {
      if (!prev.has(presenterId)) return prev;
      const next = new Map(prev);
      next.delete(presenterId);
      return next;
    });
  }, []);

  const stopWatching = useCallback(() => {
    setWatching((current) => {
      if (current) clearRemote(current.userId);
      return null;
    });
  }, [clearRemote]);

  const watchStream = async (presenterUser, channel) => {
    if (!presenterUser?.userId || presenterUser.userId === userId) return;
    const target = channel || activeVoiceChannel;
    if (target && activeVoiceChannel?.id !== target.id) await joinVoice(target);
    if (target) setActiveChannel?.(target);
    if (watching?.userId && watching.userId !== presenterUser.userId) clearRemote(watching.userId);
    setWatching({ userId: presenterUser.userId, username: presenterUser.username, quality: screenQuality, fps: screenFps });
    setTimeout(() => signal(presenterUser.userId, 'viewer_ready', {}), 300);
  };

  // Compatibility with components that close the viewer with setActivePresenter(null).
  const setActivePresenter = (value) => {
    if (!value) stopWatching();
  };

  // --- Signal routing --------------------------------------------------------

  const handleSignal = async ({ fromUserId, type, data, channelId }) => {
    if (!channelRef.current || channelId !== channelRef.current.id) return;
    try {
      if (type === 'viewer_ready') {
        if (localStreamRef.current) await offerToViewer(fromUserId);
      } else if (type === 'answer') {
        const pc = toViewersRef.current.get(fromUserId);
        if (pc?.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          await drainIce('presenter', fromUserId, pc);
        }
      } else if (type === 'offer') {
        clearRemote(fromUserId);
        const pc = new RTCPeerConnection({ iceServers: getIceServers() });
        fromPresenterRef.current.set(fromUserId, pc);
        pc.onicecandidate = (e) => e.candidate && signal(fromUserId, 'candidate', { to: 'presenter', c: e.candidate.toJSON() });
        pc.ontrack = (e) => {
          const stream = e.streams[0];
          if (!stream) return;
          setRemoteScreenStreams((prev) => new Map(prev).set(fromUserId, stream));
        };
        pc.onconnectionstatechange = () => {
          if (['failed', 'closed'].includes(pc.connectionState)) clearRemote(fromUserId);
        };
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        await drainIce('viewer', fromUserId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal(fromUserId, 'answer', { type: answer.type, sdp: answer.sdp });
      } else if (type === 'candidate') {
        if (data?.to === 'viewer') {
          await addIce('viewer', fromUserId, fromPresenterRef.current.get(fromUserId), data.c);
        } else if (data?.to === 'presenter') {
          await addIce('presenter', fromUserId, toViewersRef.current.get(fromUserId), data.c);
        }
      } else if (type === 'screen_stopped') {
        clearRemote(fromUserId);
        setWatching((current) => (current?.userId === fromUserId ? null : current));
      }
    } catch (err) {
      logWarn(`screen signal ${type}`, err);
    }
  };
  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;

  useEffect(() => {
    if (!userId || !activeVoiceChannel?.id) return undefined;
    return listenToScreenSignals(userId, (sig) => handleSignalRef.current(sig));
  }, [userId, activeVoiceChannel?.id]);

  // Presenter stopped or left the room: drop the stream I was watching.
  useEffect(() => {
    if (watching && !presenters.some((p) => p.userId === watching.userId)) {
      const timer = setTimeout(() => {
        clearRemote(watching.userId);
        setWatching(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [watching, presenters, clearRemote]);

  // Viewers who left the room no longer need my stream.
  useEffect(() => {
    const ids = new Set(voiceUsers.map((u) => u.userId));
    toViewersRef.current.forEach((pc, viewerId) => {
      if (!ids.has(viewerId)) {
        pc.close();
        toViewersRef.current.delete(viewerId);
      }
    });
  }, [voiceUsers]);

  // Leaving voice ends sharing and watching.
  useEffect(() => {
    if (activeVoiceChannel) return;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalScreenStream(null);
      setIsScreenSharing(false);
    }
    toViewersRef.current.forEach((pc) => pc.close());
    toViewersRef.current.clear();
    fromPresenterRef.current.forEach((pc) => pc.close());
    fromPresenterRef.current.clear();
    setRemoteScreenStreams(new Map());
    setWatching(null);
  }, [activeVoiceChannel]);

  return (
    <ScreenShareContext.Provider
      value={{
        isScreenSharing,
        localScreenStream,
        remoteScreenStreams,
        screenQuality,
        screenFps,
        includeAudio,
        isPickerOpen,
        activePresenter,
        presenters,
        setScreenQuality,
        setScreenFps,
        setIncludeAudio,
        setIsPickerOpen,
        startScreenShare,
        stopScreenShare,
        watchStream,
        stopWatching,
        setActivePresenter
      }}
    >
      {children}
    </ScreenShareContext.Provider>
  );
}

export function useScreenShare() {
  return useContext(ScreenShareContext);
}
