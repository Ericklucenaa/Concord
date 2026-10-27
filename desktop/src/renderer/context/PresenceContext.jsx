import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useServer } from './ServerContext';
import { useDM } from './DMContext';
import { HEARTBEAT_MS, listenToUsers, sendHeartbeat, effectiveStatus, activeCustomStatus } from '../services/cloud/users';

const PresenceContext = createContext(null);

const IDLE_AFTER_MS = 10 * 60_000;

export function PresenceProvider({ children }) {
  const { user } = useAuth();
  const { activeServer } = useServer();
  const { friendList, threads } = useDM();
  const userId = user?.id;

  const [profiles, setProfiles] = useState(new Map());
  const [tick, setTick] = useState(0);
  const lastInputRef = useRef(Date.now());
  const autoIdleRef = useRef(false);

  // Own heartbeat, plus automatic "idle" after a period without input.
  useEffect(() => {
    if (!userId) return undefined;

    const beat = () => {
      const idle = Date.now() - lastInputRef.current > IDLE_AFTER_MS;
      autoIdleRef.current = idle;
      sendHeartbeat(userId, { autoIdle: idle });
    };
    const onInput = () => {
      lastInputRef.current = Date.now();
      if (autoIdleRef.current) beat();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') onInput();
    };
    const onLogout = () => sendHeartbeat(userId, { lastSeen: 0 });

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    window.addEventListener('keydown', onInput);
    window.addEventListener('pointerdown', onInput);
    window.addEventListener('focus', onInput);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('concord:before-logout', onLogout);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onInput);
      window.removeEventListener('pointerdown', onInput);
      window.removeEventListener('focus', onInput);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('concord:before-logout', onLogout);
    };
  }, [userId]);

  // Only watch the people currently relevant on screen.
  const watchedKey = useMemo(() => {
    const ids = new Set();
    (activeServer?.memberIds || []).forEach((id) => ids.add(id));
    friendList.forEach((f) => ids.add(f.id));
    threads.forEach((t) => t.participants.forEach((id) => ids.add(id)));
    if (userId) ids.add(userId);
    return Array.from(ids).sort().join(',');
  }, [activeServer?.memberIds, friendList, threads, userId]);

  useEffect(() => {
    if (!userId) {
      setProfiles(new Map());
      return undefined;
    }
    return listenToUsers(watchedKey ? watchedKey.split(',') : [], setProfiles);
  }, [watchedKey, userId]);

  // Re-evaluate online windows even when nothing new arrives.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const getProfile = useCallback((id) => profiles.get(id) || null, [profiles]);

  const getStatus = useCallback((id) => {
    if (id === userId) {
      return user?.status === 'invisible' ? 'offline' : (user?.status === 'online' && autoIdleRef.current ? 'idle' : user?.status || 'online');
    }
    return effectiveStatus(profiles.get(id));
    // `tick` forces periodic re-evaluation of the online window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, userId, user?.status, tick]);

  const getCustomStatus = useCallback((id) => activeCustomStatus(id === userId ? user : profiles.get(id)), [profiles, userId, user]);

  return (
    <PresenceContext.Provider value={{ profiles, getProfile, getStatus, getCustomStatus }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
