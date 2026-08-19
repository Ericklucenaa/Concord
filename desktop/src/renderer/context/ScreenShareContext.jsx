import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useVoice } from './VoiceContext';
import { useServer } from './ServerContext';
import { updateVoiceScreenSharingInCloud } from '../services/cloudSync';
import { SOCKET_EVENTS, DEFAULT_ICE_SERVERS } from '@shared/constants';

const ScreenShareContext = createContext(null);

export function ScreenShareProvider({ children }) {
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
      alert('Clique em um canal de voz na barra lateral para conectar o áudio e a transmissão.');
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
              minWidth: 640,
              maxWidth: width,
              minHeight: 480,
              maxHeight: height,
              maxFrameRate: screenFps
            }
          }
        });
      } else {
        // Web / Fallback display media
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { max: width },
            height: { max: height },
            frameRate: { max: screenFps }
          },
          audio: true
        });
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

        // Send screen video track offer to all participants in voice room
        for (const remoteUser of voiceUsers) {
          if (remoteUser.userId === user?.id) continue;
          createAndSendScreenOffer(remoteUser.userId, currentVoice.id, stream);
        }
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        return; // User canceled the screen selection prompt
      }
      console.error('Error starting screen share:', err);
      alert('Não foi possível iniciar a transmissão de tela.');
    }
  };

  // Create Peer Connection and send Screen Offer
  const createAndSendScreenOffer = async (targetUserId, channelId, stream) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
      screenPeerConnectionsRef.current.set(targetUserId, pc);

      // Add screen video tracks
      stream.getVideoTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit(SOCKET_EVENTS.SCREEN_ICE_CANDIDATE, {
            targetUserId,
            channelId,
            candidate: event.candidate
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit(SOCKET_EVENTS.SCREEN_OFFER, {
        targetUserId,
        channelId,
        offer
      });
    } catch (err) {
      console.error(`Error sending screen offer to ${targetUserId}:`, err);
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
    }

    if (socket && socket.connected && activeVoiceChannel) {
      socket.emit(SOCKET_EVENTS.SCREEN_STOP, {
        channelId: activeVoiceChannel.id
      });
    }

    // Close screen peer connections
    screenPeerConnectionsRef.current.forEach((pc) => pc.close());
    screenPeerConnectionsRef.current.clear();
  }, [socket, activeVoiceChannel, activePresenter, user?.id]);

  const watchStream = (presenterUser, channel) => {
    if (!presenterUser) return;
    if (channel && (!activeVoiceChannel || activeVoiceChannel.id !== channel.id)) {
      joinVoice(channel);
    }
    if (channel && setActiveChannel) {
      setActiveChannel(channel);
    }
    setActivePresenter({
      userId: presenterUser.userId,
      username: presenterUser.username,
      quality: screenQuality,
      fps: screenFps
    });
  };

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
