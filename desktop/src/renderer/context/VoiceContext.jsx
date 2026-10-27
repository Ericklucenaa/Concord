import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useServer } from './ServerContext';
import { useNotification } from './NotificationContext';
import { getIceServers } from '../services/iceServers';
import {
  joinVoicePresence,
  updateVoicePresence,
  leaveVoicePresence,
  disconnectFromVoice,
  listenToServerVoice,
  listenToThreadVoice,
  sendVoiceSignal,
  listenToVoiceSignals,
  playSoundboard,
  listenToSoundboard,
  VOICE_HEARTBEAT_MS
} from '../services/cloud/voice';
import { soundSynthesizer } from '../services/soundEffects';
import { createDenoisedStream } from '../services/noiseSuppression';
import { createTempChannel, deleteTempChannel } from '../services/cloud/servers';
import { useSettings } from '../services/settings';
import { logWarn, quietly } from '../services/log';

const VoiceContext = createContext(null);

const SPEAKING_THRESHOLD = 14;
const STATS_INTERVAL_MS = 4000;
const CAMERA_MAX_BITRATE = 1_200_000;

/** Map key of a call: the server id, or `dm:<threadId>` for DM calls. */
function roomKey(channel) {
  return channel?.threadId ? `dm:${channel.threadId}` : channel?.serverId || null;
}

function videoTransceiver(pc) {
  return pc.getTransceivers().find((t) => t.receiver?.track?.kind === 'video');
}

function readBool(key) {
  return localStorage.getItem(key) !== 'false';
}

function qualityFrom(stats) {
  if (!stats) return 'unknown';
  const { rtt = 0, loss = 0 } = stats;
  if (rtt < 150 && loss < 2) return 'good';
  if (rtt < 300 && loss < 8) return 'ok';
  return 'bad';
}

/** Presence document -> the participant shape the UI uses. */
function toParticipant(p) {
  return {
    userId: p.userId,
    username: p.username,
    avatar: p.avatar,
    isMuted: Boolean(p.isMuted),
    isDeafened: Boolean(p.isDeafened),
    isScreenSharing: Boolean(p.isScreenSharing),
    isCameraOn: Boolean(p.isCameraOn),
    channelId: p.channelId,
    serverId: p.serverId
  };
}

