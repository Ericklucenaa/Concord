import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useVoice } from '../context/VoiceContext';
import { useScreenShare } from '../context/ScreenShareContext';
import { listenToUserPresenceInCloud } from '../services/cloudSync';
import { api } from '../services/api';
import { ROLES, USER_STATUS } from '@shared/constants';
import { Shield, ShieldAlert, MoreVertical, MicOff, UserX, UserCheck, Radio, Tv } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

export default function MemberListSidebar() {
  const { showConfirm } = useNotification();
  const { activeServer, serverMembers, refreshServerDetails } = useServer();
  const { user } = useAuth();
  const { userStatuses } = useSocket();
  const { activeVoiceChannel, voiceUsers, voiceChannelUsersMap } = useVoice();
  const { watchStream } = useScreenShare();

  const [selectedMember, setSelectedMember] = useState(null);
  const [cloudStatuses, setCloudStatuses] = useState(new Map());

  useEffect(() => {
    const unsub = listenToUserPresenceInCloud((statusMap) => {
      setCloudStatuses(statusMap);
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  if (!activeServer) return null;

  const myRole = activeServer.role;
  const isOwner = myRole === ROLES.OWNER;
  const isAdmin = myRole === ROLES.ADMIN;
  const isMod = myRole === ROLES.MODERATOR;
  const canModerate = isOwner || isAdmin || isMod;

  const voiceChannels = activeServer.channels?.filter((c) => c.type === 'voice') || [];

  // Group members
  const owners = [];
  const admins = [];
  const moderators = [];
  const onlineMembers = [];
  const offlineMembers = [];

  serverMembers.forEach((member) => {
    const isMe = member.id === user?.id;
    const realStatus = userStatuses?.get(member.id) 
      || cloudStatuses.get(String(member.id)) 
      || cloudStatuses.get(member.username?.toLowerCase()) 
      || (isMe ? 'online' : (member.status || USER_STATUS.OFFLINE));
    
    // Check if this member is currently streaming
    let streamingChannel = null;
    for (const ch of voiceChannels) {
      const usersInCh = activeVoiceChannel?.id === ch.id ? voiceUsers : (voiceChannelUsersMap.get(ch.id) || []);
      if (usersInCh.some((u) => (String(u.userId) === String(member.id) || u.username === member.username) && u.isScreenSharing)) {
        streamingChannel = ch;
        break;
      }
    }

    const memberWithStatus = { 
      ...member, 
      status: realStatus,
      isStreaming: Boolean(streamingChannel),
      streamingChannel
    };

    if (member.role === ROLES.OWNER) {
      owners.push(memberWithStatus);
    } else if (member.role === ROLES.ADMIN) {
      admins.push(memberWithStatus);
    } else if (member.role === ROLES.MODERATOR) {
      moderators.push(memberWithStatus);
    } else if (realStatus !== USER_STATUS.OFFLINE) {
      onlineMembers.push(memberWithStatus);
    } else {
      offlineMembers.push(memberWithStatus);
    }
  });

  const handleMute = async (targetMember) => {
    try {
      await api.muteMember(activeServer.id, targetMember.id, !targetMember.mutedByAdmin);
      refreshServerDetails(activeServer.id);
      setSelectedMember(null);
    } catch (err) {
      setSelectedMember(null);
    }
  };

  const handleKick = async (targetMember) => {
    const confirmed = await showConfirm(
      'Remover Membro',
      `Tem certeza que deseja remover @${targetMember.username} do servidor?`,
      { isDanger: true, confirmText: 'Remover Membro' }
    );
    if (!confirmed) return;
    try {
      await api.kickMember(activeServer.id, targetMember.id);
      refreshServerDetails(activeServer.id);
      setSelectedMember(null);
    } catch (err) {
      setSelectedMember(null);
    }
  };

  const handleChangeRole = async (targetMember, newRole) => {
    try {
      await api.updateMemberRole(activeServer.id, targetMember.id, newRole);
      refreshServerDetails(activeServer.id);
      setSelectedMember(null);
    } catch (err) {
      setSelectedMember(null);
    }
  };

  const renderMemberItem = (member) => {
    const isMe = member.id === user?.id;
    const isSelected = selectedMember?.id === member.id;

    return (
      <div 
        key={member.id} 
        className="member-item"
        onClick={() => {
          if (member.isStreaming && member.streamingChannel) {
            watchStream({ userId: member.id, username: member.username }, member.streamingChannel);
          } else if (canModerate && !isMe) {
            setSelectedMember(isSelected ? null : member);
          }
        }}
        style={{ position: 'relative', cursor: 'pointer' }}
      >
        <div className="avatar-wrapper">
          <img 
            src={member.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${member.username}`} 
            alt="" 
            className="avatar-img" 
          />
          <div className={`status-dot ${member.status || 'offline'}`} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, flex: 1 }}>
          <span className="member-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {member.username}
          </span>
          {member.customStatus && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
              {member.customStatus}
            </span>
          )}
        </div>

        {member.isStreaming && (
          <span 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 3, 
              fontSize: 9, 
              backgroundColor: 'var(--accent-danger)', 
              color: '#fff', 
              padding: '2px 5px', 
              borderRadius: 3, 
              fontWeight: 800, 
              marginLeft: 'auto',
              cursor: 'pointer',
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)'
            }}
            onClick={(e) => {
              e.stopPropagation();
              watchStream({ userId: member.id, username: member.username }, member.streamingChannel);
            }}
            title="Transmitindo Ao Vivo - Clique para assistir"
          >
            <Radio size={10} />
            AO VIVO
          </span>
        )}

        {member.role === ROLES.OWNER && <span className="role-badge owner">Dono</span>}
        {member.role === ROLES.ADMIN && <span className="role-badge admin">Admin</span>}
        {member.role === ROLES.MODERATOR && <span className="role-badge moderator">Mod</span>}
        {Boolean(member.mutedByAdmin) && <MicOff size={13} style={{ color: 'var(--accent-danger)', marginLeft: 4 }} title="Silenciado pelo admin" />}

        {/* Action Menu */}
        {isSelected && (
          <div 
            className="dropdown-menu"
            style={{
              position: 'absolute',
              top: '36px',
              right: '0',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-color)',
              padding: '6px',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              width: '180px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="btn btn-secondary" 
              style={{ fontSize: 12, padding: '6px 8px', justifyContent: 'flex-start', border: 'none' }}
              onClick={() => handleMute(member)}
            >
              <MicOff size={14} />
              {member.mutedByAdmin ? 'Remover Mute' : 'Silenciar na Voz'}
            </button>

            {isOwner && member.role !== ROLES.ADMIN && (
              <button 
                className="btn btn-secondary" 
                style={{ fontSize: 12, padding: '6px 8px', justifyContent: 'flex-start', border: 'none' }}
                onClick={() => handleChangeRole(member, ROLES.ADMIN)}
              >
                <Shield size={14} style={{ color: '#818cf8' }} />
                Promover a Admin
              </button>
            )}

            {(isOwner || isAdmin) && member.role !== ROLES.MODERATOR && (
              <button 
                className="btn btn-secondary" 
                style={{ fontSize: 12, padding: '6px 8px', justifyContent: 'flex-start', border: 'none' }}
                onClick={() => handleChangeRole(member, ROLES.MODERATOR)}
              >
                <Shield size={14} style={{ color: '#10b981' }} />
                Promover a Mod
              </button>
            )}

            {(isOwner || isAdmin) && member.role !== ROLES.MEMBER && (
              <button 
                className="btn btn-secondary" 
                style={{ fontSize: 12, padding: '6px 8px', justifyContent: 'flex-start', border: 'none' }}
                onClick={() => handleChangeRole(member, ROLES.MEMBER)}
              >
                <UserCheck size={14} />
                Tornar Membro
              </button>
            )}

            <button 
              className="btn btn-danger" 
              style={{ fontSize: 12, padding: '6px 8px', justifyContent: 'flex-start' }}
              onClick={() => handleKick(member)}
            >
              <UserX size={14} />
              Expulsar Membro
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="member-sidebar">
      {owners.length > 0 && (
        <div>
          <div className="member-group-title">Proprietário — {owners.length}</div>
          {owners.map(renderMemberItem)}
        </div>
      )}

      {admins.length > 0 && (
        <div>
          <div className="member-group-title">Administradores — {admins.length}</div>
          {admins.map(renderMemberItem)}
        </div>
      )}

      {moderators.length > 0 && (
        <div>
          <div className="member-group-title">Moderadores — {moderators.length}</div>
          {moderators.map(renderMemberItem)}
        </div>
      )}

      {onlineMembers.length > 0 && (
        <div>
          <div className="member-group-title">Membros Online — {onlineMembers.length}</div>
          {onlineMembers.map(renderMemberItem)}
        </div>
      )}

      {offlineMembers.length > 0 && (
        <div>
          <div className="member-group-title">Offline — {offlineMembers.length}</div>
          {offlineMembers.map(renderMemberItem)}
        </div>
      )}
    </aside>
  );
}
