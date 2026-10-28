import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useScreenShare } from '../context/ScreenShareContext';
import {
  Hash,
  Volume2,
  VolumeX,
  Plus,
  ChevronDown,
  UserPlus,
  Settings,
  LogOut,
  Trash2,
  Image as ImageIcon,
  Mic,
  MicOff,
  Headphones,
  Tv,
  PhoneOff,
  Radio,
  X,
  Sparkles,
  Lock,
  Copy,
  Megaphone,
  Signal,
  PlusCircle,
  CalendarDays,
  Check,
  CheckCheck,
  Bell,
  BellOff,
  Pencil,
  FolderPlus
} from 'lucide-react';
import { CHANNEL_TYPES } from '@shared/constants';
import SoundboardModal from './SoundboardModal';
import { useUserMenu } from './useUserMenu';
import ChannelSettingsModal from './modals/ChannelSettingsModal';
import UserFooter from './UserFooter';
import EventsModal from './modals/EventsModal';
import { useOverlayUI } from '../context/OverlayUIContext';
import { MUTE_DURATIONS } from '../services/cloud/userSettings';
import { useNotification } from '../context/NotificationContext';
import { useUnread } from '../context/UnreadContext';
import { isAdmin, isChannelReadOnly, channelAllowedRoles } from '../services/permissions';

const QUALITY_LABEL = {
  good: 'Conexão boa',
  ok: 'Conexão instável',
  bad: 'Conexão ruim',
  connecting: 'Conectando…',
  failed: 'Sem conexão',
  unknown: 'Conectado'
};

