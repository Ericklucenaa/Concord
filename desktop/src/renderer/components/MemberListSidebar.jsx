import React, { useEffect, useMemo, useState } from 'react';
import { Shield, MicOff, Mic, UserX, UserCheck, Radio, Ban, Crown, MessageSquare, ShieldOff } from 'lucide-react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useScreenShare } from '../context/ScreenShareContext';
import { usePresence } from '../context/PresenceContext';
import { useDM } from '../context/DMContext';
import { useNotification } from '../context/NotificationContext';
import { useOverlayUI } from '../context/OverlayUIContext';
import { roleOf, isAdmin, isModerator, outranks, ROLE_LABELS } from '../services/permissions';
import { defaultAvatar } from '../services/cloud/util';

const GROUPS = [
  ['owner', 'Dono'],
  ['admin', 'Administradores'],
  ['moderator', 'Moderadores']
];

export default function MemberListSidebar() {
  const { showConfirm, showError, showSuccess } = useNotification();
  const { activeServer, setMemberRole, kickMember, banMember, setMemberMuted, transferOwnership, setActiveServer } = useServer();
  const { user } = useAuth();
  const { activeVoiceChannel, voiceUsers, voiceChannelUsersMap } = useVoice();
  const { watchStream } = useScreenShare();
  const { getProfile, getStatus, getCustomStatus } = usePresence();
  const { openDMWithUser, blockUser, unblockUser, isBlocked } = useDM();
  const [selectedId, setSelectedId] = useState(null);
  const { openProfile } = useOverlayUI();

  useEffect(() => setSelectedId(null), [activeServer?.id]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const close = (e) => {
      if (!e.target.closest('.member-menu') && !e.target.closest('.member-item')) setSelectedId(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [selectedId]);

  const members = useMemo(() => {
    if (!activeServer) return [];
    const voiceChannels = activeServer.channels.filter((c) => c.type === 'voice');
    return activeServer.memberIds.map((id) => {
      const profile = getProfile(id);
      let streamingChannel = null;
      for (const ch of voiceChannels) {
        const list = activeVoiceChannel?.id === ch.id ? voiceUsers : voiceChannelUsersMap.get(ch.id) || [];
        if (list.some((u) => u.userId === id && u.isScreenSharing)) {
          streamingChannel = ch;
          break;
        }
      }
      return {
        id,
        username: profile?.username || 'Carregando…',
        avatar: profile?.avatar || '',
        role: roleOf(activeServer, id),
        status: getStatus(id),
        custom: getCustomStatus(id),
        activity: profile?.activity?.name ? profile.activity : null,
        voiceMuted: activeServer.mutedIds.includes(id),
        streamingChannel
      };
    });
  }, [activeServer, getProfile, getStatus, getCustomStatus, activeVoiceChannel?.id, voiceUsers, voiceChannelUsersMap]);

  if (!activeServer) return null;

  const me = user.id;
  const canMod = isModerator(activeServer, me);
  const canAdmin = isAdmin(activeServer, me);
  const isOwner = activeServer.ownerId === me;

  const run = async (fn, success) => {
    setSelectedId(null);
    try {
      await fn();
      if (success) showSuccess('Pronto', success);
    } catch (err) {
      showError('Ação não permitida', err.message?.includes('permission') ? 'Você não tem permissão para isso.' : err.message);
    }
  };

  const onKick = async (m) => {
    if (await showConfirm('Expulsar membro', `Remover @${m.username} do servidor? A pessoa pode voltar com um novo convite.`, { isDanger: true, confirmText: 'Expulsar' })) {
      run(() => kickMember(activeServer.id, m), `@${m.username} foi expulso.`);
    }
  };

  const onBan = async (m) => {
    if (await showConfirm('Banir membro', `Banir @${m.username}? A pessoa não poderá voltar nem com convites.`, { isDanger: true, confirmText: 'Banir' })) {
      run(() => banMember(activeServer.id, m), `@${m.username} foi banido.`);
    }
  };

  const onTransfer = async (m) => {
    if (await showConfirm('Transferir propriedade', `Tornar @${m.username} o novo dono de "${activeServer.name}"? Você passará a ser admin.`, { isDanger: true, confirmText: 'Transferir' })) {
      run(() => transferOwnership(activeServer.id, m), `@${m.username} agora é o dono do servidor.`);
    }
  };

  const renderMember = (m) => {
    const isMe = m.id === me;
    const open = selectedId === m.id;
    const canActOn = !isMe && outranks(activeServer, me, m.id);

    return (
      <div
        key={m.id}
        className={`member-item ${m.status === 'offline' ? 'offline' : ''}`}
        onClick={(e) => openProfile(m.id, e)}
        onContextMenu={(e) => {
          e.preventDefault();
          setSelectedId(open ? null : m.id);
        }}
        title="Clique para ver o perfil · botão direito para ações"
      >
        <div className="avatar-wrapper">
          <img src={m.avatar || defaultAvatar(m.username)} alt="" className="avatar-img" />
          <div className={`status-dot ${m.status}`} />
        </div>
        <div className="member-info">
          <span className="member-item-name">{m.username}</span>
          {m.activity && m.status !== 'offline'
            ? <span className="member-custom-status activity">🎮 Jogando {m.activity.name}</span>
            : m.custom && <span className="member-custom-status">{`${m.custom.emoji || ''} ${m.custom.text || ''}`.trim()}</span>}
        </div>

        {m.streamingChannel && (
          <span
            className="live-badge"
            onClick={(e) => {
              e.stopPropagation();
              watchStream({ userId: m.id, username: m.username }, m.streamingChannel);
            }}
            title="Transmitindo — clique para assistir"
          >
            <Radio size={10} /> AO VIVO
          </span>
        )}
        {m.role !== 'member' && <span className={`role-badge ${m.role}`}>{ROLE_LABELS[m.role]}</span>}
        {m.voiceMuted && <MicOff size={13} className="danger-icon" title="Silenciado na voz por um moderador" />}

        {open && (
          <div className="dropdown-menu member-menu" onClick={(e) => e.stopPropagation()}>
            {!isMe && (
              <button className="menu-item" onClick={() => run(async () => {
                setActiveServer(null);
                await openDMWithUser({ id: m.id, username: m.username, avatar: m.avatar });
              })}>
                <MessageSquare size={14} /> Enviar mensagem
              </button>
            )}
            {canMod && !isMe && (
              <button className="menu-item" onClick={() => run(() => setMemberMuted(activeServer.id, m, !m.voiceMuted))}>
                {m.voiceMuted ? <Mic size={14} /> : <MicOff size={14} />}
                {m.voiceMuted ? 'Remover silêncio na voz' : 'Silenciar na voz'}
              </button>
            )}
            {canAdmin && canActOn && (
              <>
                {isOwner && m.role !== 'admin' && (
                  <button className="menu-item" onClick={() => run(() => setMemberRole(activeServer.id, m, 'admin'))}>
                    <Shield size={14} className="role-admin" /> Promover a admin
                  </button>
                )}
                {m.role !== 'moderator' && (
                  <button className="menu-item" onClick={() => run(() => setMemberRole(activeServer.id, m, 'moderator'))}>
                    <Shield size={14} className="role-mod" /> {m.role === 'admin' ? 'Rebaixar a moderador' : 'Promover a moderador'}
                  </button>
                )}
                {m.role !== 'member' && (
                  <button className="menu-item" onClick={() => run(() => setMemberRole(activeServer.id, m, 'member'))}>
                    <UserCheck size={14} /> Tornar membro
                  </button>
                )}
                {isOwner && (
                  <button className="menu-item" onClick={() => onTransfer(m)}>
                    <Crown size={14} /> Transferir propriedade
                  </button>
                )}
                <button className="menu-item danger" onClick={() => onKick(m)}>
                  <UserX size={14} /> Expulsar
                </button>
                <button className="menu-item danger" onClick={() => onBan(m)}>
                  <Ban size={14} /> Banir
                </button>
              </>
            )}
            {!isMe && (
              <button className="menu-item" onClick={() => run(() => (isBlocked(m.id) ? unblockUser(m.id) : blockUser(m.id)))}>
                {isBlocked(m.id) ? <ShieldOff size={14} /> : <Ban size={14} />}
                {isBlocked(m.id) ? 'Desbloquear' : 'Bloquear'}
              </button>
            )}
            {isMe && <div className="menu-hint">Este é você.</div>}
          </div>
        )}
      </div>
    );
  };

  const byRole = (role) => members.filter((m) => m.role === role);
  const regular = members.filter((m) => m.role === 'member');
  const online = regular.filter((m) => m.status !== 'offline');
  const offline = regular.filter((m) => m.status === 'offline');

  return (
    <aside className="member-sidebar">
      {GROUPS.map(([role, title]) => {
        const list = byRole(role);
        return list.length > 0 && (
          <div key={role}>
            <div className="member-group-title">{title} — {list.length}</div>
            {list.map(renderMember)}
          </div>
        );
      })}
      {online.length > 0 && (
        <div>
          <div className="member-group-title">Online — {online.length}</div>
          {online.map(renderMember)}
        </div>
      )}
      {offline.length > 0 && (
        <div>
          <div className="member-group-title">Offline — {offline.length}</div>
          {offline.map(renderMember)}
        </div>
      )}
    </aside>
  );
}
