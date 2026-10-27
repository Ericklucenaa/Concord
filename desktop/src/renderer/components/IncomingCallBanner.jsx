import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDM } from '../context/DMContext';
import { useVoice } from '../context/VoiceContext';
import { useServer } from '../context/ServerContext';
import { listenToThreadVoice } from '../services/cloud/voice';
import { describeThread } from '../services/cloud/dms';
import { soundSynthesizer } from '../services/soundEffects';
import { showNativeNotification } from '../services/notificationService';
import { defaultAvatar } from '../services/cloud/util';

const WATCHED_THREADS = 15;

/** Rings when someone starts a call in one of my recent DM conversations. */
export default function IncomingCallBanner() {
  const { user } = useAuth();
  const { threads, openThread, blockedIds } = useDM();
  const { activeVoiceChannel, joinVoice } = useVoice();
  const { setActiveServer } = useServer();
  const [calls, setCalls] = useState(new Map()); // threadId -> participants
  const [dismissed, setDismissed] = useState(new Set());
  const ringRef = useRef(null);

  const watched = threads.slice(0, WATCHED_THREADS).map((t) => t.id).join(',');
  useEffect(() => {
    if (!watched || !user) return undefined;
    const unsubs = watched.split(',').map((threadId) =>
      listenToThreadVoice(threadId, (byChannel) => {
        const people = byChannel.get(threadId) || [];
        setCalls((prev) => new Map(prev).set(threadId, people));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [watched, user]);

  const incoming = threads.find((t) => {
    const people = calls.get(t.id) || [];
    return people.length > 0
      && !people.some((p) => p.userId === user?.id)
      && !people.every((p) => blockedIds.includes(p.userId))
      && activeVoiceChannel?.threadId !== t.id
      && !dismissed.has(`${t.id}:${people[0]?.joinedAt}`);
  });
  const caller = incoming ? (calls.get(incoming.id) || [])[0] : null;
  const dismissKey = incoming ? `${incoming.id}:${caller?.joinedAt}` : null;

  // Ring every 2.5 s while the call is waiting (not in "não perturbe").
  useEffect(() => {
    clearInterval(ringRef.current);
    if (!incoming || user?.status === 'dnd') return undefined;
    const info = describeThread(incoming, user.id);
    showNativeNotification(`📞 ${caller?.username || info.title} está ligando`, { body: 'Clique para atender no Concord', tag: `call_${incoming.id}` });
    soundSynthesizer.play('notification');
    ringRef.current = setInterval(() => soundSynthesizer.play('notification'), 2500);
    const stopAfter = setTimeout(() => clearInterval(ringRef.current), 30_000);
    return () => {
      clearInterval(ringRef.current);
      clearTimeout(stopAfter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissKey]);

  if (!incoming) return null;
  const info = describeThread(incoming, user.id);

  const accept = () => {
    setActiveServer(null);
    openThread(incoming.id);
    joinVoice({ id: incoming.id, name: info.title, threadId: incoming.id });
  };

  return (
    <div className="incoming-call" role="alertdialog" aria-label="Chamada recebida">
      <img src={caller?.avatar || defaultAvatar(caller?.username)} alt="" className="incoming-call-avatar" />
      <div className="incoming-call-text">
        <strong>{incoming.isGroup ? info.title : caller?.username}</strong>
        <span>{incoming.isGroup ? `${caller?.username} iniciou uma chamada` : 'está ligando para você…'}</span>
      </div>
      <button className="call-btn decline" onClick={() => setDismissed((prev) => new Set(prev).add(dismissKey))} aria-label="Recusar">
        <PhoneOff size={18} />
      </button>
      <button className="call-btn accept" onClick={accept} aria-label="Atender">
        <Phone size={18} />
      </button>
    </div>
  );
}