export function VoiceProvider({ children }) {
  const { showError, showToast } = useNotification();
  const { user } = useAuth();
  const { activeServer, servers, tempChannels } = useServer();
  const [settings] = useSettings();
  const userId = user?.id;

  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null); // channel + serverId
  const [voiceByServer, setVoiceByServer] = useState(new Map()); // serverId -> Map<channelId, presence[]>
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const [remoteSpeaking, setRemoteSpeaking] = useState(new Set());
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [connectionStats, setConnectionStats] = useState(new Map()); // userId -> { rtt, loss }
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [localCameraStream, setLocalCameraStream] = useState(null);
  const [remoteVideos, setRemoteVideos] = useState(new Map()); // userId -> MediaStream (camera)
  const [aiNoiseSuppression, setAiNoiseSuppression] = useState(() => localStorage.getItem('concord_ai_noise') !== 'false');
  const cameraTrackRef = useRef(null);
  const rawMicRef = useRef(null);
  const denoiseRef = useRef(null);

  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState(() => localStorage.getItem('concord_input_device') || '');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState(() => localStorage.getItem('concord_output_device') || '');
  const [userVolumes, setUserVolumes] = useState(() => {
    try {
      return new Map(Object.entries(JSON.parse(localStorage.getItem('concord_user_volumes') || '{}')));
    } catch {
      return new Map();
    }
  });

  const [noiseSuppression, setNoiseSuppression] = useState(() => readBool('concord_noise_suppression'));
  const [echoCancellation, setEchoCancellation] = useState(() => readBool('concord_echo_cancellation'));
  const [autoGainControl, setAutoGainControl] = useState(() => readBool('concord_auto_gain'));
  const [noiseGateEnabled, setNoiseGateEnabled] = useState(() => readBool('concord_noise_gate'));
  const [automaticSensitivity, setAutomaticSensitivity] = useState(() => readBool('concord_auto_sensitivity'));
  const [noiseGateThreshold, setNoiseGateThreshold] = useState(() => parseInt(localStorage.getItem('concord_sensitivity_threshold') || '18', 10));

  // Refs mirror state for use inside audio callbacks / async signaling.
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // userId -> RTCPeerConnection
  const iceQueuesRef = useRef(new Map());
  const remoteNodesRef = useRef(new Map()); // userId -> { audioEl, source, gain, analyser }
  const outputCtxRef = useRef(null);
  const inputCtxRef = useRef(null);
  const animFrameRef = useRef(null);
  const hangoverRef = useRef({ timer: null, open: false });
  const activeRef = useRef(null);
  const leavingRef = useRef(false);
  const seenSelfRef = useRef(false);
  const lastStatsRef = useRef(new Map());
  const flags = useRef({});
  flags.current = {
    isMuted,
    isDeafened,
    noiseGateEnabled,
    automaticSensitivity,
    noiseGateThreshold,
    voiceMode: settings.voiceMode,
    isPttPressed,
    userVolumes
  };
  activeRef.current = activeVoiceChannel;

  const voiceServerId = activeVoiceChannel?.serverId || null;
  const voiceServer = useMemo(() => servers.find((s) => s.id === voiceServerId) || null, [servers, voiceServerId]);
  const isServerMuted = Boolean(userId && voiceServer?.mutedIds?.includes(userId));
  flags.current.isServerMuted = isServerMuted;

  // ---------------------------------------------------------------------------
  // Devices
  // ---------------------------------------------------------------------------

  const refreshAudioDevices = useCallback(async (requestPermission = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
    try {
      if (requestPermission) {
        const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
        temp.getTracks().forEach((t) => t.stop());
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId).map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || (i === 0 ? 'Microfone Padrão do Sistema' : `Microfone ${i + 1}`),
        groupId: d.groupId
      }));
      const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId).map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || (i === 0 ? 'Alto-falante / Fone Padrão' : `Saída de Áudio ${i + 1}`),
        groupId: d.groupId
      }));
      setInputDevices(inputs);
      setOutputDevices(outputs);
      return { inputs, outputs };
    } catch (err) {
      logWarn('enumerate devices', err);
      return { inputs: [], outputs: [] };
    }
  }, []);

  useEffect(() => {
    refreshAudioDevices();
    const onChange = () => refreshAudioDevices(false);
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, [refreshAudioDevices]);

  useEffect(() => {
    localStorage.setItem('concord_input_device', selectedInputDevice || '');
  }, [selectedInputDevice]);

  useEffect(() => {
    localStorage.setItem('concord_output_device', selectedOutputDevice || '');
    const ctx = outputCtxRef.current;
    if (ctx?.setSinkId) {
      ctx.setSinkId(selectedOutputDevice || '').catch((err) => logWarn('output device', err));
    }
  }, [selectedOutputDevice]);

  // ---------------------------------------------------------------------------
  // Local microphone: noise gate, push-to-talk and speaking detection
  // ---------------------------------------------------------------------------

  const shouldTransmit = (speakingNow) => {
    const f = flags.current;
    if (f.isMuted || f.isDeafened || f.isServerMuted) return false;
    if (f.voiceMode === 'ptt') return f.isPttPressed;
    return f.noiseGateEnabled ? speakingNow : true;
  };

  const applyTransmitState = (speakingNow) => {
    const transmit = shouldTransmit(speakingNow);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = transmit;
    });
    return transmit;
  };

  const stopSpeakingDetector = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    inputCtxRef.current?.close().catch(() => {});
    inputCtxRef.current = null;
    setIsSpeaking(false);
    setMicVolumeLevel(0);
  };

  const startSpeakingDetector = (stream) => {
    stopSpeakingDetector();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    // High-pass at 85 Hz cuts fan rumble and desk bumps before level detection.
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(85, ctx.currentTime);
    ctx.createMediaStreamSource(stream).connect(filter);
    filter.connect(analyser);
    inputCtxRef.current = ctx;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      const f = flags.current;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = f.isMuted ? 0 : Math.min(100, Math.round((sum / data.length / 128) * 100));
      setMicVolumeLevel(level);

      const threshold = f.automaticSensitivity ? SPEAKING_THRESHOLD : f.noiseGateThreshold;
      if (level >= threshold) {
        hangoverRef.current.open = true;
        clearTimeout(hangoverRef.current.timer);
        hangoverRef.current.timer = null;
      } else if (hangoverRef.current.open && !hangoverRef.current.timer) {
        // 220 ms release keeps sentence endings from being clipped.
        hangoverRef.current.timer = setTimeout(() => {
          hangoverRef.current.open = false;
          hangoverRef.current.timer = null;
        }, 220);
      }

      const transmitting = applyTransmitState(hangoverRef.current.open);
      const speakingNow = transmitting && (f.voiceMode === 'ptt' ? level >= SPEAKING_THRESHOLD || hangoverRef.current.open : hangoverRef.current.open);
      setIsSpeaking((prev) => (prev === speakingNow ? prev : speakingNow));
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const ensureLocalStream = async (force = false) => {
    const existing = localStreamRef.current;
    if (!force && existing?.getAudioTracks()[0]?.readyState === 'live') return existing;
    existing?.getTracks().forEach((t) => t.stop());
    rawMicRef.current?.getTracks().forEach((t) => t.stop());
    denoiseRef.current?.dispose();
    denoiseRef.current = null;
    localStreamRef.current = null;

    try {
      const raw = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputDevice ? { ideal: selectedInputDevice } : undefined,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
          channelCount: 1,
          sampleRate: 48000
        },
        video: false
      });
      rawMicRef.current = raw;
      let stream = raw;
      if (aiNoiseSuppression) {
        try {
          denoiseRef.current = await createDenoisedStream(raw);
          stream = denoiseRef.current.stream;
        } catch (err) {
          logWarn('ai noise suppression', err);
        }
      }
      localStreamRef.current = stream;
      applyTransmitState(false);
      startSpeakingDetector(stream);

      const track = stream.getAudioTracks()[0];
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) sender.replaceTrack(track).catch((err) => logWarn('replace track', err));
        else pc.addTrack(track, stream);
      });
      return stream;
    } catch (err) {
      logWarn('microphone', err);
      showError('Microfone indisponível', 'Não foi possível acessar o microfone. Verifique as permissões do sistema.');
      return null;
    }
  };

  // Re-capture the mic when processing options or the input device change.
  const restartMicIfActive = () => {
    if (activeRef.current) ensureLocalStream(true);
  };

  const persistToggle = (setter, key) => (val) => {
    setter(val);
    localStorage.setItem(key, String(val));
  };
  const updateNoiseGateEnabled = persistToggle(setNoiseGateEnabled, 'concord_noise_gate');
  const updateAutomaticSensitivity = persistToggle(setAutomaticSensitivity, 'concord_auto_sensitivity');
  const updateNoiseGateThreshold = persistToggle(setNoiseGateThreshold, 'concord_sensitivity_threshold');
  const updateNoiseSuppression = (val) => { persistToggle(setNoiseSuppression, 'concord_noise_suppression')(val); };
  const updateEchoCancellation = (val) => { persistToggle(setEchoCancellation, 'concord_echo_cancellation')(val); };
  const updateAutoGainControl = (val) => { persistToggle(setAutoGainControl, 'concord_auto_gain')(val); };
  const updateAiNoiseSuppression = (val) => { persistToggle(setAiNoiseSuppression, 'concord_ai_noise')(val); };

  useEffect(() => {
    restartMicIfActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseSuppression, echoCancellation, autoGainControl, selectedInputDevice, aiNoiseSuppression]);

  // ---------------------------------------------------------------------------
  // Remote audio: Web Audio graph per peer (volume up to 200%, speaking detection)
  // ---------------------------------------------------------------------------

  const getOutputCtx = () => {
    if (!outputCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      outputCtxRef.current = new AudioCtx();
      if (selectedOutputDevice && outputCtxRef.current.setSinkId) {
        outputCtxRef.current.setSinkId(selectedOutputDevice).catch((err) => logWarn('output device', err));
      }
    }
    if (outputCtxRef.current.state === 'suspended') outputCtxRef.current.resume().catch(() => {});
    return outputCtxRef.current;
  };

  const volumeFor = (id) => {
    const v = flags.current.userVolumes.get(id);
    return v === undefined ? 1 : Number(v);
  };

  const attachRemoteStream = (remoteUserId, stream) => {
    const existing = remoteNodesRef.current.get(remoteUserId);
    if (existing?.stream === stream) return;
    detachRemote(remoteUserId);

    // Chromium only feeds remote WebRTC audio into Web Audio when the stream
    // is also attached to a media element, so keep a muted one around.
    const audioEl = document.createElement('audio');
    audioEl.muted = true;
    audioEl.autoplay = true;
    audioEl.srcObject = stream;
    audioEl.play().catch(() => {});

    const ctx = getOutputCtx();
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = flags.current.isDeafened ? 0 : volumeFor(remoteUserId);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.connect(analyser);
    remoteNodesRef.current.set(remoteUserId, { stream, audioEl, source, gain, analyser });
  };

  function detachRemote(remoteUserId) {
    const nodes = remoteNodesRef.current.get(remoteUserId);
    if (!nodes) return;
    try {
      nodes.source.disconnect();
      nodes.gain.disconnect();
    } catch (err) {
      logWarn('detach audio', err);
    }
    nodes.audioEl.srcObject = null;
    remoteNodesRef.current.delete(remoteUserId);
  }

  // Poll remote analysers to light up whoever is talking.
  useEffect(() => {
    if (!activeVoiceChannel) {
      setRemoteSpeaking(new Set());
      return undefined;
    }
    const data = new Uint8Array(128);
    const timer = setInterval(() => {
      const speaking = new Set();
      remoteNodesRef.current.forEach((nodes, id) => {
        nodes.analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        if ((sum / data.length / 128) * 100 >= SPEAKING_THRESHOLD) speaking.add(id);
      });
      setRemoteSpeaking((prev) => {
        if (prev.size === speaking.size && [...speaking].every((id) => prev.has(id))) return prev;
        return speaking;
      });
    }, 150);
    return () => clearInterval(timer);
  }, [activeVoiceChannel]);

  // ---------------------------------------------------------------------------
  // Peer connections (mesh)
  // ---------------------------------------------------------------------------

  const closePeer = (remoteUserId) => {
    const pc = peersRef.current.get(remoteUserId);
    clearTimeout(pc?.__restartTimer);
    pc?.close();
    peersRef.current.delete(remoteUserId);
    iceQueuesRef.current.delete(remoteUserId);
    lastStatsRef.current.delete(remoteUserId);
    detachRemote(remoteUserId);
    setRemoteVideos((prev) => {
      if (!prev.has(remoteUserId)) return prev;
      const next = new Map(prev);
      next.delete(remoteUserId);
      return next;
    });
  };

  /** Puts my camera (or nothing) on the video sender of a peer connection. */
  const attachCamera = (pc) => {
    const transceiver = videoTransceiver(pc);
    if (!transceiver) return;
    transceiver.direction = 'sendrecv';
    transceiver.sender.replaceTrack(cameraTrackRef.current || null).catch((err) => logWarn('camera track', err));
    try {
      const params = transceiver.sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = CAMERA_MAX_BITRATE;
      transceiver.sender.setParameters(params).catch(() => {});
    } catch {
      // Parameters are only available once negotiated; the default bitrate is fine.
    }
  };

  // Initiator only: renegotiate the same connection with new ICE candidates.
  const restartIce = async (remoteUserId, channelId) => {
    const pc = peersRef.current.get(remoteUserId);
    if (!pc || pc.signalingState !== 'stable') return;
    try {
      pc.restartIce();
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await sendVoiceSignal(channelId, userId, remoteUserId, 'offer', { type: offer.type, sdp: offer.sdp, session: pc.__session });
    } catch (err) {
      logWarn('ice restart', err);
    }
  };

  const createPeer = (remoteUserId, channelId, { initiator = false } = {}) => {
    if (peersRef.current.has(remoteUserId)) return peersRef.current.get(remoteUserId);
    const pc = new RTCPeerConnection({ iceServers: getIceServers(), iceCandidatePoolSize: 4 });
    pc.__session = Math.random().toString(36).slice(2);
    const stream = localStreamRef.current;
    stream?.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
    // A video slot exists from the start, so turning the camera on or off
    // later is a track swap and never needs renegotiation.
    if (initiator) {
      pc.addTransceiver('video', { direction: 'sendrecv' });
      attachCamera(pc);
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      quietly('send candidate', sendVoiceSignal(channelId, userId, remoteUserId, 'candidate', event.candidate.toJSON()));
    };
    pc.ontrack = (event) => {
      if (event.track.kind === 'video') {
        const videoStream = new MediaStream([event.track]);
        setRemoteVideos((prev) => new Map(prev).set(remoteUserId, videoStream));
        return;
      }
      attachRemoteStream(remoteUserId, event.streams[0] || new MediaStream([event.track]));
    };
    // Network hiccups: the initiator restarts ICE on the same connection;
    // if that does not recover it, the connection is rebuilt from scratch.
    pc.oniceconnectionstatechange = () => {
      const isInitiator = String(userId) < String(remoteUserId);
      if (!isInitiator || activeRef.current?.id !== channelId) return;
      const state = pc.iceConnectionState;
      if (state === 'disconnected' || state === 'failed') {
        clearTimeout(pc.__restartTimer);
        pc.__restartTimer = setTimeout(() => {
          if (['disconnected', 'failed'].includes(pc.iceConnectionState)) restartIce(remoteUserId, channelId);
          pc.__restartTimer = setTimeout(() => {
            if (['disconnected', 'failed'].includes(pc.iceConnectionState) && activeRef.current?.id === channelId) {
              closePeer(remoteUserId);
              initiateOffer(remoteUserId, channelId);
            }
          }, 15_000);
        }, state === 'failed' ? 0 : 3000);
      } else if (state === 'connected' || state === 'completed') {
        clearTimeout(pc.__restartTimer);
      }
    };
    peersRef.current.set(remoteUserId, pc);
    return pc;
  };

  const drainIce = async (remoteUserId, pc) => {
    const queue = iceQueuesRef.current.get(remoteUserId) || [];
    iceQueuesRef.current.delete(remoteUserId);
    for (const c of queue) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch((err) => logWarn('queued ice', err));
    }
  };

  async function initiateOffer(remoteUserId, channelId) {
    if (!remoteUserId || remoteUserId === userId || peersRef.current.has(remoteUserId)) return;
    try {
      await ensureLocalStream();
      const pc = createPeer(remoteUserId, channelId, { initiator: true });
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await sendVoiceSignal(channelId, userId, remoteUserId, 'offer', { type: offer.type, sdp: offer.sdp, session: pc.__session });
    } catch (err) {
      logWarn('voice offer', err);
    }
  }

  const handleSignal = async (sig) => {
    const active = activeRef.current;
    if (!active || sig.channelId !== active.id || sig.senderId === userId) return;
    const from = sig.senderId;
    try {
      if (sig.type === 'offer') {
        // Same session = ICE restart/renegotiation on the existing connection.
        // A new session means the other side rebuilt its connection.
        const existing = peersRef.current.get(from);
        let pc = existing;
        if (!existing || existing.__remoteSession !== sig.data.session) {
          closePeer(from);
          await ensureLocalStream();
          pc = createPeer(from, active.id);
          pc.__remoteSession = sig.data.session;
        }
        await pc.setRemoteDescription(new RTCSessionDescription({ type: sig.data.type, sdp: sig.data.sdp }));
        attachCamera(pc);
        await drainIce(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendVoiceSignal(active.id, userId, from, 'answer', { type: answer.type, sdp: answer.sdp });
      } else if (sig.type === 'answer') {
        const pc = peersRef.current.get(from);
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: sig.data.type, sdp: sig.data.sdp }));
          await drainIce(from, pc);
        }
      } else if (sig.type === 'candidate') {
        const pc = peersRef.current.get(from);
        if (pc?.remoteDescription?.type) {
          await pc.addIceCandidate(new RTCIceCandidate(sig.data));
        } else {
          if (!iceQueuesRef.current.has(from)) iceQueuesRef.current.set(from, []);
          iceQueuesRef.current.get(from).push(sig.data);
        }
      }
    } catch (err) {
      logWarn(`voice signal ${sig.type}`, err);
    }
  };
  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;

  useEffect(() => {
    if (!activeVoiceChannel?.id || !userId) return undefined;
    return listenToVoiceSignals(userId, (sig) => handleSignalRef.current(sig));
  }, [activeVoiceChannel?.id, userId]);

  // ---------------------------------------------------------------------------
  // Voice presence for the visible server and the server I'm connected to
  // ---------------------------------------------------------------------------

  const voiceRoomKey = roomKey(activeVoiceChannel);
  const watchedRooms = useMemo(
    () => Array.from(new Set([activeServer?.id, voiceRoomKey].filter(Boolean))).sort().join(','),
    [activeServer?.id, voiceRoomKey]
  );

  useEffect(() => {
    if (!watchedRooms || !userId) {
      setVoiceByServer(new Map());
      return undefined;
    }
    const unsubs = watchedRooms.split(',').map((key) => {
      const store = (byChannel) => setVoiceByServer((prev) => new Map(prev).set(key, byChannel));
      return key.startsWith('dm:') ? listenToThreadVoice(key.slice(3), store) : listenToServerVoice(key, store);
    });
    return () => unsubs.forEach((u) => u());
  }, [watchedRooms, userId]);

  const voiceByServerRef = useRef(voiceByServer);
  voiceByServerRef.current = voiceByServer;

  const currentParticipants = useMemo(() => {
    if (!activeVoiceChannel) return [];
    return (voiceByServer.get(voiceRoomKey)?.get(activeVoiceChannel.id) || []).map(toParticipant);
  }, [voiceByServer, activeVoiceChannel, voiceRoomKey]);

  // Connect to newcomers, drop peers who left, and notice if I was disconnected.
  const participantKey = currentParticipants.map((p) => p.userId).sort().join(',');
  useEffect(() => {
    const active = activeRef.current;
    if (!active || !userId) return;
    const ids = participantKey ? participantKey.split(',') : [];

    if (ids.includes(userId)) {
      seenSelfRef.current = true;
    } else if (seenSelfRef.current && !leavingRef.current) {
      seenSelfRef.current = false;
      teardown();
      showToast('Você foi desconectado do canal de voz.', 'warning');
      return;
    }

    ids.forEach((id) => {
      if (id !== userId && String(userId) < String(id) && !peersRef.current.has(id)) initiateOffer(id, active.id);
    });
    Array.from(peersRef.current.keys()).forEach((id) => {
      if (!ids.includes(id)) closePeer(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantKey, userId]);

  // Heartbeat so a crashed client disappears from the room.
  useEffect(() => {
    if (!activeVoiceChannel?.id || !userId) return undefined;
    const timer = setInterval(() => quietly('voice heartbeat', updateVoicePresence(userId, {})), VOICE_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [activeVoiceChannel?.id, userId]);

  // ---------------------------------------------------------------------------
  // Connection quality
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!activeVoiceChannel) {
      setConnectionStats(new Map());
      return undefined;
    }
    const timer = setInterval(async () => {
      const next = new Map();
      for (const [id, pc] of peersRef.current) {
        try {
          const report = await pc.getStats();
          let rtt = null;
          let lost = 0;
          let received = 0;
          let jitter = null;
          report.forEach((s) => {
            if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.currentRoundTripTime !== undefined) {
              rtt = Math.round(s.currentRoundTripTime * 1000);
            }
            if (s.type === 'inbound-rtp' && s.kind === 'audio') {
              lost += s.packetsLost || 0;
              received += s.packetsReceived || 0;
              if (typeof s.jitter === 'number') jitter = Math.round(s.jitter * 1000);
            }
          });
          const prev = lastStatsRef.current.get(id) || { lost: 0, received: 0 };
          const dLost = Math.max(0, lost - prev.lost);
          const dReceived = Math.max(0, received - prev.received);
          lastStatsRef.current.set(id, { lost, received });
          const loss = dLost + dReceived > 0 ? Math.round((dLost / (dLost + dReceived)) * 1000) / 10 : 0;
          next.set(id, { rtt, loss, jitter, state: pc.connectionState });
        } catch (err) {
          logWarn('voice stats', err);
        }
      }
      setConnectionStats(next);
    }, STATS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeVoiceChannel]);

  const connectionQuality = useMemo(() => {
    if (!activeVoiceChannel) return 'unknown';
    if (connectionStats.size === 0) return currentParticipants.length > 1 ? 'connecting' : 'good';
    const order = ['good', 'ok', 'bad'];
    let worst = 'good';
    connectionStats.forEach((s) => {
      const q = s.state === 'connected' ? qualityFrom(s) : 'bad';
      if (order.indexOf(q) > order.indexOf(worst)) worst = q;
    });
    return worst;
  }, [connectionStats, activeVoiceChannel, currentParticipants.length]);

  const averagePing = useMemo(() => {
    const values = Array.from(connectionStats.values()).map((s) => s.rtt).filter((v) => v !== null);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  }, [connectionStats]);

  // ---------------------------------------------------------------------------
  // Join / leave
  // ---------------------------------------------------------------------------

  function teardown() {
    stopSpeakingDetector();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    rawMicRef.current?.getTracks().forEach((t) => t.stop());
    rawMicRef.current = null;
    denoiseRef.current?.dispose();
    denoiseRef.current = null;
    cameraTrackRef.current = null;
    setRemoteVideos(new Map());
    Array.from(peersRef.current.keys()).forEach(closePeer);
    outputCtxRef.current?.close().catch(() => {});
    outputCtxRef.current = null;
    localCameraStream?.getTracks().forEach((t) => t.stop());
    setLocalCameraStream(null);
    setIsCameraOn(false);
    seenSelfRef.current = false;
    setActiveVoiceChannel(null);
  }

  const leaveVoice = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    // The last person out of an auto-created room removes it.
    const others = (voiceByServerRef.current.get(roomKey(active))?.get(active.id) || []).filter((p) => p.userId !== userId);
    if (active.temporary && others.length === 0) quietly('delete temp room', deleteTempChannel(active.id));
    leavingRef.current = true;
    quietly('leave voice', leaveVoicePresence(userId));
    teardown();
    setTimeout(() => {
      leavingRef.current = false;
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /**
   * Joins a server voice channel, a lobby ("create room" channel, which
   * spawns a temporary room) or a DM call ({ id, name, threadId }).
   */
  const joinVoice = async (requested) => {
    if (!requested || !user) return;
    let channel = requested;
    const serverId = channel.threadId ? null : channel.serverId || activeServer?.id;
    if (!serverId && !channel.threadId) return;
    if (channel.isLobby) {
      try {
        channel = { ...(await createTempChannel(serverId, channel, user)), serverId };
      } catch (err) {
        logWarn('create temp room', err);
        showError('Sala temporária', 'Não foi possível criar sua sala.');
        return;
      }
    }
    if (activeRef.current?.id === channel.id) return;
    if (activeRef.current) {
      Array.from(peersRef.current.keys()).forEach(closePeer);
      seenSelfRef.current = false;
    }

    const stream = await ensureLocalStream();
    if (!stream) return;
    getOutputCtx();

    const target = { ...channel, serverId };
    activeRef.current = target;
    setActiveVoiceChannel(target);
    leavingRef.current = true;
    try {
      const room = channel.threadId
        ? { threadId: channel.threadId, channelId: channel.id }
        : { serverId, channelId: channel.id };
      await joinVoicePresence(user, room, { isMuted, isDeafened });
    } catch (err) {
      logWarn('join voice', err);
      showError('Erro na voz', 'Não foi possível entrar no canal de voz.');
      teardown();
    } finally {
      setTimeout(() => {
        leavingRef.current = false;
      }, 1500);
    }
  };

  // Leave voice when signing out or closing the window.
  useEffect(() => {
    const onExit = () => {
      if (activeRef.current && userId) leaveVoicePresence(userId).catch(() => {});
    };
    window.addEventListener('beforeunload', onExit);
    window.addEventListener('concord:before-logout', onExit);
    return () => {
      window.removeEventListener('beforeunload', onExit);
      window.removeEventListener('concord:before-logout', onExit);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId && activeRef.current) teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ---------------------------------------------------------------------------
  // Mute / deafen / volumes / push-to-talk
  // ---------------------------------------------------------------------------

  const publishState = (fields) => {
    if (activeRef.current && userId) quietly('voice state', updateVoicePresence(userId, fields));
  };

  const toggleMute = () => {
    if (isServerMuted && isMuted) {
      showToast('Um moderador silenciou você neste servidor.', 'warning');
      return;
    }
    const next = !isMuted;
    flags.current.isMuted = next;
    setIsMuted(next);
    if (!next && isDeafened) {
      flags.current.isDeafened = false;
      setIsDeafened(false);
      remoteNodesRef.current.forEach((n, id) => { n.gain.gain.value = volumeFor(id); });
    }
    applyTransmitState(hangoverRef.current.open);
    publishState({ isMuted: next, isDeafened: next ? isDeafened : false });
  };

  const toggleDeafen = () => {
    const next = !isDeafened;
    flags.current.isDeafened = next;
    setIsDeafened(next);
    if (next) {
      flags.current.isMuted = true;
      setIsMuted(true);
    }
    remoteNodesRef.current.forEach((n, id) => {
      n.gain.gain.value = next ? 0 : volumeFor(id);
    });
    applyTransmitState(false);
    publishState({ isDeafened: next, isMuted: next ? true : isMuted });
  };

  // A moderator's server mute applies immediately.
  useEffect(() => {
    if (isServerMuted && activeVoiceChannel && !isMuted) {
      flags.current.isMuted = true;
      setIsMuted(true);
      applyTransmitState(false);
      publishState({ isMuted: true });
      showToast('Um moderador silenciou você neste servidor.', 'warning');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServerMuted, activeVoiceChannel?.id]);

  const setUserVolume = (targetUserId, volume) => {
    const v = Math.max(0, Math.min(2, Number(volume)));
    setUserVolumes((prev) => {
      const next = new Map(prev);
      next.set(targetUserId, v);
      try {
        localStorage.setItem('concord_user_volumes', JSON.stringify(Object.fromEntries(next)));
      } catch (err) {
        logWarn('save volumes', err);
      }
      return next;
    });
    const nodes = remoteNodesRef.current.get(targetUserId);
    if (nodes) nodes.gain.gain.value = flags.current.isDeafened ? 0 : v;
  };

  useEffect(() => {
    if (settings.voiceMode !== 'ptt') {
      setIsPttPressed(false);
      return undefined;
    }
    const isEditable = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
    const onDown = (e) => {
      if (e.code === settings.pttKey && !e.repeat && !(isEditable(e.target) && e.code.startsWith('Key'))) setIsPttPressed(true);
    };
    const onUp = (e) => {
      if (e.code === settings.pttKey) setTimeout(() => setIsPttPressed(false), settings.pttReleaseDelayMs);
    };
    const onBlur = () => setIsPttPressed(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    // Desktop app: global key hook works while the window is in the background.
    const offGlobal = window.electronAPI?.onPushToTalk?.((pressed) => {
      if (pressed) setIsPttPressed(true);
      else setTimeout(() => setIsPttPressed(false), settings.pttReleaseDelayMs);
    });
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      offGlobal?.();
    };
  }, [settings.voiceMode, settings.pttKey, settings.pttReleaseDelayMs]);

  // Global shortcuts from the desktop app (work with the window in the background).
  const shortcutRef = useRef({});
  useEffect(() => window.electronAPI?.onGlobalShortcut?.((action) => {
    if (action === 'toggleMute') shortcutRef.current.toggleMute?.();
    if (action === 'toggleDeafen') shortcutRef.current.toggleDeafen?.();
    if (action === 'leaveVoice') shortcutRef.current.leaveVoice?.();
  }), []);

  useEffect(() => {
    flags.current.isPttPressed = isPttPressed;
    applyTransmitState(hangoverRef.current.open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPttPressed, settings.voiceMode]);

  // ---------------------------------------------------------------------------
  // Camera (local preview), moderation, soundboard
  // ---------------------------------------------------------------------------

  const toggleCamera = async () => {
    if (!activeVoiceChannel) {
      showError('Canal de Voz Necessário', 'Entre em um canal de voz para ligar a câmera.');
      return;
    }
    if (isCameraOn) {
      localCameraStream?.getTracks().forEach((t) => t.stop());
      cameraTrackRef.current = null;
      peersRef.current.forEach((pc) => attachCamera(pc));
      setLocalCameraStream(null);
      setIsCameraOn(false);
      publishState({ isCameraOn: false });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false
      });
      cameraTrackRef.current = stream.getVideoTracks()[0];
      peersRef.current.forEach((pc) => attachCamera(pc));
      setLocalCameraStream(stream);
      setIsCameraOn(true);
      publishState({ isCameraOn: true });
    } catch (err) {
      logWarn('camera', err);
      showError('Permissão de Câmera', 'Não foi possível acessar a webcam. Verifique as permissões de vídeo.');
    }
  };

  const kickUserFromVoice = async (_channelId, targetUserId) => {
    try {
      await disconnectFromVoice(targetUserId);
      showToast('Usuário desconectado da sala de voz.', 'info');
    } catch (err) {
      logWarn('disconnect user', err);
      showError('Sem permissão', 'Apenas moderadores podem desconectar outras pessoas.');
    }
  };

  const playSound = (soundId) => {
    if (!activeVoiceChannel?.serverId || !user) return;
    soundSynthesizer.play(soundId);
    quietly('soundboard', playSoundboard(activeVoiceChannel.serverId, activeVoiceChannel.id, user, soundId));
  };

  useEffect(() => {
    if (!activeVoiceChannel?.id || !activeVoiceChannel.serverId) return undefined;
    return listenToSoundboard(activeVoiceChannel.serverId, activeVoiceChannel.id, (data) => {
      if (data.userId !== userId && !flags.current.isDeafened) soundSynthesizer.play(data.soundId);
    });
  }, [activeVoiceChannel?.id, activeVoiceChannel?.serverId, userId]);

  // Empty auto-created rooms are removed (e.g. the last person crashed).
  useEffect(() => {
    const byChannel = voiceByServer.get(activeServer?.id);
    if (!byChannel) return;
    tempChannels.forEach((c) => {
      const occupied = (byChannel.get(c.id) || []).length > 0;
      if (!occupied && Date.now() - (c.createdAt || 0) > 60_000 && activeVoiceChannel?.id !== c.id) {
        quietly('cleanup temp room', deleteTempChannel(c.id));
      }
    });
  }, [tempChannels, voiceByServer, activeServer?.id, activeVoiceChannel?.id]);

  // ---------------------------------------------------------------------------
  // Derived participant lists
  // ---------------------------------------------------------------------------

  const voiceUsers = useMemo(() => currentParticipants.map((p) => {
    if (p.userId === userId) {
      return { ...p, isMuted, isDeafened, isSpeaking, isCameraOn };
    }
    return { ...p, isSpeaking: remoteSpeaking.has(p.userId) };
  }), [currentParticipants, userId, isMuted, isDeafened, isSpeaking, isCameraOn, remoteSpeaking]);

  const voiceChannelUsersMap = useMemo(() => {
    const byChannel = voiceByServer.get(activeServer?.id) || new Map();
    const out = new Map();
    byChannel.forEach((list, channelId) => {
      out.set(channelId, list.map((p) => {
        const participant = toParticipant(p);
        if (p.userId === userId) return { ...participant, isMuted, isDeafened, isSpeaking };
        return { ...participant, isSpeaking: activeVoiceChannel?.id === channelId && remoteSpeaking.has(p.userId) };
      }));
    });
    return out;
  }, [voiceByServer, activeServer?.id, userId, isMuted, isDeafened, isSpeaking, remoteSpeaking, activeVoiceChannel?.id]);

  shortcutRef.current = { toggleMute, toggleDeafen, leaveVoice };

  // In-game overlay (desktop): who is in the call and who is talking.
  const overlayKey = JSON.stringify([
    activeVoiceChannel?.name,
    voiceUsers.map((u) => [u.userId, u.username, u.isSpeaking, u.isMuted, u.isDeafened])
  ]);
  useEffect(() => {
    window.electronAPI?.updateOverlay?.(activeVoiceChannel
      ? {
          channel: activeVoiceChannel.name,
          users: voiceUsers.map((u) => ({
            id: u.userId, username: u.username, avatar: u.avatar, speaking: u.isSpeaking, muted: u.isMuted, deafened: u.isDeafened
          }))
        }
      : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey]);

  return (
    <VoiceContext.Provider
      value={{
        activeVoiceChannel,
        remoteVideos,
        aiNoiseSuppression,
        updateAiNoiseSuppression,
        voiceServer,
        voiceUsers,
        voiceChannelUsersMap,
        isMuted,
        isDeafened,
        isSpeaking,
        isServerMuted,
        micVolumeLevel,
        isPttPressed,
        voiceMode: settings.voiceMode,
        connectionStats,
        connectionQuality,
        averagePing,
        isCameraOn,
        localCameraStream,
        toggleCamera,
        joinVoice,
        leaveVoice,
        kickUserFromVoice,
        toggleMute,
        toggleDeafen,
        setUserVolume,
        userVolumes,
        playSound,
        publishVoiceState: publishState,
        localAudioStream: localStreamRef,
        inputDevices,
        outputDevices,
        selectedInputDevice,
        selectedOutputDevice,
        setSelectedInputDevice,
        setSelectedOutputDevice,
        refreshAudioDevices,
        noiseSuppression,
        echoCancellation,
        autoGainControl,
        noiseGateEnabled,
        automaticSensitivity,
        noiseGateThreshold,
        updateNoiseSuppression,
        updateEchoCancellation,
        updateAutoGainControl,
        updateNoiseGateEnabled,
        updateAutomaticSensitivity,
        updateNoiseGateThreshold
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  return useContext(VoiceContext);
}
