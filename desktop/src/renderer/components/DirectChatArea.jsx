import React, { useMemo, useRef, useState } from 'react';
import {
  Users, MessageSquare, Check, X, Search, Ban, UserMinus, UserPlus, LogOut, Pencil, ShieldOff, Phone, PhoneOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDM } from '../context/DMContext';
import { useServer } from '../context/ServerContext';
import { usePresence } from '../context/PresenceContext';
import { useNotification } from '../context/NotificationContext';
import ChatView from './chat/ChatView';
import VoiceRoomArea from './VoiceRoomArea';
import { useVoice } from '../context/VoiceContext';
import { useOverlayUI } from '../context/OverlayUIContext';
import { SearchPanel } from './chat/SidePanels';
import { describeThread } from '../services/cloud/dms';
import { defaultAvatar } from '../services/cloud/util';

const STATUS_LABEL = { online: 'Disponível', idle: 'Ausente', dnd: 'Não perturbe', offline: 'Offline' };

function Avatar({ src, name, status, size = 36 }) {
  return (
    <div className="avatar-wrapper" style={{ width: size, height: size }}>
      <img src={src || defaultAvatar(name)} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
      {status && <div className={`status-dot ${status}`} />}
    </div>
  );
}

function FriendsDashboard() {
  const {
    friendList, incomingRequests, outgoingRequests, activeTab, setActiveTab,
    sendFriendRequest, respondFriendRequest, removeFriend, openDMWithUser, blockedIds, unblockUser, blockUser
  } = useDM();
  const { getStatus, getProfile, getCustomStatus } = usePresence();
  const { showSuccess, showError, showConfirm } = useNotification();
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);

  const friends = friendList.map((f) => ({ ...f, status: getStatus(f.id), live: getProfile(f.id) }));
  const online = friends.filter((f) => f.status !== 'offline');
  const shown = activeTab === 'online' ? online : friends;

  const submit = async (e) => {
    e.preventDefault();
    if (!nick.trim()) return;
    setBusy(true);
    try {
      const res = await sendFriendRequest(nick);
      showSuccess(res.accepted ? 'Amizade aceita!' : 'Pedido enviado!', res.accepted
        ? `Você e @${res.target.username} agora são amigos.`
        : `Pedido de amizade enviado para @${res.target.username}.`);
      setNick('');
      setActiveTab(res.accepted ? 'all' : 'pending');
    } catch (err) {
      showError('Pedido de amizade', err.message);
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    ['online', 'Disponíveis'],
    ['all', `Todos (${friends.length})`],
    ['pending', 'Pendentes', incomingRequests.length],
    ['blocked', 'Bloqueados']
  ];

  return (
    <div className="chat-area">
      <header className="chat-header">
        <div className="chat-header-info" style={{ gap: 14 }}>
          <Users size={20} style={{ color: 'var(--accent-primary)' }} />
          <span className="chat-header-title">Amigos</span>
          <div className="tab-row">
            {tabs.map(([id, label, badge]) => (
              <button key={id} className={`tab-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
                {label}
                {badge > 0 && <span className="badge-counter inline">{badge}</span>}
              </button>
            ))}
            <button className={`tab-btn add ${activeTab === 'add' ? 'active' : ''}`} onClick={() => setActiveTab('add')}>
              Adicionar amigo
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-body">
        {activeTab === 'add' && (
          <section className="dashboard-section">
            <h2>Adicionar amigo</h2>
            <p>Adicione pessoas pelo @apelido delas no Concord.</p>
            <form onSubmit={submit} className="add-friend-form">
              <input
                className="form-input"
                placeholder="@apelido"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                autoFocus
              />
              <button className="btn btn-primary" disabled={busy || !nick.trim()}>{busy ? 'Enviando…' : 'Enviar pedido'}</button>
            </form>
          </section>
        )}

        {activeTab === 'pending' && (
          <section className="dashboard-section">
            <h3 className="section-title">Recebidos — {incomingRequests.length}</h3>
            {incomingRequests.length === 0 && <div className="side-empty">Nenhum pedido pendente.</div>}
            {incomingRequests.map((r) => (
              <div key={r.friendshipId} className="person-row">
                <Avatar src={r.avatar} name={r.username} />
                <div className="person-info"><strong>{r.username}</strong><span>Pedido de amizade recebido</span></div>
                <button className="btn btn-primary btn-sm" onClick={() => respondFriendRequest(r, 'accept')}><Check size={14} /> Aceitar</button>
                <button className="btn btn-danger btn-sm" onClick={() => respondFriendRequest(r, 'reject')} title="Recusar"><X size={14} /></button>
              </div>
            ))}
            <h3 className="section-title" style={{ marginTop: 24 }}>Enviados — {outgoingRequests.length}</h3>
            {outgoingRequests.map((r) => (
              <div key={r.friendshipId} className="person-row subtle">
                <Avatar src={r.avatar} name={r.username} size={30} />
                <div className="person-info"><strong>{r.username}</strong><span>Aguardando resposta</span></div>
                <button className="btn btn-secondary btn-sm" onClick={() => removeFriend(r.friendshipId)}>Cancelar</button>
              </div>
            ))}
          </section>
        )}

        {activeTab === 'blocked' && (
          <section className="dashboard-section">
            <h3 className="section-title">Bloqueados — {blockedIds.length}</h3>
            {blockedIds.length === 0 && <div className="side-empty">Você não bloqueou ninguém.</div>}
            {blockedIds.map((id) => {
              const p = getProfile(id);
              return (
                <div key={id} className="person-row">
                  <Avatar src={p?.avatar} name={p?.username || id} />
                  <div className="person-info"><strong>{p?.username || 'Usuário'}</strong><span>Bloqueado</span></div>
                  <button className="btn btn-secondary btn-sm" onClick={() => unblockUser(id)}><ShieldOff size={14} /> Desbloquear</button>
                </div>
              );
            })}
          </section>
        )}

        {(activeTab === 'online' || activeTab === 'all') && (
          <section className="dashboard-section">
            <h3 className="section-title">{activeTab === 'online' ? `Disponíveis — ${online.length}` : `Todos — ${friends.length}`}</h3>
            {shown.length === 0 && (
              <div className="empty-state">
                <Users size={44} />
                <h3>{friends.length === 0 ? 'Nenhum amigo ainda' : 'Ninguém disponível agora'}</h3>
                <p>{friends.length === 0 ? 'Use "Adicionar amigo" para começar a conversar.' : 'Seus amigos aparecem aqui quando estiverem online.'}</p>
              </div>
            )}
            {shown.map((f) => {
              const custom = getCustomStatus(f.id);
              return (
                <div key={f.id} className="person-row">
                  <Avatar src={f.live?.avatar || f.avatar} name={f.username} status={f.status} />
                  <div className="person-info">
                    <strong>{f.live?.username || f.username}</strong>
                    <span>{custom ? `${custom.emoji || ''} ${custom.text || ''}`.trim() : STATUS_LABEL[f.status]}</span>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => openDMWithUser({ id: f.id, username: f.username, avatar: f.avatar })}>
                    <MessageSquare size={14} /> Mensagem
                  </button>
                  <button
                    className="icon-btn hover-danger"
                    title="Remover amizade"
                    onClick={async () => {
                      if (await showConfirm('Remover amigo', `Remover @${f.username} da sua lista de amigos?`, { isDanger: true, confirmText: 'Remover' })) {
                        removeFriend(f.friendshipId);
                      }
                    }}
                  >
                    <UserMinus size={16} />
                  </button>
                  <button
                    className="icon-btn hover-danger"
                    title="Bloquear"
                    onClick={async () => {
                      if (await showConfirm('Bloquear usuário', `@${f.username} não poderá mais enviar mensagens diretas para você.`, { isDanger: true, confirmText: 'Bloquear' })) {
                        blockUser(f.id);
                      }
                    }}
                  >
                    <Ban size={16} />
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}

function ThreadView({ thread }) {
  const { user } = useAuth();
  const { activeVoiceChannel, joinVoice, leaveVoice } = useVoice();
  const { openProfile } = useOverlayUI();
  const { blockedIds, blockUser, unblockUser, leaveGroup, renameGroup, addToGroup, removeFromGroup, friendList } = useDM();
  const { joinByCode, setActiveServer } = useServer();
  const { getStatus, profiles } = usePresence();
  const { showConfirm, showError } = useNotification();
  const [searchOpen, setSearchOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const chatRef = useRef(null);

  const info = describeThread(thread, user.id, profiles);
  const other = info.other;
  const blockedByMe = other && blockedIds.includes(other.id);
  const members = useMemo(
    () => thread.participants.map((id) => {
      const live = profiles.get(id);
      const cached = thread.profiles?.[id] || {};
      return { id, username: live?.username || cached.username || '', avatar: live?.avatar || cached.avatar || '' };
    }),
    [thread, profiles]
  );
  const scope = { type: 'dm', threadId: thread.id };
  const inThisCall = activeVoiceChannel?.threadId === thread.id;
  const startCall = () => joinVoice({ id: thread.id, name: info.title, threadId: thread.id });

  const joinInvite = async (code) => {
    const res = await joinByCode(code);
    return res;
  };

  const addable = friendList.filter((f) => !thread.participants.includes(f.id));

  return (
    <div className="chat-area">
      <header className="chat-header">
        <div className="chat-header-info">
          {thread.isGroup ? (
            <div className="group-avatar"><Users size={16} /></div>
          ) : (
            <button className="avatar-button" onClick={(e) => openProfile(other.id, e)} aria-label="Ver perfil">
              <Avatar src={other?.avatar} name={other?.username} status={getStatus(other?.id)} size={28} />
            </button>
          )}
          <span className="chat-header-title">{thread.isGroup ? info.title : `@${info.title}`}</span>
          {thread.isGroup && <span className="chat-header-desc">{thread.participants.length} membros</span>}
        </div>
        <div className="chat-header-actions">
          {!blockedByMe && (
            inThisCall ? (
              <button className="icon-btn hover-danger" onClick={leaveVoice} title="Encerrar chamada" aria-label="Encerrar chamada">
                <PhoneOff size={18} />
              </button>
            ) : (
              <button className="icon-btn" onClick={startCall} title="Iniciar chamada de voz" aria-label="Iniciar chamada de voz">
                <Phone size={18} />
              </button>
            )
          )}
          <button className={`icon-btn ${searchOpen ? 'active' : ''}`} onClick={() => setSearchOpen((v) => !v)} title="Pesquisar">
            <Search size={18} />
          </button>
          {thread.isGroup ? (
            <>
              <button className={`icon-btn ${manageOpen ? 'active' : ''}`} onClick={() => setManageOpen((v) => !v)} title="Membros do grupo">
                <Users size={18} />
              </button>
              <button
                className="icon-btn hover-danger"
                title="Sair do grupo"
                onClick={async () => {
                  if (await showConfirm('Sair do grupo', `Sair de "${info.title}"?`, { isDanger: true, confirmText: 'Sair' })) leaveGroup(thread);
                }}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button
              className="icon-btn hover-danger"
              title={blockedByMe ? 'Desbloquear' : 'Bloquear'}
              onClick={async () => {
                if (blockedByMe) return unblockUser(other.id);
                if (await showConfirm('Bloquear usuário', `@${other.username} não poderá mais enviar mensagens diretas para você.`, { isDanger: true, confirmText: 'Bloquear' })) {
                  blockUser(other.id);
                }
                return undefined;
              }}
            >
              {blockedByMe ? <ShieldOff size={18} /> : <Ban size={18} />}
            </button>
          )}
        </div>
      </header>

      {inThisCall && (
        <div className="dm-call">
          <VoiceRoomArea embedded />
        </div>
      )}

      <div className="chat-body">
        <ChatView
          ref={chatRef}
          scope={scope}
          attachmentScope={{ scopeType: 'dm', scopeId: thread.id }}
          members={members}
          blockedIds={blockedIds}
          disabledReason={blockedByMe ? 'Você bloqueou este usuário. Desbloqueie para enviar mensagens.' : null}
          placeholder={thread.isGroup ? `Conversar em ${info.title}` : `Conversar com @${info.title}`}
          onJoinInvite={async (code) => {
            const res = await joinInvite(code);
            setActiveServer(res.server);
            return res;
          }}
          emptyState={(
            <div className="channel-welcome">
              {thread.isGroup ? <div className="channel-welcome-icon"><Users size={32} /></div> : <Avatar src={other?.avatar} name={other?.username} size={64} />}
              <h2>{thread.isGroup ? info.title : `@${info.title}`}</h2>
              <p>{thread.isGroup ? 'Este é o começo do grupo.' : `Este é o começo da sua conversa com @${info.title}.`}</p>
            </div>
          )}
        />

        {searchOpen && (
          <SearchPanel scopes={{ current: [scope] }} onJump={(m) => chatRef.current?.jumpTo(m.id)} onClose={() => setSearchOpen(false)} />
        )}

        {manageOpen && thread.isGroup && (
          <aside className="side-panel">
            <header className="side-panel-header">
              <Users size={16} /> <span>Membros do grupo</span>
              <button className="icon-btn" onClick={() => setManageOpen(false)}><X size={16} /></button>
            </header>
            <div className="side-panel-body">
              {thread.ownerId === user.id && (
                <form
                  className="inline-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = new FormData(e.currentTarget).get('name');
                    if (String(name || '').trim()) renameGroup(thread, String(name)).catch((err) => showError('Renomear grupo', err.message));
                  }}
                >
                  <input name="name" className="form-input" defaultValue={thread.name || ''} placeholder="Nome do grupo" maxLength={60} />
                  <button className="icon-btn" title="Salvar nome"><Pencil size={14} /></button>
                </form>
              )}
              {members.map((m) => (
                <div key={m.id} className="person-row compact">
                  <Avatar src={m.avatar} name={m.username} status={getStatus(m.id)} size={28} />
                  <div className="person-info"><strong>{m.username}{m.id === thread.ownerId ? ' 👑' : ''}</strong></div>
                  {thread.ownerId === user.id && m.id !== user.id && (
                    <button className="icon-btn hover-danger" title="Remover do grupo" onClick={() => removeFromGroup(thread, m.id)}>
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              ))}
              {thread.ownerId === user.id && addable.length > 0 && thread.participants.length < 10 && (
                <>
                  <h4 className="section-title" style={{ marginTop: 14 }}>Adicionar amigos</h4>
                  {addable.map((f) => (
                    <div key={f.id} className="person-row compact">
                      <Avatar src={f.avatar} name={f.username} size={28} />
                      <div className="person-info"><strong>{f.username}</strong></div>
                      <button className="icon-btn" title="Adicionar" onClick={() => addToGroup(thread, [f])}><UserPlus size={14} /></button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function DirectChatArea() {
  const { activeThread } = useDM();
  return activeThread ? <ThreadView key={activeThread.id} thread={activeThread} /> : <FriendsDashboard />;
}
