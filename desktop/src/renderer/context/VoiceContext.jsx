import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useServer } from './ServerContext';
import { api } from '../services/api';
import { SOCKET_EVENTS, DEFAULT_ICE_SERVERS } from '@shared/constants';
import { 
  joinVoiceInCloud, 
  leaveVoiceInCloud, 
  switchVoiceRoomInCloud, 
  listenToVoiceRoomInCloud, 
  listenToSoundboardInCloud,
  updateVoiceUserStateInCloud,
  sendVoiceSignalInCloud,
  listenToVoiceSignalsInCloud,
  sendVoiceHeartbeatInCloud,
  kickUserFromVoiceInCloud,
  setUserPresenceInCloud
} from '../services/cloudSync';
import { soundSynthesizer } from '../services/soundEffects';
import { useNotification } from './NotificationContext';

const VoiceContext = createContext(null);

export function VoiceProvider({ children }) {
  const { showError, showToast } = useNotification();
  const { socket } = useSocket();
  const { user } = useAuth();
  const { activeServer, serverMembers } = useServer();

  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null);
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [voiceChannelUsersMap, setVoiceChannelUsersMap] = useState(new Map()); // Map<channelId, User[]>
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [localCameraStream, setLocalCameraStream] = useState(null);

  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState('');
  const [userVolumes, setUserVolumes] = useState(new Map());

  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // Map<userId, RTCPeerConnection>
  const remoteAudiosRef = useRef(new Map()); // Map<userId, HTMLAudioElement>
  const iceCandidateQueuesRef = useRef(new Map()); // Map<userId, RTCIceCandidateInit[]>
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const isMutedRef = useRef(false);
  const isDeafenedRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isDeafenedRef.current = isDeafened;
  }, [isDeafened]);

  // Load ICE servers from backend on init
  useEffect(() => {
    async function loadIceConfig() {
      try {
        if (api.hasBackend()) {
          const config = await api.getWebRTCConfig();
          if (config.iceServers && config.iceServers.length > 0) {
            iceServersRef.current = config.iceServers;
          }
        }
      } catch (err) {}
    }
    loadIceConfig();
  }, []);

  // Enumerate & Validate Real Audio Devices
  const refreshAudioDevices = useCallback(async (requestPermission = false) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return { inputs: [], outputs: [] };
      }

      if (requestPermission) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach((track) => track.stop());
        } catch (permErr) {}
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId);
      const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId);

      const formattedInputs = inputs.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || (index === 0 ? 'Microfone Padrão do Sistema' : `Microfone ${index + 1}`),
        groupId: d.groupId
      }));

      const formattedOutputs = outputs.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || (index === 0 ? 'Alto-falante / Fone Padrão' : `Saída de Áudio ${index + 1}`),
        groupId: d.groupId
      }));

      setInputDevices(formattedInputs);
      setOutputDevices(formattedOutputs);

      if (formattedInputs.length > 0 && (!selectedInputDevice || !formattedInputs.some(d => d.deviceId === selectedInputDevice))) {
        setSelectedInputDevice(formattedInputs[0].deviceId);
      }
      if (formattedOutputs.length > 0 && (!selectedOutputDevice || !formattedOutputs.some(d => d.deviceId === selectedOutputDevice))) {
        setSelectedOutputDevice(formattedOutputs[0].deviceId);
      }

      return { inputs: formattedInputs, outputs: formattedOutputs };
    } catch (err) {
      return { inputs: [], outputs: [] };
    }
  }, [selectedInputDevice, selectedOutputDevice]);

  useEffect(() => {
    refreshAudioDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => refreshAudioDevices(false));
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', () => refreshAudioDevices(false));
      };
    }
  }, [refreshAudioDevices]);

  // Audio Analyzer for Speaking Indicator
  const startSpeakingDetector = (stream) => {
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current) return;

        // If user is muted, force volume to 0 and speaking to false immediately
        if (isMutedRef.current) {
          setMicVolumeLevel(0);
          setIsSpeaking((prev) => {
            if (prev) {
              if (socket && activeVoiceChannel) {
                socket.emit(SOCKET_EVENTS.VOICE_SPEAKING_STATE, {
                  channelId: activeVoiceChannel.id,
                  isSpeaking: false
                });
              }
              if (user?.id) {
                setVoiceUsers((currentUsers) =>
                  currentUsers.map((u) => (u.userId === user.id ? { ...u, isSpeaking: false } : u))
                );
              }
            }
            return false;
          });
          animFrameRef.current = requestAnimationFrame(checkVolume);
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setMicVolumeLevel(normalized);

        const speakingNow = normalized > 10;
        setIsSpeaking((prev) => {
          if (prev !== speakingNow) {
            if (socket && activeVoiceChannel) {
              socket.emit(SOCKET_EVENTS.VOICE_SPEAKING_STATE, {
                channelId: activeVoiceChannel.id,
                isSpeaking: speakingNow
              });
            }
            if (user?.id) {
              setVoiceUsers((currentUsers) =>
                currentUsers.map((u) => (u.userId === user.id ? { ...u, isSpeaking: speakingNow } : u))
              );
            }
          }
          return speakingNow;
        });

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {}
  };

  const stopSpeakingDetector = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsSpeaking(false);
    setMicVolumeLevel(0);
  };

  // Ensure local mic stream is active and attached to all peer connections
  const ensureLocalStream = async (force = false) => {
    if (!force && localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0 && localStreamRef.current.getAudioTracks()[0].readyState === 'live') {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !isMutedRef.current; });
      return localStreamRef.current;
    }

    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      localStreamRef.current = null;
    }

    try {
      const audioConstraints = selectedInputDevice
        ? { deviceId: { ideal: selectedInputDevice }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
      });

      localStreamRef.current = stream;

      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMutedRef.current;
      });

      startSpeakingDetector(stream);

      // Attach audio tracks to any existing peer connections
      peerConnectionsRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        stream.getAudioTracks().forEach((track) => {
          const sender = senders.find((s) => s.track && s.track.kind === 'audio');
          if (sender) {
            sender.replaceTrack(track).catch(() => {});
          } else {
            try {
              pc.addTrack(track, stream);
            } catch (e) {}
          }
        });
      });

      return stream;
    } catch (err) {
      console.warn('Microphone capture error:', err);
      return null;
    }
  };

  // Helper to drain queued ICE candidates once remote description is set
  const drainIceCandidates = async (targetUserId, pc) => {
    const queue = iceCandidateQueuesRef.current.get(targetUserId) || [];
    iceCandidateQueuesRef.current.delete(targetUserId);
    for (const candidateData of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidateData));
      } catch (e) {
        console.warn('Error applying queued ICE candidate:', e);
      }
    }
  };

  // Helper to create Peer Connection for a remote user
  const createPeerConnection = (targetUserId, channelId) => {
    if (peerConnectionsRef.current.has(targetUserId)) {
      return peerConnectionsRef.current.get(targetUserId);
    }

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceCandidatePoolSize: 10
    });

    // Add local audio tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        try {
          pc.addTrack(track, localStreamRef.current);
        } catch (e) {}
      });
    }

    // ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidatePayload = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment
        };

        if (socket && socket.connected) {
          socket.emit(SOCKET_EVENTS.VOICE_ICE_CANDIDATE, {
            targetUserId,
            channelId,
            candidate: candidatePayload
          });
        }
        if (user?.id) {
          sendVoiceSignalInCloud(channelId, user.id, targetUserId, 'candidate', candidatePayload);
        }
      }
    };

    // Receive Remote Audio Track
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const track = event.track;
      const streamToPlay = remoteStream || new MediaStream([track]);

      let audioEl = remoteAudiosRef.current.get(targetUserId);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `remote-audio-${targetUserId}`;
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        remoteAudiosRef.current.set(targetUserId, audioEl);
      }

      if (audioEl.srcObject !== streamToPlay) {
        audioEl.srcObject = streamToPlay;
      }

      const isDeaf = isDeafenedRef.current;
      const volume = userVolumes.get(targetUserId) !== undefined ? userVolumes.get(targetUserId) : 1;
      audioEl.muted = isDeaf || volume === 0;
      audioEl.volume = isDeaf ? 0 : volume;

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn(`Remote audio autoplay pending interaction for user ${targetUserId}:`, err);
          const resumeAudio = () => {
            audioEl.play().catch(() => {});
            window.removeEventListener('click', resumeAudio);
            window.removeEventListener('keydown', resumeAudio);
          };
          window.addEventListener('click', resumeAudio, { once: true });
          window.addEventListener('keydown', resumeAudio, { once: true });
        });
      }
    };

    peerConnectionsRef.current.set(targetUserId, pc);
    return pc;
  };

  // Helper to send Offer to a remote user (deterministic initiator: String(user.id) < String(targetUserId))
  const initiateVoiceOffer = async (targetUserId, channelId) => {
    if (!targetUserId || String(targetUserId) === String(user?.id) || !channelId) return;
    try {
      const stream = await ensureLocalStream();
      const pc = createPeerConnection(targetUserId, channelId);

      if (stream) {
        const senders = pc.getSenders();
        stream.getAudioTracks().forEach((track) => {
          if (!senders.some((s) => s.track === track)) {
            try { pc.addTrack(track, stream); } catch (e) {}
          }
        });
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(offer);

      const offerPayload = {
        type: offer.type,
        sdp: offer.sdp
      };

      if (socket && socket.connected) {
        socket.emit(SOCKET_EVENTS.VOICE_OFFER, {
          targetUserId,
          channelId,
          offer: offerPayload
        });
      }
      if (user?.id) {
        sendVoiceSignalInCloud(channelId, user.id, targetUserId, 'offer', offerPayload);
      }
    } catch (err) {
      console.warn(`Failed to create voice offer for ${targetUserId}:`, err);
    }
  };

  // Helper to handle incoming Offer
  const handleIncomingVoiceOffer = async (senderUserId, channelId, offer) => {
    if (!senderUserId || String(senderUserId) === String(user?.id) || !channelId || !offer) return;
    try {
      const stream = await ensureLocalStream();
      const pc = createPeerConnection(senderUserId, channelId);

      if (stream) {
        const senders = pc.getSenders();
        stream.getAudioTracks().forEach((track) => {
          if (!senders.some((s) => s.track === track)) {
            try { pc.addTrack(track, stream); } catch (e) {}
          }
        });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await drainIceCandidates(senderUserId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const answerPayload = {
        type: answer.type,
        sdp: answer.sdp
      };

      if (socket && socket.connected) {
        socket.emit(SOCKET_EVENTS.VOICE_ANSWER, {
          targetUserId: senderUserId,
          channelId,
          answer: answerPayload
        });
      }
      if (user?.id) {
        sendVoiceSignalInCloud(channelId, user.id, senderUserId, 'answer', answerPayload);
      }
    } catch (err) {
      console.warn('Error handling incoming voice offer:', err);
    }
  };

  // Helper to handle incoming Answer
  const handleIncomingVoiceAnswer = async (senderUserId, answer) => {
    if (!senderUserId || !answer) return;
    try {
      const pc = peerConnectionsRef.current.get(senderUserId);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await drainIceCandidates(senderUserId, pc);
      }
    } catch (err) {
      console.warn('Error handling voice answer:', err);
    }
  };

  // Helper to handle incoming ICE candidate
  const handleIncomingVoiceCandidate = async (senderUserId, candidate) => {
    if (!senderUserId || !candidate) return;
    try {
      const pc = peerConnectionsRef.current.get(senderUserId);

      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue candidate until setRemoteDescription completes
        if (!iceCandidateQueuesRef.current.has(senderUserId)) {
          iceCandidateQueuesRef.current.set(senderUserId, []);
        }
        iceCandidateQueuesRef.current.get(senderUserId).push(candidate);
      }
    } catch (err) {
      console.warn('Error adding voice ICE candidate:', err);
    }
  };

  // Join Voice Channel
  const joinVoice = async (channel) => {
    if (!channel) return;
    if (activeVoiceChannel?.id === channel.id) return;

    if (activeVoiceChannel) {
      leaveVoice();
    }

    // Always acquire microphone stream
    await ensureLocalStream();

    const participantInfo = {
      userId: user?.id || 'user-' + Date.now(),
      username: user?.username || 'Usuário',
      avatar: user?.avatar || '',
      isMuted: isMuted,
      isDeafened: isDeafened,
      isSpeaking: false,
      isScreenSharing: false,
      socketId: socket?.id || 'cloud'
    };

    const allVoiceIds = (activeServer?.channels || [])
      .filter((c) => c.type === 'voice')
      .map((c) => c.id);

    setActiveVoiceChannel(channel);
    setVoiceUsers([participantInfo]);

    if (socket && socket.connected) {
      socket.emit(SOCKET_EVENTS.VOICE_JOIN, { channelId: channel.id });
    }

    await switchVoiceRoomInCloud(channel.id, participantInfo, allVoiceIds);
  };

  // Leave Voice Channel
  const leaveVoice = useCallback(() => {
    if (socket && socket.connected && activeVoiceChannel) {
      socket.emit(SOCKET_EVENTS.VOICE_LEAVE, { channelId: activeVoiceChannel.id });
    }

    if (activeVoiceChannel) {
      leaveVoiceInCloud(activeVoiceChannel.id, user?.id, user?.username);
    }

    stopSpeakingDetector();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    iceCandidateQueuesRef.current.clear();

    remoteAudiosRef.current.forEach((audioEl) => {
      audioEl.srcObject = null;
      audioEl.remove();
    });
    remoteAudiosRef.current.clear();

    if (localCameraStream) {
      localCameraStream.getTracks().forEach((track) => track.stop());
      setLocalCameraStream(null);
      setIsCameraOn(false);
    }

    setActiveVoiceChannel(null);
    setVoiceUsers([]);
  }, [socket, activeVoiceChannel, user?.id, user?.username, localCameraStream]);

  // Toggle Camera / Webcam
  const toggleCamera = async () => {
    if (!activeVoiceChannel) {
      showError('Canal de Voz Necessário', 'Entre em um canal de voz para ligar a câmera.');
      return;
    }

    if (isCameraOn) {
      if (localCameraStream) {
        localCameraStream.getTracks().forEach((t) => t.stop());
      }
      setLocalCameraStream(null);
      setIsCameraOn(false);
      updateVoiceUserStateInCloud(activeVoiceChannel.id, user?.id, { isCameraOn: false });
      showToast('Câmera desativada', 'info');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: false
        });
        setLocalCameraStream(stream);
        setIsCameraOn(true);
        updateVoiceUserStateInCloud(activeVoiceChannel.id, user?.id, { isCameraOn: true });
        showToast('Câmera ativada com sucesso!', 'success');
      } catch (err) {
        console.error('Camera error:', err);
        showError('Permissão de Câmera', 'Não foi possível acessar a webcam. Verifique as permissões de vídeo no navegador.');
      }
    }
  };

  // Toggle Mute
  const toggleMute = async () => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);

    // 1. Instantly silence/enable local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    // 2. Instantly update all active WebRTC senders
    peerConnectionsRef.current.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.track.enabled = !nextMuted;
        }
      });
    });

    // 3. If unmuting, ensure the mic stream is active and healthy
    if (!nextMuted) {
      if (!localStreamRef.current || !localStreamRef.current.active || localStreamRef.current.getAudioTracks().some((t) => t.readyState === 'ended')) {
        await ensureLocalStream(true);
      }
    } else {
      setIsSpeaking(false);
      setMicVolumeLevel(0);
    }

    // 4. Broadcast mute state to socket and cloud
    if (socket && activeVoiceChannel) {
      socket.emit(SOCKET_EVENTS.VOICE_MUTE_STATE, {
        channelId: activeVoiceChannel.id,
        isMuted: nextMuted,
        isDeafened: isDeafenedRef.current
      });
    }
    if (activeVoiceChannel?.id && user?.id) {
      updateVoiceUserStateInCloud(activeVoiceChannel.id, user.id, {
        isMuted: nextMuted,
        isDeafened: isDeafenedRef.current,
        username: user.username,
        avatar: user.avatar
      });
    }
  };

  // Toggle Deafen
  const toggleDeafen = async () => {
    const nextDeafened = !isDeafenedRef.current;
    isDeafenedRef.current = nextDeafened;
    setIsDeafened(nextDeafened);

    let effectiveMute = isMutedRef.current;
    if (nextDeafened) {
      effectiveMute = true;
      isMutedRef.current = true;
      setIsMuted(true);

      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      peerConnectionsRef.current.forEach((pc) => {
        pc.getSenders().forEach((sender) => {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = false;
          }
        });
      });
      setIsSpeaking(false);
      setMicVolumeLevel(0);
    }

    // Silence or restore all remote audio outputs
    remoteAudiosRef.current.forEach((audioEl, targetUserId) => {
      const userVol = userVolumes.get(targetUserId) !== undefined ? userVolumes.get(targetUserId) : 1;
      audioEl.muted = nextDeafened;
      audioEl.volume = nextDeafened ? 0 : userVol;
    });

    if (socket && activeVoiceChannel) {
      socket.emit(SOCKET_EVENTS.VOICE_MUTE_STATE, {
        channelId: activeVoiceChannel.id,
        isMuted: effectiveMute,
        isDeafened: nextDeafened
      });
    }
    if (activeVoiceChannel?.id && user?.id) {
      updateVoiceUserStateInCloud(activeVoiceChannel.id, user.id, {
        isMuted: effectiveMute,
        isDeafened: nextDeafened,
        username: user.username,
        avatar: user.avatar
      });
    }
  };

  // Set individual user volume
  const setUserVolume = (targetUserId, volume) => {
    setUserVolumes((prev) => {
      const next = new Map(prev);
      next.set(targetUserId, volume);
      return next;
    });

    const audioEl = remoteAudiosRef.current.get(targetUserId);
    if (audioEl) {
      const isDeaf = isDeafenedRef.current;
      audioEl.muted = isDeaf || volume === 0;
      audioEl.volume = isDeaf ? 0 : volume;
    }
  };

  // Cloud WebRTC Voice Signals Listener
  useEffect(() => {
    if (!activeVoiceChannel?.id || !user?.id) return;

    const unsub = listenToVoiceSignalsInCloud(activeVoiceChannel.id, user.id, async (sig) => {
      if (String(sig.senderId) === String(user.id)) return;

      if (sig.type === 'offer') {
        await handleIncomingVoiceOffer(sig.senderId, activeVoiceChannel.id, sig.data);
      } else if (sig.type === 'answer') {
        await handleIncomingVoiceAnswer(sig.senderId, sig.data);
      } else if (sig.type === 'candidate') {
        await handleIncomingVoiceCandidate(sig.senderId, sig.data);
      }
    });

    return () => {
      unsub();
    };
  }, [activeVoiceChannel?.id, user?.id]);

  // Socket signaling listeners for WebRTC Voice Mesh
  useEffect(() => {
    if (!socket) return;

    // List of users in voice room when we join
    socket.on(SOCKET_EVENTS.VOICE_USERS_LIST, async ({ channelId, users }) => {
      setVoiceUsers(users || []);

      for (const remoteUser of users) {
        if (String(remoteUser.userId) === String(user?.id)) continue;
        if (String(user?.id) < String(remoteUser.userId)) {
          await initiateVoiceOffer(remoteUser.userId, channelId);
        }
      }
    });

    // When a new user joins the voice room
    socket.on(SOCKET_EVENTS.VOICE_USER_JOINED, ({ channelId, user: newUser }) => {
      setVoiceUsers((prev) => {
        const exists = prev.some((u) => u.userId === newUser.userId);
        return exists ? prev : [...prev, newUser];
      });
    });

    // When a user leaves the voice room
    socket.on(SOCKET_EVENTS.VOICE_USER_LEFT, ({ userId: leftUserId }) => {
      setVoiceUsers((prev) => prev.filter((u) => u.userId !== leftUserId));

      if (peerConnectionsRef.current.has(leftUserId)) {
        peerConnectionsRef.current.get(leftUserId).close();
        peerConnectionsRef.current.delete(leftUserId);
      }
      if (remoteAudiosRef.current.has(leftUserId)) {
        remoteAudiosRef.current.get(leftUserId).srcObject = null;
        remoteAudiosRef.current.get(leftUserId).remove();
        remoteAudiosRef.current.delete(leftUserId);
      }
    });

    // Handle incoming Voice SDP Offer
    socket.on(SOCKET_EVENTS.VOICE_OFFER, async ({ senderUserId, channelId, offer }) => {
      await handleIncomingVoiceOffer(senderUserId, channelId, offer);
    });

    // Handle incoming Voice SDP Answer
    socket.on(SOCKET_EVENTS.VOICE_ANSWER, async ({ senderUserId, answer }) => {
      await handleIncomingVoiceAnswer(senderUserId, answer);
    });

    // Handle incoming Voice ICE Candidate
    socket.on(SOCKET_EVENTS.VOICE_ICE_CANDIDATE, async ({ senderUserId, candidate }) => {
      await handleIncomingVoiceCandidate(senderUserId, candidate);
    });

    // Update mute state in list
    socket.on(SOCKET_EVENTS.VOICE_MUTE_STATE, ({ userId: targetUserId, isMuted: remoteMuted, isDeafened: remoteDeafened }) => {
      setVoiceUsers((prev) =>
        prev.map((u) => (u.userId === targetUserId ? { ...u, isMuted: remoteMuted, isDeafened: remoteDeafened } : u))
      );
    });

    // Update speaking state in list
    socket.on(SOCKET_EVENTS.VOICE_SPEAKING_STATE, ({ userId: targetUserId, isSpeaking: remoteSpeaking }) => {
      setVoiceUsers((prev) =>
        prev.map((u) => (u.userId === targetUserId ? { ...u, isSpeaking: remoteSpeaking } : u))
      );
    });

    // Global voice channel update across the server
    socket.on('voice:channel_update', ({ channelId, users }) => {
      setVoiceChannelUsersMap((prev) => {
        const next = new Map(prev);
        if (users && users.length > 0) {
          next.set(channelId, users);
        } else {
          next.delete(channelId);
        }
        return next;
      });
      if (activeVoiceChannel?.id === channelId) {
        setVoiceUsers(users || []);
      }
    });

    return () => {
      socket.off('voice:channel_update');
      socket.off(SOCKET_EVENTS.VOICE_USERS_LIST);
      socket.off(SOCKET_EVENTS.VOICE_USER_JOINED);
      socket.off(SOCKET_EVENTS.VOICE_USER_LEFT);
      socket.off(SOCKET_EVENTS.VOICE_OFFER);
      socket.off(SOCKET_EVENTS.VOICE_ANSWER);
      socket.off(SOCKET_EVENTS.VOICE_ICE_CANDIDATE);
      socket.off(SOCKET_EVENTS.VOICE_MUTE_STATE);
      socket.off(SOCKET_EVENTS.VOICE_SPEAKING_STATE);
    };
  }, [socket, user?.id, activeVoiceChannel?.id]);

  // Firestore listener for all voice channels on active server
  useEffect(() => {
    if (!activeServer) return;

    const voiceChannels = activeServer.channels?.filter((c) => c.type === 'voice') || [];
    const unsubscribes = voiceChannels.map((channel) => {
      return listenToVoiceRoomInCloud(channel.id, (users) => {
        const seen = new Set();
        let cleanUsers = (users || []).filter((u) => {
          if (!u) return false;
          const key = (u.userId || '') + '_' + (u.username || '');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (activeVoiceChannel?.id !== channel.id && user) {
          cleanUsers = cleanUsers.filter(
            (u) => String(u.userId) !== String(user.id) && u.username?.toLowerCase() !== user.username?.toLowerCase()
          );
        }

        setVoiceChannelUsersMap((prev) => {
          const next = new Map(prev);
          if (cleanUsers.length > 0) {
            next.set(channel.id, cleanUsers);
          } else {
            next.delete(channel.id);
          }
          return next;
        });

        if (activeVoiceChannel?.id === channel.id) {
          setVoiceUsers(cleanUsers);

          // Connect WebRTC audio with all other users in this active voice room
          cleanUsers.forEach((remoteUser) => {
            if (remoteUser.userId && user?.id && String(remoteUser.userId) !== String(user.id)) {
              if (String(user.id) < String(remoteUser.userId)) {
                initiateVoiceOffer(remoteUser.userId, activeVoiceChannel.id);
              }
            }
          });
        }
      });
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [activeServer, activeVoiceChannel?.id, user?.id, user?.username]);

  // Disconnect / Kick user from voice channel (Admin or offline/stuck purge)
  const kickUserFromVoice = async (channelId, targetUserId, targetUsername) => {
    if (!channelId || (!targetUserId && !targetUsername)) return;
    try {
      await kickUserFromVoiceInCloud(channelId, targetUserId, targetUsername);
      if (socket && socket.connected) {
        socket.emit(SOCKET_EVENTS.VOICE_LEAVE, { channelId, targetUserId });
      }
      showToast(`Usuário desconectado da sala de voz.`, 'info');
    } catch (err) {
      console.warn('Error disconnecting user from voice:', err);
    }
  };

  // Real-time Voice Heartbeat (every 6 seconds)
  useEffect(() => {
    if (!activeVoiceChannel?.id || !user?.id) return;
    
    // Initial heartbeat
    sendVoiceHeartbeatInCloud(activeVoiceChannel.id, user.id, user.username);

    const interval = setInterval(() => {
      sendVoiceHeartbeatInCloud(activeVoiceChannel.id, user.id, user.username);
    }, 6000);

    return () => clearInterval(interval);
  }, [activeVoiceChannel?.id, user?.id, user?.username]);

  // Real-time Global Online Presence Heartbeat (every 6 seconds)
  useEffect(() => {
    if (!user?.id) return;

    setUserPresenceInCloud(user.id, user.username, user.status || 'online');

    const interval = setInterval(() => {
      setUserPresenceInCloud(user.id, user.username, user.status || 'online');
    }, 6000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setUserPresenceInCloud(user.id, user.username, user.status || 'online');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id, user?.username, user?.status]);

  // If I was kicked or disconnected from active voice room by another user/admin
  useEffect(() => {
    if (!activeVoiceChannel || !user?.id || voiceUsers.length === 0) return;
    const amIStillInRoom = voiceUsers.some(
      (u) => String(u.userId) === String(user.id) || (user.username && u.username?.toLowerCase() === user.username.toLowerCase())
    );
    if (!amIStillInRoom) {
      leaveVoice();
      showToast('Você foi desconectado do canal de voz.', 'warning');
    }
  }, [voiceUsers, activeVoiceChannel, user?.id, user?.username, leaveVoice, showToast]);

  // Clean up voice room immediately when closing the tab/window
  useEffect(() => {
    const handleVoiceUnload = () => {
      if (activeVoiceChannel?.id && user?.id) {
        leaveVoiceInCloud(activeVoiceChannel.id, user.id, user.username);
      }
      if (user?.id) {
        setUserPresenceInCloud(user.id, user.username, 'offline');
      }
    };

    window.addEventListener('beforeunload', handleVoiceUnload);
    window.addEventListener('pagehide', handleVoiceUnload);

    return () => {
      window.removeEventListener('beforeunload', handleVoiceUnload);
      window.removeEventListener('pagehide', handleVoiceUnload);
    };
  }, [activeVoiceChannel?.id, user?.id, user?.username]);

  // Listen to Soundboard events in active voice room
  useEffect(() => {
    if (!activeVoiceChannel?.id) return;
    const unsub = listenToSoundboardInCloud(activeVoiceChannel.id, (data) => {
      if (data?.soundId && String(data.userId) !== String(user?.id)) {
        soundSynthesizer.play(data.soundId);
      }
    });
    return () => {
      if (unsub) unsub();
    };
  }, [activeVoiceChannel?.id, user?.id]);

  return (
    <VoiceContext.Provider
      value={{
        activeVoiceChannel,
        voiceUsers,
        voiceChannelUsersMap,
        isMuted,
        isDeafened,
        isSpeaking,
        micVolumeLevel,
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
        inputDevices,
        outputDevices,
        selectedInputDevice,
        selectedOutputDevice,
        setSelectedInputDevice,
        setSelectedOutputDevice,
        refreshAudioDevices
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  return useContext(VoiceContext);
}
