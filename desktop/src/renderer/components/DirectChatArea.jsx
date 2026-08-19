import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDM } from '../context/DMContext';
import { useVoice } from '../context/VoiceContext';
import { useNotification } from '../context/NotificationContext';
import EmojiPickerPopover from './EmojiPickerPopover';
import ImageLightboxModal from './ImageLightboxModal';
import { 
  Users, 
  UserPlus, 
  Send, 
  Paperclip, 
  Smile, 
  Search, 
  Trash2, 
  Check, 
  X, 
  MessageSquare, 
  Phone, 
  Video, 
  Sparkles,
  ArrowRight,
  Clock,
  ExternalLink
} from 'lucide-react';

export default function DirectChatArea() {
  const { user } = useAuth();
  const { 
    activeDM, 
    friendsList, 
    activeTab, 
    setActiveTab, 
    directMessages, 
    sendDirectMessage, 
    deleteDirectMessage, 
    toggleReaction,
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
    openDMWithUser
  } = useDM();
  const { showSuccess, showError, showConfirm, showToast } = useNotification();

  const [messageText, setMessageText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [addFriendInput, setAddFriendInput] = useState('');
  const [isSendingFriend, setIsSendingFriend] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [directMessages.length]);

  // Global Ctrl + F search hotkey
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  // Image Processing & Compression
  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      showError('Arquivo Inválido', 'Selecione uma imagem válida (PNG, JPG, GIF, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
        setSelectedImage(compressedBase64);
        setPreviewUrl(compressedBase64);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Clipboard Paste Support (Ctrl + V)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) handleImageFile(file);
        break;
      }
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() && !selectedImage) return;

    try {
      await sendDirectMessage({
        content: messageText.trim(),
        attachment: selectedImage
      });
      setMessageText('');
      setSelectedImage(null);
      setPreviewUrl(null);
    } catch (err) {
      showError('Erro ao enviar', 'Não foi possível enviar a mensagem.');
    }
  };

  const handleAddFriendSubmit = async (e) => {
    e.preventDefault();
    const cleanNick = addFriendInput.trim().replace(/^@/, '');
    if (!cleanNick) return;

    try {
      setIsSendingFriend(true);
      await sendFriendRequest(cleanNick);
      showSuccess('Pedido Enviado!', `Pedido de amizade enviado para @${cleanNick}.`);
      setAddFriendInput('');
      setActiveTab('pending');
    } catch (err) {
      showError('Erro no Pedido', err.message || 'Não foi possível enviar o pedido.');
    } finally {
      setIsSendingFriend(false);
    }
  };

  const handleRespondFriend = async (requestId, action) => {
    try {
      await respondFriendRequest(requestId, action);
      showToast(action === 'accept' ? 'Amigo adicionado com sucesso!' : 'Pedido recusado.', 'success');
    } catch (err) {
      showError('Erro', 'Não foi possível processar o pedido.');
    }
  };

  // Friends filtering
  const acceptedFriends = friendsList.filter((f) => f.status === 'accepted').map((f) => {
    const isSender = String(f.senderId) === String(user?.id);
    return {
      friendshipId: f.id,
      id: isSender ? f.receiverId : f.senderId,
      username: isSender ? f.receiverUsername : f.senderUsername,
      avatar: isSender ? f.receiverAvatar : f.senderAvatar,
      status: 'online'
    };
  });

  const pendingRequests = friendsList.filter((f) => f.status === 'pending');
  const incomingRequests = pendingRequests.filter((f) => f.receiverNickname === user?.username?.toLowerCase());
  const outgoingRequests = pendingRequests.filter((f) => String(f.senderId) === String(user?.id));

  // Filter messages based on search query
  const filteredMessages = searchQuery.trim()
    ? directMessages.filter((m) => (m.content || '').toLowerCase().includes(searchQuery.toLowerCase()) || (m.senderUsername || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : directMessages;

  // =========================================================================
  // VIEW 1: FRIENDS DASHBOARD (WHEN NO ACTIVE DM IS OPEN)
  // =========================================================================
  if (!activeDM) {
    return (
      <div className="chat-area" style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-primary)' }}>
        {/* Friends Top Bar */}
        <div className="chat-header" style={{ padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', height: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
              <Users size={20} style={{ color: 'var(--accent-primary)' }} />
              <span>Amigos</span>
            </div>

            <div style={{ width: 1, height: 20, backgroundColor: 'var(--border-color)' }} />

            {/* Tab Buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button 
                className={`btn ${activeTab === 'online' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 12px', fontSize: 13, border: 'none' }}
                onClick={() => setActiveTab('online')}
              >
                Disponíveis
              </button>
              <button 
                className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 12px', fontSize: 13, border: 'none' }}
                onClick={() => setActiveTab('all')}
              >
                Todos ({acceptedFriends.length})
              </button>
              <button 
                className={`btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 12px', fontSize: 13, border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setActiveTab('pending')}
              >
                Pendentes
                {incomingRequests.length > 0 && (
                  <span className="badge-counter" style={{ position: 'static', padding: '1px 5px', fontSize: 10 }}>
                    {incomingRequests.length}
                  </span>
                )}
              </button>
              <button 
                className={`btn ${activeTab === 'add' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  padding: '4px 12px', 
                  fontSize: 13, 
                  backgroundColor: activeTab === 'add' ? 'var(--accent-success)' : 'transparent',
                  color: activeTab === 'add' ? '#fff' : 'var(--accent-success)',
                  border: '1px solid var(--accent-success)',
                  fontWeight: 700
                }}
                onClick={() => setActiveTab('add')}
              >
                Adicionar Amigo
              </button>
            </div>
          </div>
        </div>

        {/* Friends Content */}
        <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
          {/* TAB: ADICIONAR AMIGO */}
          {activeTab === 'add' && (
            <div style={{ maxWidth: 640 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                ADICIONAR AMIGO
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Você pode adicionar amigos através do @apelido único deles no Concord.
              </p>

              <form onSubmit={handleAddFriendSubmit} style={{ display: 'flex', gap: 10 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input 
                    type="text"
                    className="form-input"
                    placeholder="Insira um @apelido (Ex: @erick ou @shiftf15)"
                    value={addFriendInput}
                    onChange={(e) => setAddFriendInput(e.target.value)}
                    style={{ width: '100%', padding: '12px 16px', fontSize: 14, fontFamily: 'var(--font-mono)' }}
                    autoFocus
                  />
                </div>
                <button 
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSendingFriend || !addFriendInput.trim()}
                  style={{ padding: '0 20px', fontSize: 14, fontWeight: 700 }}
                >
                  {isSendingFriend ? 'Enviando...' : 'Enviar Pedido de Amizade'}
                </button>
              </form>
            </div>
          )}

          {/* TAB: PENDENTES */}
          {activeTab === 'pending' && (
            <div style={{ maxWidth: 640 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
                Pedidos Recebidos ({incomingRequests.length})
              </h3>
              {incomingRequests.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>
                  Nenhum pedido de amizade pendente no momento.
                </div>
              ) : (
                incomingRequests.map((req) => (
                  <div 
                    key={req.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: 8,
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img 
                        src={req.senderAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${req.senderUsername}`} 
                        alt="" 
                        style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', objectFit: 'cover' }}
                      />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{req.senderUsername}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pedido de amizade recebido</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => handleRespondFriend(req.id, 'accept')}
                        title="Aceitar Pedido"
                      >
                        <Check size={14} /> Aceitar
                      </button>
                      <button 
                        className="btn btn-danger"
                        style={{ padding: '6px 10px', fontSize: 12 }}
                        onClick={() => handleRespondFriend(req.id, 'reject')}
                        title="Recusar Pedido"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 24, marginBottom: 12 }}>
                Pedidos Enviados ({outgoingRequests.length})
              </h3>
              {outgoingRequests.map((req) => (
                <div 
                  key={req.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(0,0,0,0.1)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: 6,
                    fontSize: 13,
                    color: 'var(--text-secondary)'
                  }}
                >
                  <span>Para @{req.receiverNickname}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aguardando resposta</span>
                </div>
              ))}
            </div>
          )}

          {/* TAB: ONLINE OU TODOS */}
          {(activeTab === 'online' || activeTab === 'all') && (
            <div style={{ maxWidth: 720 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
                Amigos ({acceptedFriends.length})
              </h3>
              {acceptedFriends.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
                  <Users size={44} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Nenhum amigo encontrado</p>
                  <p style={{ fontSize: 13 }}>Clique na aba "Adicionar Amigo" para começar a conversar!</p>
                </div>
              ) : (
                acceptedFriends.map((friend) => (
                  <div 
                    key={friend.id || friend.username}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      marginBottom: 8,
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ position: 'relative', width: 38, height: 38 }}>
                        <img 
                          src={friend.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${friend.username}`} 
                          alt="" 
                          style={{ width: 38, height: 38, borderRadius: 'var(--radius-full)', objectFit: 'cover' }}
                        />
                        <div className="status-dot online" style={{ width: 10, height: 10, bottom: -1, right: -1 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{friend.username}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Disponível</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={() => openDMWithUser(friend)}
                      >
                        <MessageSquare size={14} />
                        Mensagem
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ACTIVE 1-ON-1 DIRECT MESSAGE CHAT
  // =========================================================================
  return (
    <div className="chat-area" onPaste={handlePaste} style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Top Header */}
      <header className="chat-header" style={{ justifyContent: 'space-between', height: 48, padding: '0 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 28, height: 28 }}>
            <img 
              src={activeDM.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${activeDM.username}`} 
              alt="" 
              style={{ width: 28, height: 28, borderRadius: 'var(--radius-full)', objectFit: 'cover' }}
            />
            <div className="status-dot online" style={{ width: 8, height: 8, bottom: -1, right: -1 }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>@{activeDM.username}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            className={`icon-btn ${isSearchOpen ? 'active' : ''}`}
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            title="Pesquisar Mensagens (Ctrl + F)"
          >
            <Search size={18} />
          </button>
        </div>
      </header>

      {/* Ctrl + F Search Bar */}
      {isSearchOpen && (
        <div style={{ padding: '8px 16px', backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 10, animation: 'slideDown 0.15s ease' }}>
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text"
            placeholder="Pesquisar nesta conversa direta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, outline: 'none' }}
            autoFocus
          />
          {searchQuery && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {filteredMessages.length} {filteredMessages.length === 1 ? 'resultado' : 'resultados'}
            </span>
          )}
          <button className="icon-btn" onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Messages Feed */}
      <div className="messages-feed" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* DM Greeting Box */}
        <div style={{ padding: '24px 0 16px', borderBottom: '1px solid var(--border-color)', marginBottom: 8 }}>
          <img 
            src={activeDM.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${activeDM.username}`} 
            alt="" 
            style={{ width: 64, height: 64, borderRadius: 'var(--radius-full)', marginBottom: 12 }}
          />
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>@{activeDM.username}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Este é o início da sua história de mensagens diretas com <strong style={{ color: 'var(--text-primary)' }}>@{activeDM.username}</strong>.
          </p>
        </div>

        {filteredMessages.map((msg) => {
          const isMe = String(msg.senderId) === String(user?.id);
          const reactions = msg.reactions || {};

          return (
            <div key={msg.id} className="message-group" style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
              <img 
                src={msg.senderAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.senderUsername}`} 
                alt="" 
                style={{ width: 38, height: 38, borderRadius: 'var(--radius-full)', objectFit: 'cover', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: isMe ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    {msg.senderUsername}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (
                    <button 
                      className="icon-btn hover-danger"
                      style={{ opacity: 0.4, padding: 2, marginLeft: 'auto' }}
                      onClick={() => deleteDirectMessage(msg.id)}
                      title="Excluir Mensagem"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Message Content */}
                {msg.content && (
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.45 }}>
                    {msg.content}
                  </div>
                )}

                {/* Attachment Image */}
                {msg.attachment && (
                  <div style={{ marginTop: 8 }}>
                    <img 
                      src={msg.attachment} 
                      alt="Anexo" 
                      onClick={() => setLightboxImage(msg.attachment)}
                      style={{ maxWidth: 360, maxHeight: 240, borderRadius: 'var(--radius-md)', cursor: 'pointer', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                )}

                {/* Emoji Reactions */}
                {Object.keys(reactions).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {Object.entries(reactions).map(([emoji, usersArr]) => {
                      const hasMyReaction = usersArr.includes(String(user?.id));
                      return (
                        <button 
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: hasMyReaction ? 'rgba(99, 102, 241, 0.25)' : 'var(--bg-secondary)',
                            border: hasMyReaction ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          <span>{emoji}</span>
                          <span style={{ fontSize: 11, fontWeight: 700 }}>{usersArr.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Image Preview before send */}
      {previewUrl && (
        <div style={{ padding: '8px 16px', backgroundColor: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={previewUrl} alt="" style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Imagem pronta para envio</span>
          <button className="icon-btn hover-danger" onClick={() => { setSelectedImage(null); setPreviewUrl(null); }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Input Chat Box */}
      <div style={{ padding: '0 16px 16px' }}>
        <form 
          onSubmit={handleSendMessage}
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            padding: '4px 10px',
            border: '1px solid var(--border-color)'
          }}
        >
          {/* File attachment button */}
          <input 
            type="file" 
            ref={fileInputRef} 
            accept="image/*" 
            style={{ display: 'none' }} 
            onChange={(e) => {
              if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
            }}
          />
          <button 
            type="button" 
            className="icon-btn" 
            onClick={() => fileInputRef.current?.click()}
            title="Anexar Imagem / Foto"
          >
            <Paperclip size={18} />
          </button>

          <input 
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder={`Conversar com @${activeDM.username}...`}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', padding: '10px 12px', color: '#fff', fontSize: 14, outline: 'none' }}
            autoFocus
          />

          {/* Emoji Picker Popover */}
          <div style={{ position: 'relative' }}>
            <button 
              type="button" 
              className="icon-btn" 
              onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
              title="Inserir Emoji"
            >
              <Smile size={18} />
            </button>
            <EmojiPickerPopover 
              isOpen={isEmojiPickerOpen} 
              onClose={() => setIsEmojiPickerOpen(false)}
              onSelectEmoji={(emoji) => setMessageText((prev) => prev + emoji)}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={!messageText.trim() && !selectedImage}
            style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', marginLeft: 6 }}
          >
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* Lightbox Modal */}
      <ImageLightboxModal 
        isOpen={Boolean(lightboxImage)} 
        imageUrl={lightboxImage} 
        onClose={() => setLightboxImage(null)} 
      />
    </div>
  );
}
