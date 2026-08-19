import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useVoice } from './VoiceContext';
import { useServer } from './ServerContext';
import { 
  updateVoiceScreenSharingInCloud, 
  sendScreenSignalInCloud, 
  listenToScreenSignalsInCloud 
} from '../services/cloudSync';
import { SOCKET_EVENTS, DEFAULT_ICE_SERVERS } from '@shared/constants';
import { useNotification } from './NotificationContext';

const ScreenShareContext = createContext(null);

export function ScreenShareProvider({ children }) {
  const { showError, showToast } = useNotification();
  const { socket } = useSocket();
  const { user } = useAuth();
  const { activeServer, activeChannel, setActiveChannel } = useServer();
  const { activeVoiceChannel, voiceUsers, joinVoice } = useVoice();

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState(new Map()); // Map<userId, MediaStream>
  const [screenQuality, setScreenQuality] = useState('1080p'); // 'auto', '720p', '1080p'
  const [screenFps, setScreenFps] = useState(30); // 30 or 60
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [activePresenter, setActivePresenter] = useState(null);

  const localStreamRef = useRef(null);
  const screenPeerConnectionsRef = useRef(new Map()); // Map<userId, RTCPeerConnection>

  const getQualityDimensions = (quality) => {
    switch (quality) {
      case '720p':
        return { width: 1280, height: 720 };
      case '1080p':
        return { width: 1920, height: 1080 };
      default:
        return { width: 1920, height: 1080 };
    }
  };

  // Create Peer Connection and send Screen Offer
  const createAndSendScreenOffer = async (targetUserId, channelId, stream) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
      screenPeerConnectionsRef.current.set(targetUserId, pc);

      // Add screen video tracks with high-bitrate encoding
      stream.getVideoTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        try {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = 8000000; // 8 Mbps for crisp HD 60fps
          params.encodings[0].degradationPreference = 'maintain-resolution';
          sender.setParameters(params).catch(() => {});
        } catch (e) {}
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          if (socket && socket.connected) {
            socket.emit(SOCKET_EVENTS.SCREEN_ICE_CANDIDATE, {
              targetUserId,
              channelId,
              candidate: event.candidate
            });
          }
          sendScreenSignalInCloud(channelId, user?.id, targetUserId, 'candidate', event.candidate);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (socket && socket.connected) {
        socket.emit(SOCKET_EVENTS.SCREEN_OFFER, {
          targetUserId,
          channelId,
          offer
        });
      }
      sendScreenSignalInCloud(channelId, user?.id, targetUserId, 'offer', offer);
    } catch (err) {
      console.error(`Error sending screen offer to ${targetUserId}:`, err);
    }
  };

  // Start Screen Share
  const startScreenShare = async (sourceId) => {
    let currentVoice = activeVoiceChannel;

    // If not connected to voice yet, auto-connect to the active channel if it's voice,
    // or to the first voice channel in the active server
    if (!currentVoice) {
      if (activeChannel?.type === 'voice') {
        joinVoice(activeChannel);
        currentVoice = activeChannel;
      } else if (activeServer?.channels) {
        const firstVoice = activeServer.channels.find((c) => c.type === 'voice');
        if (firstVoice) {
          joinVoice(firstVoice);
          if (setActiveChannel) setActiveChannel(firstVoice);
          currentVoice = firstVoice;
        }
      }
    }

    if (!currentVoice) {
      showError('Canal de Voz Necessário', 'Clique em um canal de voz na barra lateral para conectar o áudio e a transmissão.');
      return;
    }

    try {
      let stream = null;
      const { width, height } = getQualityDimensions(screenQuality);

      if (window.electronAPI?.isElectron && sourceId) {
        // Native Electron screen/window capture via desktopCapturer
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: 1280,
              maxWidth: width,
              minHeight: 720,
              maxHeight: height,
              maxFrameRate: screenFps
            }
          }
        });
      } else {
        // Web / Fallback display media with crystal-clear HD & 60fps
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: width, max: width },
            height: { ideal: height, max: height },
            frameRate: { ideal: screenFps, max: screenFps },
            displaySurface: 'monitor'
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
      }

      // Maximize video track clarity & detail
      if (stream.getVideoTracks().length > 0) {
        const vTrack = stream.getVideoTracks()[0];
        if ('contentHint' in vTrack) {
          vTrack.contentHint = 'detail';
        }
      }

      localStreamRef.current = stream;
      setLocalScreenStream(stream);
      setIsScreenSharing(true);
      const presenterData = {
        userId: user?.id || 'presenter',
        username: user?.username || 'Você',
        quality: screenQuality,
        fps: screenFps,
        channelId: currentVoice.id
      };
      setActivePresenter(presenterData);
      setIsPickerOpen(false);

      // Notify Firestore cloud in real-time
      updateVoiceScreenSharingInCloud(currentVoice.id, user?.id, true, presenterData);
      showToast('Transmissão de tela iniciada com sucesso!', 'success');

      // Handle user stopping screen share via native browser/OS banner
      if (stream.getVideoTracks().length > 0) {
        stream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };
      }

      // Notify socket server if connected
      if (socket && socket.connected) {
        socket.emit(SOCKET_EVENTS.SCREEN_START, {
          channelId: currentVoice.id,
          quality: screenQuality,
          fps: screenFps
        });
      }

      // Send screen video track offer to all participants in voice room
      for (const remoteUser of voiceUsers) {
        if (remoteUser.userId === user?.id) continue;
        createAndSendScreenOffer(remoteUser.userId, currentVoice.id, stream);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        return; // User canceled the screen selection prompt
      }
      console.error('Error starting screen share:', err);
      showError('Erro na Transmissão', 'Não foi possível iniciar o compartilhamento de tela.');
    }
  };

  // Stop Screen Share
  const stopScreenShare = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setLocalScreenStream(null);
    setIsScreenSharing(false);

    if (activePresenter?.userId === user?.id) {
      setActivePresenter(null);
    }

    if (activeVoiceChannel) {
      updateVoiceScreenSharingInCloud(activeVoiceChannel.id, user?.id, false, null);

      // Broadcast screen_stopped signal to all other voice participants in cloud
      for (const remoteUser of voiceUsers) {
        if (remoteUser.userId !== user?.id) {
          sendScreenSignalInCloud(activeVoiceChannel.id, user?.id, remoteUser.userId, 'screen_stopped', {});
        }
      }
    }

    if (socket && socket.connected && activeVoiceChannel) {
      socket.emit(SOCKET_EVENTS.SCREEN_STOP, {
        channelId: activeVoiceChannel.id
      });
    }

    // Close screen peer connections
    screenPeerConnectionsRef.current.forEach((pc) => pc.close());
    screenPeerConnectionsRef.current.clear();
  }, [socket, activeVoiceChannel, activePresenter, user?.id, voiceUsers]);

  const watchStream = (presenterUser, channel) => {
    if (!presenterUser) return;
    const targetChannel = channel || activeVoiceChannel;
    if (targetChannel && (!activeVoiceChannel || activeVoiceChannel.id !== targetChannel.id)) {
      joinVoice(targetChannel);
    }
    if (targetChannel && setActiveChannel) {
      setActiveChannel(targetChannel);
    }
    setActivePresenter({
      userId: presenterUser.userId,
      username: presenterUser.username,
      quality: screenQuality,
      fps: screenFps
    });

    // Notify presenter via Firestore that a viewer is ready to receive stream
    if (user?.id && presenterUser.userId && targetChannel?.id) {
      sendScreenSignalInCloud(targetChannel.id, user.id, presenterUser.userId, 'viewer_ready', {});
    }
  };

  // Synchronize presenter state with Firestore voice room updates
  useEffect(() => {
    const handleVoiceUpdate = (e) => {
      const { channelId, activePresenter: cloudPresenter } = e.detail || {};
      if (activeVoiceChannel && String(channelId) === String(activeVoiceChannel.id)) {
        if (!cloudPresenter) {
          setActivePresenter((prev) => {
            if (prev && prev.userId !== user?.id) {
              setRemoteScreenStreams(new Map());
              return null;
            }
            return prev;
          });
        }
      }
    };

    window.addEventListener('concord:voice_update', handleVoiceUpdate);
    return () => window.removeEventListener('concord:voice_update', handleVoiceUpdate);
  }, [activeVoiceChannel?.id, user?.id]);

  // Listen to Firestore WebRTC signals for pure Cloud/Hosting mode
  useEffect(() => {
    if (!user?.id) return;

    const unsubSignals = listenToScreenSignalsInCloud(user.id, async ({ fromUserId, type, data, channelId }) => {
      // 1. If we are the presenter and a viewer is ready, send them an offer
      if (type === 'viewer_ready') {
        if (isScreenSharing && localStreamRef.current) {
          createAndSendScreenOffer(fromUserId, channelId || activeVoiceChannel?.id, localStreamRef.current);
        }
      }

      // 2. If screen share stopped by presenter
      if (type === 'screen_stopped') {
        setRemoteScreenStreams((prev) => {
          const next = new Map(prev);
          next.delete(fromUserId);
          return next;
        });
        setActivePresenter((prev) => {
          if (prev && String(prev.userId) === String(fromUserId)) {
            return null;
          }
          return prev;
        });
        const pc = screenPeerConnectionsRef.current.get(fromUserId);
        if (pc) {
          pc.close();
          screenPeerConnectionsRef.current.delete(fromUserId);
        }
      }

      // 3. If we receive an offer from presenter
      if (type === 'offer') {
        try {
          const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
          screenPeerConnectionsRef.current.set(fromUserId, pc);

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              sendScreenSignalInCloud(channelId, user.id, fromUserId, 'candidate', event.candidate);
            }
          };

          pc.ontrack = (event) => {
            const [remoteStream] = event.streams;
            if (remoteStream) {
              setRemoteScreenStreams((prev) => {
                const next = new Map(prev);
                next.set(fromUserId, remoteStream);
                return next;
              });
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          sendScreenSignalInCloud(channelId, user.id, fromUserId, 'answer', answer);
        } catch (err) {
          console.error('Error handling cloud screen offer:', err);
        }
      }

      // 3. If presenter receives an answer from viewer
      if (type === 'answer') {
        try {
          const pc = screenPeerConnectionsRef.current.get(fromUserId);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
          }
        } catch (err) {
          console.error('Error handling cloud screen answer:', err);
        }
      }

      // 4. If either receives an ICE candidate
      if (type === 'candidate') {
        try {
          const pc = screenPeerConnectionsRef.current.get(fromUserId);
          if (pc && data) {
            await pc.addIceCandidate(new RTCIceCandidate(data));
          }
        } catch (err) {
          console.warn('Error adding cloud screen candidate:', err);
        }
      }
    });

    return () => {
      if (unsubSignals) unsubSignals();
    };
  }, [user?.id, isScreenSharing, activeVoiceChannel?.id]);

  // Clean up if leaving voice
  useEffect(() => {
    if (!activeVoiceChannel && isScreenSharing) {
      stopScreenShare();
    }
    if (!activeVoiceChannel) {
      setRemoteScreenStreams(new Map());
      setActivePresenter(null);
    }
  }, [activeVoiceChannel, isScreenSharing, stopScreenShare]);

  // Socket signaling listeners for Screen Share
  useEffect(() => {
    if (!socket) return;

    // Remote screen started
    socket.on(SOCKET_EVENTS.SCREEN_STARTED, ({ channelId, userId: presenterId, username: presenterName }) => {
      setActivePresenter({
        userId: presenterId,
        username: presenterName
      });
    });

    // Remote screen stopped
    socket.on(SOCKET_EVENTS.SCREEN_STOPPED, ({ userId: presenterId }) => {
      setRemoteScreenStreams((prev) => {
        const next = new Map(prev);
        next.delete(presenterId);
        return next;
      });

      if (activePresenter?.userId === presenterId) {
        setActivePresenter(null);
      }

      if (screenPeerConnectionsRef.current.has(presenterId)) {
        screenPeerConnectionsRef.current.get(presenterId).close();
        screenPeerConnectionsRef.current.delete(presenterId);
      }
    });

    // Handle incoming Screen Offer from presenter
    socket.on(SOCKET_EVENTS.SCREEN_OFFER, async ({ senderUserId, channelId, offer }) => {
      try {
        const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
        screenPeerConnectionsRef.current.set(senderUserId, pc);

        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            socket.emit(SOCKET_EVENTS.SCREEN_ICE_CANDIDATE, {
              targetUserId: senderUserId,
              channelId,
              candidate: event.candidate
            });
          }
        };

        pc.ontrack = (event) => {
          const [remoteStream] = event.streams;
          if (remoteStream) {
            setRemoteScreenStreams((prev) => {
              const next = new Map(prev);
              next.set(senderUserId, remoteStream);
              return next;
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit(SOCKET_EVENTS.SCREEN_ANSWER, {
          targetUserId: senderUserId,
          channelId,
          answer
        });
      } catch (err) {
        console.error('Error answering screen offer:', err);
      }
    });

    // Handle incoming Screen Answer
    socket.on(SOCKET_EVENTS.SCREEN_ANSWER, async ({ senderUserId, answer }) => {
      try {
        const pc = screenPeerConnectionsRef.current.get(senderUserId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (err) {
        console.error('Error handling screen answer:', err);
      }
    });

    // Handle incoming Screen ICE Candidate
    socket.on(SOCKET_EVENTS.SCREEN_ICE_CANDIDATE, async ({ senderUserId, candidate }) => {
      try {
        const pc = screenPeerConnectionsRef.current.get(senderUserId);
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.warn('Error adding screen ICE candidate:', err);
      }
    });

    return () => {
      socket.off(SOCKET_EVENTS.SCREEN_STARTED);
      socket.off(SOCKET_EVENTS.SCREEN_STOPPED);
      socket.off(SOCKET_EVENTS.SCREEN_OFFER);
      socket.off(SOCKET_EVENTS.SCREEN_ANSWER);
      socket.off(SOCKET_EVENTS.SCREEN_ICE_CANDIDATE);
    };
  }, [socket, activePresenter]);

  return (
    <ScreenShareContext.Provider
      value={{
        isScreenSharing,
        localScreenStream,
        remoteScreenStreams,
        screenQuality,
        screenFps,
        isPickerOpen,
        activePresenter,
        setScreenQuality,
        setScreenFps,
        setIsPickerOpen,
        startScreenShare,
        stopScreenShare,
        watchStream,
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
