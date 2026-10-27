import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare, UserPlus, Ban, ShieldOff, Gamepad2, Check, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { useDM } from '../context/DMContext';
import { usePresence } from '../context/PresenceContext';
import { useNotification } from '../context/NotificationContext';
import { getUserProfile, effectiveStatus, activeCustomStatus } from '../services/cloud/users';
import { roleOf, ROLE_LABELS } from '../services/permissions';
import { defaultAvatar } from '../services/cloud/util';

const STATUS_LABEL = { online: 'Online', idle: 'Ausente', dnd: 'Não perturbe', offline: 'Offline' };

function since(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

function playingFor(activity) {
  if (!activity?.since) return '';
  const min = Math.max(1, Math.round((Date.now() - activity.since) / 60000));
  return min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)} h`;
}

/** Floating profile card shown when clicking a user anywhere in the app. */
export default function ProfileCard({ userId, rect, onClose }) {
  const ref = useRef(null);
  const { user } = useAuth();
  const { servers, activeServer, setActiveServer } = useServer();
  const { friendList, outgoingRequests, openDMWithUser, sendFriendRequest, blockUser, unblockUser, isBlocked } = useDM();
  const { getProfile } = usePresence();
  const { showSuccess, showError } = useNotification();
  const [fetched, setFetched] = useState(null);
  const [pos, setPos] = useState({ top: rect.top, left: rect.right + 12 });

  const live = getProfile(userId);
  const profile = live || fetched;
  const isMe = userId === user.id;

  useEffect(() => {
    if (!live) getUserProfile(userId).then(setFetched).catch(() => setFetched({ id: userId, username: 'Usuário' }));
  }, [userId, live]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    let left = rect.right + 12;
    if (left + w > window.innerWidth - 8) left = Math.max(8, rect.left - w - 12);
    const top = Math.max(8, Math.min(rect.top - 20, window.innerHeight - h - 8));
    setPos({ top, left });
  }, [rect, profile]);

  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!profile) return null;

  const status = isMe ? (user.status === 'invisible' ? 'offline' : user.status) : effectiveStatus(profile);
  const custom = activeCustomStatus(profile);
  const mutual = servers.filter((s) => s.memberIds.includes(userId) && !isMe);
  const role = activeServer ? roleOf(activeServer, userId) : null;
  const isFriend = friendList.some((f) => f.id === userId);
  const pending = outgoingRequests.some((f) => f.id === userId);
  const blocked = isBlocked(userId);
  const banner = profile.bannerColor || '#5b4ae6';

  const run = async (fn, okTitle, okText) => {
    try {
      await fn();
      if (okTitle) showSuccess(okTitle, okText || '');
      onClose();
    } catch (err) {
      showError('Não foi possível concluir', err.message);
    }
  };

  return (
    <div ref={ref} className="profile-card" style={{ top: pos.top, left: pos.left }} role="dialog" aria-label={`Perfil de ${profile.username}`}>
      <div className="profile-banner" style={{ background: `linear-gradient(135deg, ${banner}, ${banner}99)` }} />
      <div className="profile-avatar-row">
        <div className="avatar-wrapper profile-avatar">
          <img src={profile.avatar || defaultAvatar(profile.username)} alt="" className="avatar-img" />
          <div className={`status-dot ${status}`} />
        </div>
      </div>

      <div className="profile-body">
        <div className="profile-name">{profile.username}</div>
        <div className="profile-tag">#{profile.userTag || userId.slice(0, 4).toUpperCase()} · {STATUS_LABEL[status] || 'Offline'}</div>

        {custom && <div className="profile-custom">{custom.emoji} {custom.text}</div>}

        {profile.activity?.name && (
          <div className="profile-section">
            <div className="profile-section-title">Jogando agora</div>
            <div className="profile-activity">
              <Gamepad2 size={18} />
              <div>
                <strong>{profile.activity.name}</strong>
                <span>{playingFor(profile.activity)}</span>
              </div>
            </div>
          </div>
        )}

        {profile.bio && (
          <div className="profile-section">
            <div className="profile-section-title">Sobre mim</div>
            <p className="profile-bio">{profile.bio}</p>
          </div>
        )}

        <div className="profile-section profile-facts">
          {role && <span className={`role-badge ${role}`}>{ROLE_LABELS[role]}</span>}
          {profile.createdAt && <span className="profile-fact"><Clock size={12} /> Membro desde {since(profile.createdAt)}</span>}
        </div>

        {mutual.length > 0 && (
          <div className="profile-section">
            <div className="profile-section-title">Servidores em comum — {mutual.length}</div>
            <div className="profile-mutual">
              {mutual.slice(0, 6).map((s) => (
                <button key={s.id} className="profile-server" title={s.name} onClick={() => { setActiveServer(s); onClose(); }}>
                  {s.icon ? <img src={s.icon} alt="" /> : s.name.slice(0, 2)}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isMe && (
          <div className="profile-actions">
            <button
              className="btn btn-primary"
              disabled={blocked}
              onClick={() => run(async () => {
                setActiveServer(null);
                await openDMWithUser({ id: userId, username: profile.username, avatar: profile.avatar });
              })}
            >
              <MessageSquare size={15} /> Mensagem
            </button>
            {!isFriend && !blocked && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() => run(() => sendFriendRequest(profile.username), 'Pedido enviado', `Pedido de amizade enviado para @${profile.username}.`)}
                title="Adicionar amigo"
              >
                {pending ? <Check size={15} /> : <UserPlus size={15} />}
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => run(() => (blocked ? unblockUser(userId) : blockUser(userId)))}
              title={blocked ? 'Desbloquear' : 'Bloquear'}
            >
              {blocked ? <ShieldOff size={15} /> : <Ban size={15} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