export default function ChannelSidebar() {
  const { showConfirm, showError } = useNotification();
  const { openMenu } = useOverlayUI();
  const openUserMenu = useUserMenu();
  const {
    activeServer,
    activeChannel,
    visibleChannels,
    setActiveChannel,
    openModal,
    deleteServer,
    leaveServer,
    deleteChannel,
    tempChannels,
    events,
    reorderChannels,
    addCategory,
    renameCategory,
    deleteCategory
  } = useServer();
  const {
    isChannelUnread, channelMentionCount, isChannelMuted, muteChannel, muteServer,
    isServerMuted: isServerNotifMuted, serverNotifyLevel, setServerNotify, markRead, markServerRead
  } = useUnread();
  const [editingChannel, setEditingChannel] = useState(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [collapsedCategories, setCollapsedCategories] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('concord_collapsed_categories') || '[]');
    } catch {
      return [];
    }
  });
  const { user } = useAuth();
  const { 
    activeVoiceChannel, 
    voiceUsers, 
    voiceChannelUsersMap,
    joinVoice, 
    leaveVoice, 
    isMuted, 
    isDeafened, 
    isSpeaking,
    toggleMute,
    toggleDeafen,
    userVolumes,
    connectionQuality,
    averagePing,
    isServerMuted
  } = useVoice();
  const { 
    isScreenSharing, 
    setIsPickerOpen, 
    stopScreenShare, 
    watchStream
  } = useScreenShare();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSoundboardOpen, setIsSoundboardOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [activeServer?.id, activeChannel?.id]);


  if (!activeServer) {
    return (
      <aside className="channel-sidebar">
        <div className="server-header">
          <span className="server-header-title">Concord</span>
        </div>
        <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13, flex: 1 }}>
          Selecione ou crie um servidor à esquerda para começar a conversar.
        </div>
        <UserFooter />
      </aside>
    );
  }

  const isStaff = isAdmin(activeServer, user?.id);
  const isServerOwner = activeServer.ownerId === user?.id;
  const textChannels = visibleChannels.filter((c) => c.type === CHANNEL_TYPES.TEXT);
  const voiceChannels = visibleChannels.filter((c) => c.type === CHANNEL_TYPES.VOICE);

  // --- Channel groups (categories), drag & drop, menus -------------------------------

  const renderTextChannel = (channel) => {
            const isActive = activeChannel?.id === channel.id;
            const muted = isChannelMuted(channel.id);
            const unread = !isActive && !muted && isChannelUnread(channel.id);
            const mentions = channelMentionCount(channel.id);
            const ChannelIcon = isChannelReadOnly(activeServer, channel.id) ? Megaphone : Hash;
            return (
              <div
                key={channel.id}
                className={`channel-item ${isActive ? 'active' : ''} ${unread ? 'unread' : ''} ${muted ? 'muted' : ''} ${dragOverId === channel.id ? 'drag-over' : ''}`}
                onClick={() => setActiveChannel(channel)}
                onContextMenu={(e) => openChannelMenu(e, channel)}
                {...dragProps(channel)}
                style={{ justifyContent: 'space-between' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <ChannelIcon className="channel-icon" />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {channel.name}
                  </span>
                  {channelAllowedRoles(activeServer, channel.id) && <Lock size={11} className="muted-icon" />}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {mentions > 0 && <span className="badge-counter inline">{mentions}</span>}
                  <button
                    className="icon-btn channel-hover-action"
                    style={{ padding: 2, opacity: 0.6 }}
                    title="Convidar para este canal"
                    onClick={(e) => {
                      e.stopPropagation();
                      openModal('invite', channel.id);
                    }}
                  >
                    <UserPlus size={13} />
                  </button>
                  {isStaff && (
                    <button
                      className="icon-btn channel-hover-action"
                      style={{ padding: 2, opacity: 0.6 }}
                      title="Configurações do canal"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingChannel(channel);
                      }}
                    >
                      <Settings size={13} />
                    </button>
                  )}
                  {isStaff && textChannels.length > 1 && (
                    <button 
                      className="icon-btn hover-danger channel-hover-action" 
                      style={{ padding: 2, opacity: 0.6 }}
                      title="Excluir Canal de Texto"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const confirmed = await showConfirm(
                          'Excluir Canal de Texto', 
                          `Tem certeza que deseja excluir o canal de texto #${channel.name}?`,
                          { isDanger: true, confirmText: 'Excluir Canal' }
                        );
                        if (confirmed) {
                          deleteChannel(activeServer.id, channel.id);
                        }
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
  };

  const renderVoiceChannel = (channel) => {
            const isConnectedToThis = activeVoiceChannel?.id === channel.id;
            let currentUsersInChannel = isConnectedToThis 
              ? voiceUsers 
              : (voiceChannelUsersMap.get(channel.id) || []);

            if (!isConnectedToThis && user) {
              currentUsersInChannel = currentUsersInChannel.filter(
                (u) => String(u.userId) !== String(user.id) && u.username?.toLowerCase() !== user.username?.toLowerCase()
              );
            }

            const seenUsers = new Set();
            currentUsersInChannel = currentUsersInChannel.filter((u) => {
              if (!u) return false;
              const key = (u.userId || '') + '_' + (u.username || '');
              if (seenUsers.has(key)) return false;
              seenUsers.add(key);
              return true;
            });

            return (
              <div key={channel.id} style={{ marginBottom: 4 }}>
                <div
                  className={`channel-item ${isConnectedToThis ? 'active' : ''} ${channel.isLobby ? 'lobby' : ''} ${dragOverId === channel.id ? 'drag-over' : ''}`}
                  onClick={() => {
                    if (channel.isLobby) {
                      joinVoice({ ...channel, serverId: activeServer.id });
                      return;
                    }
                    if (!isConnectedToThis) {
                      joinVoice(channel);
                    }
                    setActiveChannel(channel);
                  }}
                  onContextMenu={(e) => openChannelMenu(e, channel)}
                  {...dragProps(channel)}
                  style={{ justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    {channel.isLobby ? (
                      <PlusCircle className="channel-icon" />
                    ) : (
                      <Volume2
                        className="channel-icon"
                        style={{ color: isConnectedToThis || currentUsersInChannel.length > 0 ? 'var(--accent-success)' : undefined }}
                      />
                    )}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {channel.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      className="icon-btn channel-hover-action"
                      style={{ padding: 2, opacity: 0.6 }}
                      title="Convidar para este canal"
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal('invite', channel.id);
                      }}
                    >
                      <UserPlus size={13} />
                    </button>
                    {isStaff && !channel.temporary && (
                      <button
                        className="icon-btn channel-hover-action"
                        style={{ padding: 2, opacity: 0.6 }}
                        title="Configurações do canal"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChannel(channel);
                        }}
                      >
                        <Settings size={13} />
                      </button>
                    )}
                    {isStaff && !channel.temporary && voiceChannels.length > 1 && (
                      <button 
                        className="icon-btn hover-danger channel-hover-action" 
                        style={{ padding: 2, opacity: 0.6 }}
                        title="Excluir Canal de Voz"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmed = await showConfirm(
                            'Excluir Canal de Voz',
                            `Tem certeza que deseja excluir o canal de voz "${channel.name}"?`,
                            { isDanger: true, confirmText: 'Excluir Canal' }
                          );
                          if (confirmed) {
                            deleteChannel(activeServer.id, channel.id);
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Users in Voice Channel (Discord style) */}
                {currentUsersInChannel.length > 0 && (
                  <div className="voice-users-list" style={{ paddingLeft: 20, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {currentUsersInChannel.map((u) => {
                      const isMe = u.userId === user?.id;
                      const speaking = isMe ? isSpeaking : u.isSpeaking;
                      const muted = isMe ? isMuted : u.isMuted;
                      const deafened = isMe ? isDeafened : u.isDeafened;
                      const currentVol = userVolumes?.get(u.userId) !== undefined ? userVolumes.get(u.userId) : 1;
                      const isUserLocallyMuted = currentVol === 0;

                      return (
                        <div 
                          key={u.userId} 
                          className={`voice-user-pill ${speaking ? 'speaking' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (u.isScreenSharing) watchStream(u, channel);
                            else openUserMenu(e, { id: u.userId, username: u.username, avatar: u.avatar }, { server: activeServer });
                          }}
                          onContextMenu={(e) => openUserMenu(e, { id: u.userId, username: u.username, avatar: u.avatar }, { server: activeServer })}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 8px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            margin: '2px 0',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          title={u.isScreenSharing ? 'Transmitindo ao vivo — clique para assistir, botão direito para opções' : `Clique para volume, perfil e ações de @${u.username}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                            <div style={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
                              <img 
                                src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`} 
                                alt="" 
                                style={{ 
                                  width: 22, 
                                  height: 22, 
                                  borderRadius: 'var(--radius-full)', 
                                  objectFit: 'cover',
                                  border: speaking ? '2px solid var(--accent-success)' : '1px solid transparent',
                                  boxShadow: speaking ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
                                  transition: 'all 0.15s ease'
                                }} 
                              />
                            </div>
                            <span style={{ 
                              fontSize: 13, 
                              fontWeight: 600, 
                              color: isMe ? 'var(--text-primary)' : 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {u.username}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {isUserLocallyMuted && !isMe && (
                              <VolumeX size={12} style={{ color: 'var(--accent-danger)' }} title="Silenciado localmente" />
                            )}
                            {u.isScreenSharing && (
                              <span 
                                style={{ 
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: 9, 
                                  backgroundColor: 'var(--accent-danger)', 
                                  padding: '2px 5px', 
                                  borderRadius: 3, 
                                  color: '#fff', 
                                  fontWeight: 800,
                                  boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  watchStream(u, channel);
                                }}
                                title="Clique para assistir transmissão"
                              >
                                <Radio size={10} />
                                AO VIVO
                              </span>
                            )}
                            {muted && <MicOff size={13} style={{ color: 'var(--accent-danger)' }} title="Microfone Mutado" />}
                            {deafened && <Headphones size={13} style={{ color: 'var(--accent-danger)' }} title="Áudio Desativado" />}
                          </div>
                        </div>
                      );
                    })}

                    {isConnectedToThis && (
                      <button
                        onClick={() => openModal('invite', channel.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 8px',
                          marginTop: 2,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'left',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <UserPlus size={14} style={{ opacity: 0.8 }} />
                        <span>Convidar para voz</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
  };

  const categories = activeServer.categories || [];
  const byCategory = (catId) => visibleChannels.filter((c) => (c.categoryId || null) === catId);
  const withTempRooms = (list) => list.flatMap((c) => (c.isLobby ? [c, ...tempChannels.filter((t) => t.lobbyId === c.id)] : [c]));
  const groups = [
    { id: 'text', title: 'Canais de texto', category: null, channels: byCategory(null).filter((c) => c.type === CHANNEL_TYPES.TEXT) },
    { id: 'voice', title: 'Canais de voz', category: null, channels: withTempRooms(byCategory(null).filter((c) => c.type === CHANNEL_TYPES.VOICE)) },
    ...categories.map((cat) => ({ id: cat.id, title: cat.name, category: cat, channels: withTempRooms(byCategory(cat.id)) }))
  ].filter((g) => g.channels.length > 0 || g.category || isStaff);

  const nextEvent = events.find((e) => e.startsAt > Date.now() - 3 * 3_600_000);
  const nextEventLabel = nextEvent
    ? (nextEvent.startsAt <= Date.now() ? `Agora: ${nextEvent.title}` : `${nextEvent.title} · ${new Date(nextEvent.startsAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`)
    : '';

  const toggleCategory = (id) => {
    setCollapsedCategories((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem('concord_collapsed_categories', JSON.stringify(next));
      } catch {
        // Collapsed state is a convenience.
      }
      return next;
    });
  };

  const dragProps = (channel) => (isStaff && !channel.temporary ? {
    draggable: true,
    onDragStart: (e) => {
      setDragId(channel.id);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e) => {
      if (dragId && dragId !== channel.id) {
        e.preventDefault();
        setDragOverId(channel.id);
      }
    },
    onDrop: (e) => {
      e.preventDefault();
      dropOnChannel(channel);
    }
  } : {});

  const saveOrder = (ordered) => {
    reorderChannels(activeServer.id, ordered).catch((err) => showError('Reordenar canais', err.message));
    setDragId(null);
    setDragOverId(null);
  };

  const dropOnChannel = (target) => {
    if (!dragId || dragId === target.id) return;
    const list = activeServer.channels.map((c) => ({ ...c }));
    const from = list.findIndex((c) => c.id === dragId);
    if (from < 0) return;
    const [moved] = list.splice(from, 1);
    moved.categoryId = target.categoryId || null;
    const to = list.findIndex((c) => c.id === target.id);
    list.splice(to, 0, moved);
    saveOrder(list);
  };

  const dropOnCategory = (group) => {
    if (!dragId) return;
    const list = activeServer.channels.map((c) => ({ ...c }));
    const from = list.findIndex((c) => c.id === dragId);
    if (from < 0) return;
    const [moved] = list.splice(from, 1);
    moved.categoryId = group.category ? group.category.id : null;
    list.push(moved);
    saveOrder(list);
  };

  const muteItems = (kind, id, mutedNow) => (mutedNow
    ? [{ label: 'Reativar notificações', icon: Bell, onClick: () => (kind === 'server' ? muteServer(id, null) : muteChannel(id, null)) }]
    : [
        { heading: kind === 'server' ? 'Silenciar servidor' : 'Silenciar canal' },
        ...Object.entries({ '15m': '15 minutos', '1h': '1 hora', '8h': '8 horas', '24h': '24 horas', forever: 'Até eu reativar' })
          .map(([key, label]) => ({
            label,
            icon: BellOff,
            onClick: () => (kind === 'server' ? muteServer(id, MUTE_DURATIONS[key]) : muteChannel(id, MUTE_DURATIONS[key]))
          }))
      ]);

  const openChannelMenu = (e, channel) => {
    openMenu(e, [
      channel.type === CHANNEL_TYPES.TEXT && { label: 'Marcar como lido', icon: CheckCheck, onClick: () => markRead(channel.id) },
      { label: 'Convidar para este canal', icon: UserPlus, onClick: () => openModal('invite', channel.id) },
      channel.type === CHANNEL_TYPES.TEXT && { separator: true },
      ...(channel.type === CHANNEL_TYPES.TEXT ? muteItems('channel', channel.id, isChannelMuted(channel.id)) : []),
      { separator: true },
      { label: 'Copiar ID do canal', icon: Copy, onClick: () => navigator.clipboard.writeText(channel.id) },
      isStaff && !channel.temporary && { label: 'Configurações do canal', icon: Settings, onClick: () => setEditingChannel(channel) },
      isStaff && !channel.temporary && {
        label: 'Excluir canal',
        icon: Trash2,
        danger: true,
        onClick: async () => {
          if (await showConfirm('Excluir canal', `Excluir "${channel.name}"?`, { isDanger: true, confirmText: 'Excluir' })) {
            deleteChannel(activeServer.id, channel.id);
          }
        }
      }
    ], channel.name);
  };

  const openCategoryMenu = (e, category) => {
    if (!isStaff) return;
    openMenu(e, [
      { label: 'Renomear categoria', icon: Pencil, onClick: () => setRenamingCategory(category.id) },
      { label: 'Criar canal aqui', icon: Plus, onClick: () => openModal('createChannel', category.id) },
      { separator: true },
      {
        label: 'Excluir categoria',
        icon: Trash2,
        danger: true,
        onClick: async () => {
          if (await showConfirm('Excluir categoria', `Excluir "${category.name}"? Os canais continuam existindo, fora de categorias.`, { isDanger: true, confirmText: 'Excluir' })) {
            deleteCategory(activeServer.id, category);
          }
        }
      }
    ], category.name);
  };

  return (
    <aside className="channel-sidebar">
      {/* Server Header Dropdown */}
      <div 
        className="server-header" 
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        style={{ position: 'relative' }}
      >
        <span className="server-header-title">{activeServer.name}</span>
        <ChevronDown size={18} style={{ transform: isMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />

        {isMenuOpen && (
          <div 
            className="dropdown-menu"
            style={{
              position: 'absolute',
              top: '50px',
              left: '8px',
              right: '8px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-color)',
              padding: '6px',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isStaff && (
              <>
                <button 
                  className="dropdown-item btn-secondary" 
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
                  onClick={() => { setIsMenuOpen(false); openModal('serverSettings'); }}
                >
                  <Settings size={16} style={{ color: 'var(--accent-primary)' }} />
                  Configurações do Servidor
                </button>
                <button 
                  className="dropdown-item btn-secondary" 
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
                  onClick={() => { setIsMenuOpen(false); openModal('serverSettings'); }}
                >
                  <ImageIcon size={16} style={{ color: 'var(--accent-primary)' }} />
                  Trocar Foto / Nome
                </button>
                <button 
                  className="dropdown-item btn-secondary" 
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
                  onClick={() => { setIsMenuOpen(false); openModal('invite'); }}
                >
                  <UserPlus size={16} style={{ color: 'var(--accent-success)' }} />
                  Convidar Pessoas (Link)
                </button>
                <button 
                  className="dropdown-item btn-secondary" 
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
                  onClick={() => { setIsMenuOpen(false); openModal('createChannel'); }}
                >
                  <Plus size={16} />
                  Criar Canal
                </button>
                <div className="server-divider" style={{ width: '100%', margin: '4px 0' }} />
              </>
            )}
            {isServerOwner ? (
              <button 
                className="dropdown-item btn-secondary" 
                style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--accent-danger)' }}
                onClick={async () => { 
                  setIsMenuOpen(false); 
                  const confirmed = await showConfirm(
                    'Excluir Servidor', 
                    `Deseja realmente excluir permanentemente o servidor "${activeServer.name}"? Todos os canais e mensagens serão apagados.`,
                    { isDanger: true, confirmText: 'Excluir Servidor' }
                  );
                  if (confirmed) {
                    deleteServer(activeServer.id);
                  }
                }}
              >
                <Trash2 size={16} />
                Excluir Servidor
              </button>
            ) : (
              <button 
                className="dropdown-item btn-secondary" 
                style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--accent-danger)' }}
                onClick={async () => { 
                  setIsMenuOpen(false); 
                  const confirmed = await showConfirm(
                    'Sair do Servidor', 
                    `Deseja sair do servidor "${activeServer.name}"? Você precisará de um convite para entrar novamente.`,
                    { isDanger: true, confirmText: 'Sair do Servidor' }
                  );
                  if (confirmed) {
                    leaveServer(activeServer.id);
                  }
                }}
              >
                <LogOut size={16} />
                Sair do Servidor
              </button>
            )}

            <button className="dropdown-item" onClick={() => { setIsMenuOpen(false); setEventsOpen(true); }}>
              <CalendarDays size={16} />
              Eventos
            </button>
            {isStaff && (
              <button className="dropdown-item" onClick={() => { setIsMenuOpen(false); setCreatingCategory(true); }}>
                <FolderPlus size={16} />
                Criar categoria
              </button>
            )}
            <button className="dropdown-item" onClick={() => { setIsMenuOpen(false); markServerRead(activeServer); }}>
              <CheckCheck size={16} />
              Marcar tudo como lido
            </button>
            <button
              className="dropdown-item"
              onClick={(e) => {
                setIsMenuOpen(false);
                openMenu(e, [
                  { heading: 'Notificações do servidor' },
                  ...[['all', 'Todas as mensagens'], ['mentions', 'Só menções'], ['none', 'Nada']].map(([level, label]) => ({
                    label,
                    checked: serverNotifyLevel(activeServer.id) === level,
                    onClick: () => setServerNotify(activeServer.id, level)
                  })),
                  { separator: true },
                  ...muteItems('server', activeServer.id, isServerNotifMuted(activeServer.id))
                ], activeServer.name);
              }}
            >
              {isServerNotifMuted(activeServer.id) ? <BellOff size={16} /> : <Bell size={16} />}
              Notificações
            </button>

            <button 
              className="dropdown-item btn-secondary" 
              style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
              onClick={() => { setIsMenuOpen(false); openModal('settings'); }}
            >
              <Settings size={16} />
              Minhas Configurações
            </button>
          </div>
        )}
      </div>

      {/* Channels List */}
      <div className="channels-list" onDragEnd={() => { setDragId(null); setDragOverId(null); }}>
        {events.length > 0 && (
          <button className="events-chip" onClick={() => setEventsOpen(true)}>
            <CalendarDays size={14} />
            {events.filter((e) => e.startsAt > Date.now() - 3 * 3_600_000).length} {events.length === 1 ? 'evento' : 'eventos'}
            <span>{nextEventLabel}</span>
          </button>
        )}

        {creatingCategory && (
          <form
            className="category-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get('name');
              try {
                await addCategory(activeServer.id, String(name || ''));
                setCreatingCategory(false);
              } catch (err) {
                showError('Categoria', err.message);
              }
            }}
          >
            <input name="name" className="form-input" autoFocus placeholder="Nome da categoria" maxLength={40} />
            <button className="icon-btn" type="submit" aria-label="Criar categoria"><Check size={14} /></button>
            <button className="icon-btn" type="button" aria-label="Cancelar" onClick={() => setCreatingCategory(false)}><X size={14} /></button>
          </form>
        )}

        {groups.map((group) => {
          const collapsed = collapsedCategories.includes(group.id);
          return (
            <div key={group.id} className={`channel-category ${dragOverId === `cat:${group.id}` ? 'drag-over' : ''}`}>
              <div
                className="channel-category-header"
                onClick={() => toggleCategory(group.id)}
                onContextMenu={(e) => group.category && openCategoryMenu(e, group.category)}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDragOverId(`cat:${group.id}`); } }}
                onDrop={(e) => { e.preventDefault(); dropOnCategory(group); }}
              >
                {renamingCategory === group.id ? (
                  <form
                    onClick={(e) => e.stopPropagation()}
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameCategory(activeServer.id, group.id, new FormData(e.currentTarget).get('name'));
                      setRenamingCategory(null);
                    }}
                  >
                    <input name="name" className="form-input category-rename" autoFocus defaultValue={group.title} onBlur={() => setRenamingCategory(null)} maxLength={40} />
                  </form>
                ) : (
                  <span className="category-title">
                    <ChevronDown size={12} className={`category-chevron ${collapsed ? 'collapsed' : ''}`} />
                    {group.title}
                  </span>
                )}
                {isStaff && (
                  <button
                    className="add-channel-btn"
                    title="Criar canal"
                    onClick={(e) => {
                      e.stopPropagation();
                      openModal('createChannel', group.category ? group.category.id : null);
                    }}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
              {!collapsed && group.channels.map((channel) => (channel.type === CHANNEL_TYPES.VOICE ? renderVoiceChannel(channel) : renderTextChannel(channel)))}
              {collapsed && group.channels.filter((c) => c.id === activeChannel?.id || c.id === activeVoiceChannel?.id).map((channel) => (
                channel.type === CHANNEL_TYPES.VOICE ? renderVoiceChannel(channel) : renderTextChannel(channel)
              ))}
            </div>
          );
        })}

      </div>

      {/* Active Voice Connection Bar */}
      {activeVoiceChannel && (
        <div className="active-voice-bar">
          <div className="active-voice-header">
            <div className="voice-status-info" title={averagePing !== null ? `${QUALITY_LABEL[connectionQuality]} • ${averagePing} ms` : QUALITY_LABEL[connectionQuality]}>
              <Signal size={14} className={`voice-quality ${connectionQuality}`} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className={`voice-quality-label ${connectionQuality}`}>
                  {QUALITY_LABEL[connectionQuality]}{averagePing !== null ? ` • ${averagePing} ms` : ''}
                </span>
                <span className="voice-channel-name">{activeVoiceChannel.name}</span>
              </div>
            </div>
            <button 
              className="icon-btn" 
              onClick={leaveVoice} 
              title="Desconectar da Voz"
              style={{ color: 'var(--accent-danger)' }}
            >
              <PhoneOff size={16} />
            </button>
          </div>

          <div className="voice-action-btns">
            <button 
              className={`voice-action-btn ${isScreenSharing ? 'active' : ''}`}
              onClick={() => {
                if (isScreenSharing) {
                  stopScreenShare();
                } else {
                  setIsPickerOpen(true);
                }
              }}
              title={isScreenSharing ? 'Parar Transmissão' : 'Transmitir Tela'}
            >
              <Tv size={14} />
              <span>{isScreenSharing ? 'Parar' : 'Transmitir'}</span>
            </button>

            <button 
              className={`voice-action-btn ${isMuted ? 'danger' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            <button 
              className={`voice-action-btn ${isDeafened ? 'danger' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? 'Reativar Áudio' : 'Desativar Áudio'}
            >
              <Headphones size={14} />
            </button>

            <button 
              className="voice-action-btn"
              onClick={() => setIsSoundboardOpen(true)}
              title="Abrir Soundboard (Painel de Sons)"
            >
              <Sparkles size={14} style={{ color: 'var(--accent-warning)' }} />
            </button>
          </div>
        </div>
      )}

      {isServerMuted && activeVoiceChannel && (
        <div className="server-muted-banner">
          <MicOff size={13} /> Um moderador silenciou você neste servidor
        </div>
      )}

      <UserFooter />

      {/* Soundboard Modal */}
      <SoundboardModal
        isOpen={isSoundboardOpen}
        onClose={() => setIsSoundboardOpen(false)}
      />

      {editingChannel && (
        <ChannelSettingsModal channel={editingChannel} onClose={() => setEditingChannel(null)} />
      )}
      {eventsOpen && <EventsModal onClose={() => setEventsOpen(false)} />}
    </aside>
  );
}
