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
  updateVoiceUserStateInCloud 
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

  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState('');
  const [userVolumes, setUserVolumes] = useState(new Map());

  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // Map<userId, RTCPeerConnection>
  const remoteAudiosRef = useRef(new Map()); // Map<userId, HTMLAudioElement>
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

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
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setMicVolumeLevel(normalized);

        const speakingNow = normalized > 12;
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

  // Helper to create Peer Connection for a remote user
  const createPeerConnection = (targetUserId, channelId) => {
    if (peerConnectionsRef.current.has(targetUserId)) {
      return peerConnectionsRef.current.get(targetUserId);
    }

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current
    });

    // Add local audio tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit(SOCKET_EVENTS.VOICE_ICE_CANDIDATE, {
          targetUserId,
          channelId,
          candidate: event.candidate
        });
      }
    };

    // Receive Remote Audio Track
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        let audioEl = remoteAudiosRef.current.get(targetUserId);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          remoteAudiosRef.current.set(targetUserId, audioEl);
        }
        audioEl.srcObject = remoteStream;
        const volume = userVolumes.get(targetUserId) !== undefined ? userVolumes.get(targetUserId) : 1;
        audioEl.volume = isDeafened ? 0 : volume;
        audioEl.play().catch(() => {});
      }
    };

    peerConnectionsRef.current.set(targetUserId, pc);
    return pc;
  };

  // Join Voice Channel
  const joinVoice = async (channel) => {
    if (!channel) return;
    if (activeVoiceChannel?.id === channel.id) return; // already in this room

    // Leave any current voice first
    if (activeVoiceChannel) {
      leaveVoice();
    }

    const participantInfo = {
      userId: user?.id || 'offline-user',
      username: user?.username || 'Usuário',
      avatar: user?.avatar || '',
      isMuted: isMuted,
      isDeafened: isDeafened,
      isSpeaking: false,
      isScreenSharing: false,
      socketId: socket?.id || 'offline'
    };

    const allVoiceIds = (activeServer?.channels || [])
      .filter((c) => c.type === 'voice')
      .map((c) => c.id);

    if (socket && socket.connected) {
      try {
        const constraints = {
          audio: {
            deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;

        stream.getAudioTracks().forEach((track) => {
          track.enabled = !isMuted;
        });

        startSpeakingDetector(stream);
        setActiveVoiceChannel(channel);
        socket.emit(SOCKET_EVENTS.VOICE_JOIN, { channelId: channel.id });
      } catch (err) {
        console.error('Failed to capture audio stream for voice:', err);
        showError('Microfone Inacessível', 'Não foi possível acessar seu microfone. Verifique as permissões de áudio do seu navegador.');
      }
    } else {
      // Offline / Firebase Firestore mode fallback
      setActiveVoiceChannel(channel);
      setVoiceUsers([participantInfo]);
      await switchVoiceRoomInCloud(channel.id, participantInfo, allVoiceIds);
    }
  };

  // Leave Voice Channel
  const leaveVoice = useCallback(() => {
    if (socket && socket.connected && activeVoiceChannel) {
      socket.emit(SOCKET_EVENTS.VOICE_LEAVE, { channelId: activeVoiceChannel.id });
    }

    if ((!socket || !socket.connected) && activeVoiceChannel) {
      leaveVoiceInCloud(activeVoiceChannel.id, user?.id, user?.username);
    }

    stopSpeakingDetector();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    remoteAudiosRef.current.forEach((audioEl) => {
      audioEl.srcObject = null;
      audioEl.remove();
    });
    remoteAudiosRef.current.clear();

    setActiveVoiceChannel(null);
    setVoiceUsers([]);
  }, [socket, activeVoiceChannel, user?.id, user?.username]);

  // Toggle Mute
  const toggleMute = () => {
    // Check if muted by admin
    const myMember = serverMembers.find((m) => m.id === user?.id);
    if (myMember?.mutedByAdmin) {
      console.warn('Silenciado pelo administrador.');
      return;
    }

    setIsMuted((prev) => {
      const next = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }
      if (socket && activeVoiceChannel) {
        socket.emit(SOCKET_EVENTS.VOICE_MUTE_STATE, {
          channelId: activeVoiceChannel.id,
          isMuted: next,
          isDeafened
        });
      }
      if (activeVoiceChannel?.id && user?.id) {
        updateVoiceUserStateInCloud(activeVoiceChannel.id, user.id, {
          isMuted: next,
          isDeafened,
          username: user.username,
          avatar: user.avatar
        });
      }
      return next;
    });
  };

  // Toggle Deafen
  const toggleDeafen = () => {
    setIsDeafened((prev) => {
      const next = !prev;
      // When deafened, also mute mic
      if (next && !isMuted) {
        setIsMuted(true);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
        }
      }

      // Mute/unmute all remote audio elements
      remoteAudiosRef.current.forEach((audioEl, targetUserId) => {
        const vol = userVolumes.get(targetUserId) !== undefined ? userVolumes.get(targetUserId) : 1;
        audioEl.volume = next ? 0 : vol;
      });

      const effectiveMute = next ? true : isMuted;

      if (socket && activeVoiceChannel) {
        socket.emit(SOCKET_EVENTS.VOICE_MUTE_STATE, {
          channelId: activeVoiceChannel.id,
          isMuted: effectiveMute,
          isDeafened: next
        });
      }
      if (activeVoiceChannel?.id && user?.id) {
        updateVoiceUserStateInCloud(activeVoiceChannel.id, user.id, {
          isMuted: effectiveMute,
          isDeafened: next,
          username: user.username,
          avatar: user.avatar
        });
      }
      return next;
    });
  };

  // Set individual user volume
  const setUserVolume = (targetUserId, volume) => {
    setUserVolumes((prev) => {
      const next = new Map(prev);
      next.set(targetUserId, volume);
      const audioEl = remoteAudiosRef.current.get(targetUserId);
      if (audioEl && !isDeafened) {
        audioEl.volume = volume;
      }
      return next;
    });
  };

  // Socket signaling listeners for WebRTC Voice Mesh
  useEffect(() => {
    if (!socket) return;

    // List of users in voice room when we join
    socket.on(SOCKET_EVENTS.VOICE_USERS_LIST, async ({ channelId, users }) => {
      setVoiceUsers(users || []);

      // Create offers to all existing users in the room
      for (const remoteUser of users) {
        if (remoteUser.userId === user?.id) continue;
        try {
          const pc = createPeerConnection(remoteUser.userId, channelId);
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          });
          await pc.setLocalDescription(offer);

          socket.emit(SOCKET_EVENTS.VOICE_OFFER, {
            targetUserId: remoteUser.userId,
            channelId,
            offer
          });
        } catch (err) {
          console.error(`Failed to create offer for ${remoteUser.username}:`, err);
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

      // Cleanup peer connection
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
      try {
        const pc = createPeerConnection(senderUserId, channelId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit(SOCKET_EVENTS.VOICE_ANSWER, {
          targetUserId: senderUserId,
          channelId,
          answer
        });
      } catch (err) {
        console.error('Error handling incoming voice offer:', err);
      }
    });

    // Handle incoming Voice SDP Answer
    socket.on(SOCKET_EVENTS.VOICE_ANSWER, async ({ senderUserId, answer }) => {
      try {
        const pc = peerConnectionsRef.current.get(senderUserId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (err) {
        console.error('Error handling voice answer:', err);
      }
    });

    // Handle incoming Voice ICE Candidate
    socket.on(SOCKET_EVENTS.VOICE_ICE_CANDIDATE, async ({ senderUserId, candidate }) => {
      try {
        const pc = peerConnectionsRef.current.get(senderUserId);
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.warn('Error adding voice ICE candidate:', err);
      }
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

  // Firestore listener for all voice channels on active server when socket is offline
  useEffect(() => {
    if (!activeServer || (socket && socket.connected)) {
      return;
    }

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
        }
      });
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [activeServer, socket, socket?.connected, activeVoiceChannel?.id, user?.id, user?.username]);

  // Clean up voice room immediately when closing the tab/window
  useEffect(() => {
    const handleVoiceUnload = () => {
      if (activeVoiceChannel?.id && user?.id) {
        leaveVoiceInCloud(activeVoiceChannel.id, user.id, user.username);
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
        joinVoice,
        leaveVoice,
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
