import React, { useMemo } from 'react';
import { MicOff, Radio } from 'lucide-react';
import { useServer } from '../context/ServerContext';
import { useVoice } from '../context/VoiceContext';
import { useScreenShare } from '../context/ScreenShareContext';
import { usePresence } from '../context/PresenceContext';
import { useOverlayUI } from '../context/OverlayUIContext';
import { roleOf, ROLE_LABELS } from '../services/permissions';
import { useUserMenu } from './useUserMenu';
import { defaultAvatar } from '../services/cloud/util';

const GROUPS = [
  ['owner', 'Dono'],
  ['admin', 'Administradores'],
  ['moderator', 'Moderadores']
];

export default function MemberListSidebar() {
  const { activeServer } = useServer();
  const { activeVoiceChannel, voiceUsers, voiceChannelUsersMap } = useVoice();
  const { watchStream } = useScreenShare();
  const { getProfile, getStatus, getCustomStatus } = usePresence();
  const { openProfile } = useOverlayUI();
  const openUserMenu = useUserMenu();

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

  const renderMember = (m) => (
    <div
      key={m.id}
      className={`member-item ${m.status === 'offline' ? 'offline' : ''}`}
      role="button"
      tabIndex={0}
      onClick={(e) => openProfile(m.id, e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openProfile(m.id, e);
      }}
      onContextMenu={(e) => openUserMenu(e, m, { server: activeServer })}
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
    </div>
  );

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
