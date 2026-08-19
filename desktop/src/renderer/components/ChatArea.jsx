import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';
import { 
  Hash, 
  Send, 
  Trash2, 
  Smile, 
  Users, 
  Image as ImageIcon, 
  Paperclip, 
  X, 
  Plus, 
  Heart,
  SmilePlus
} from 'lucide-react';
import { SOCKET_EVENTS, ROLES } from '@shared/constants';
import { 
  saveMessageToCloud, 
  deleteMessageFromCloud, 
  listenToMessagesFromCloud,
  toggleMessageReactionInCloud 
} from '../services/cloudSync';
import EmojiPickerPopover from './EmojiPickerPopover';
import ImageLightboxModal from './ImageLightboxModal';
import { useNotification } from '../context/NotificationContext';

const QUICK_REACTIONS = ['❤️', '😂', '🔥', '👍', '🎉'];

export default function ChatArea({ onToggleMemberList }) {
  const { showSuccess, showError, showToast } = useNotification();
  const { activeServer, activeChannel, joinByCode } = useServer();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState(null); // { dataUrl, name }
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [reactingToMessageId, setReactingToMessageId] = useState(null);
  const [selectedLightboxImage, setSelectedLightboxImage] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load message history when activeChannel changes
  useEffect(() => {
    if (!activeChannel?.id) return;

    let isMounted = true;
    let unsubscribeCloud = null;

    async function loadMessages() {
      if (api.hasBackend()) {
        try {
          setIsLoadingMessages(true);
          const data = await api.getMessages(activeChannel.id);
          if (isMounted) {
            setMessages(data.messages || []);
            setTimeout(scrollToBottom, 50);
          }
        } catch (err) {} finally {
          if (isMounted) setIsLoadingMessages(false);
        }
      } else {
        // Cloud Firestore mode: listen in real-time
        setIsLoadingMessages(true);
        unsubscribeCloud = listenToMessagesFromCloud(activeChannel.id, (cloudMsgs) => {
          if (isMounted) {
            setMessages(cloudMsgs || []);
            setIsLoadingMessages(false);
            setTimeout(scrollToBottom, 50);
          }
        });
      }
    }

    loadMessages();

    // Join channel socket room
    if (socket && socket.connected) {
      socket.emit(SOCKET_EVENTS.CHANNEL_JOIN, { channelId: activeChannel.id });
    }

    return () => {
      isMounted = false;
      if (socket && socket.connected) {
        socket.emit(SOCKET_EVENTS.CHANNEL_LEAVE, { channelId: activeChannel.id });
      }
      if (unsubscribeCloud) {
        unsubscribeCloud();
      }
    };
  }, [activeChannel?.id, socket, socket?.connected]);

  // Socket listeners for real-time messages & typing
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      if (message.channelId === activeChannel?.id) {
        setMessages((prev) => [...prev, message]);
        setTimeout(scrollToBottom, 50);
      }
    };

    const handleMessageDelete = ({ messageId, channelId }) => {
      if (channelId === activeChannel?.id) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    };

    const handleTyping = ({ channelId, userId: typingUserId, username: typingUsername, isTyping }) => {
      if (channelId === activeChannel?.id && typingUserId !== user?.id) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          if (isTyping) {
            next.add(typingUsername);
          } else {
            next.delete(typingUsername);
          }
          return next;
        });
      }
    };

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage);
    socket.on(SOCKET_EVENTS.MESSAGE_DELETE, handleMessageDelete);
    socket.on(SOCKET_EVENTS.TYPING_UPDATE, handleTyping);

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage);
      socket.off(SOCKET_EVENTS.MESSAGE_DELETE, handleMessageDelete);
      socket.off(SOCKET_EVENTS.TYPING_UPDATE, handleTyping);
    };
  }, [socket, activeChannel?.id, user?.id]);

  // Process image file and compress
  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      showError('Arquivo Inválido', 'Por favor selecione um arquivo de imagem válido (PNG, JPG, GIF, WEBP).');
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

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAttachment({
          dataUrl: compressedDataUrl,
          name: file.name
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Paste image from clipboard (Ctrl + V)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleImageFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer?.files?.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleImageFile(file);
      }
    }
  };

  // Handle message sending
  const handleSendMessage = () => {
    if ((!inputText.trim() && !attachment) || !activeChannel?.id) return;

    const messageData = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      channelId: activeChannel.id,
      userId: user?.id || 'offline-user',
      username: user?.username || 'Você',
      avatar: user?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || 'user'}`,
      content: inputText.trim(),
      imageUrl: attachment ? attachment.dataUrl : null,
      reactions: {},
      createdAt: new Date().toISOString()
    };

    if (socket && socket.connected) {
      socket.emit(SOCKET_EVENTS.MESSAGE_SEND, messageData);
      socket.emit(SOCKET_EVENTS.TYPING_STOP, { channelId: activeChannel.id });
    } else {
      saveMessageToCloud(activeChannel.id, messageData);
    }

    setInputText('');
    setAttachment(null);
    setIsEmojiPickerOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);

    if (socket && socket.connected && activeChannel?.id) {
      socket.emit(SOCKET_EVENTS.TYPING_START, { channelId: activeChannel.id });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (socket && socket.connected) {
          socket.emit(SOCKET_EVENTS.TYPING_STOP, { channelId: activeChannel.id });
        }
      }, 2500);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (api.hasBackend()) {
      try {
        await api.deleteMessage(messageId);
      } catch (err) {}
    }
    deleteMessageFromCloud(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const handleToggleReaction = (messageId, emoji) => {
    if (!user?.id) return;
    toggleMessageReactionInCloud(messageId, emoji, user.id, user.username);
  };

  const isStaff = activeServer?.role === ROLES.OWNER || activeServer?.role === ROLES.ADMIN || activeServer?.role === ROLES.MODERATOR;

  // Markdown and formatted content renderer
  const renderMessageContent = (msg) => {
    const text = msg.content || '';
    const inviteRegex = /(?:https?:\/\/[^\s]+)?#invite=([a-zA-Z0-9]+)/i;
    const match = text.match(inviteRegex);

    if (match) {
      const inviteCode = match[1];
      const cleanText = text.replace(inviteRegex, '').trim();

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cleanText && <div>{cleanText}</div>}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginTop: 6,
              maxWidth: 480,
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div 
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  color: '#fff',
                  fontSize: 16
                }}
              >
                C
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Você foi convidado para entrar em um servidor
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Código do Convite: {inviteCode}
                </div>
              </div>
            </div>
            <button 
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={async () => {
                try {
                  const res = await joinByCode(inviteCode);
                  showSuccess('Servidor Acessado!', res.message || 'Você entrou no servidor com sucesso!');
                } catch (err) {
                  showError('Não foi possível entrar', err.message || 'Erro ao entrar no servidor com este convite.');
                }
              }}
            >
              Entrar
            </button>
          </div>
        </div>
      );
    }

    // Markdown Parser: **bold**, *italic*, `code`, URLs
    const renderFormattedText = (raw) => {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const parts = raw.split(urlRegex);

      return parts.map((part, pIdx) => {
        if (part.match(urlRegex)) {
          return (
            <a 
              key={pIdx} 
              href={part} 
              target="_blank" 
              rel="noreferrer" 
              style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
            >
              {part}
            </a>
          );
        }

        // Bold **text**
        const boldRegex = /\*\*([^*]+)\*\*/g;
        // Inline code `code`
        const codeRegex = /`([^`]+)`/g;

        const subParts = part.split(boldRegex);
        return subParts.map((sub, sIdx) => {
          if (sIdx % 2 === 1) {
            return <strong key={sIdx} style={{ color: 'var(--text-primary)' }}>{sub}</strong>;
          }
          return sub;
        });
      });
    };

    return (
      <div style={{ wordBreak: 'break-word', lineHeight: 1.5 }}>
        {text && <div>{renderFormattedText(text)}</div>}
        {msg.imageUrl && (
          <div style={{ marginTop: 8 }}>
            <img 
              src={msg.imageUrl} 
              alt="Anexo" 
              onClick={() => setSelectedLightboxImage(msg.imageUrl)}
              style={{
                maxWidth: '100%',
                maxHeight: '380px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-md)',
                objectFit: 'contain',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.01)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            />
          </div>
        )}
      </div>
    );
  };

  const typingArray = Array.from(typingUsers);
  const typingText = typingArray.length > 0 
    ? `${typingArray.join(', ')} ${typingArray.length === 1 ? 'está digitando...' : 'estão digitando...'}` 
    : '';

  return (
    <main 
      className="chat-area"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: 'relative' }}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(99, 102, 241, 0.25)',
            backdropFilter: 'blur(4px)',
            border: '2px dashed var(--accent-primary)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            pointerEvents: 'none'
          }}
        >
          <ImageIcon size={48} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ color: '#fff', margin: 0, fontWeight: 700 }}>Solte a imagem para enviar para #{activeChannel?.name}</h3>
        </div>
      )}

      {/* Channel Header */}
      <header className="chat-header">
        <div className="chat-header-info">
          <Hash size={20} style={{ color: 'var(--text-muted)' }} />
          <span className="chat-header-title">{activeChannel?.name || 'geral'}</span>
          <span className="chat-header-desc">Canal de texto de {activeServer?.name}</span>
        </div>

        <button 
          className="icon-btn" 
          onClick={onToggleMemberList}
          title="Alternar Lista de Membros"
        >
          <Users size={20} />
        </button>
      </header>

      {/* Messages List */}
      <div className="chat-messages">
        {isLoadingMessages ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
            Carregando mensagens...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
            <Hash size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <h3>Bem-vindo ao início de #{activeChannel?.name}!</h3>
            <p style={{ fontSize: 13, marginTop: 4 }}>Este é o início da conversa neste canal. Envie mensagens, fotos e emojis!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.userId === user?.id;
            const canDelete = isMe || isStaff;
            const formattedTime = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const reactions = msg.reactions || {};

            return (
              <div 
                key={msg.id} 
                className="message-item"
                style={{ position: 'relative' }}
              >
                <img 
                  src={msg.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.username}`} 
                  alt="" 
                  className="message-avatar" 
                />
                <div className="message-content-wrapper" style={{ flex: 1 }}>
                  <div className="message-meta">
                    <span className="message-author">{msg.username}</span>
                    <span className="message-time">{formattedTime}</span>
                    
                    {/* Hover Message Action Toolbar */}
                    <div 
                      className="message-actions"
                      style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        backgroundColor: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '2px 4px',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          className="icon-btn"
                          style={{ padding: '2px 4px', fontSize: 13 }}
                          onClick={() => handleToggleReaction(msg.id, emoji)}
                          title={`Reagir com ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}

                      <button 
                        className="icon-btn"
                        style={{ padding: '2px 4px' }}
                        onClick={() => {
                          setReactingToMessageId(reactingToMessageId === msg.id ? null : msg.id);
                        }}
                        title="Mais reações"
                      >
                        <SmilePlus size={14} />
                      </button>

                      {canDelete && (
                        <button 
                          className="icon-btn hover-danger" 
                          onClick={() => handleDeleteMessage(msg.id)}
                          title="Excluir mensagem"
                          style={{ padding: '2px 4px', opacity: 0.7 }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="message-text">{renderMessageContent(msg)}</div>

                  {/* Reaction Pills Below Message */}
                  {Object.keys(reactions).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {Object.entries(reactions).map(([emoji, userIds]) => {
                        const hasReacted = user?.id && userIds.includes(String(user.id));
                        return (
                          <button
                            key={emoji}
                            onClick={() => handleToggleReaction(msg.id, emoji)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 6px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: hasReacted ? 'rgba(99, 102, 241, 0.25)' : 'var(--bg-tertiary)',
                              border: hasReacted ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.1s ease'
                            }}
                            title={`Reagido por ${userIds.length} pessoas`}
                          >
                            <span>{emoji}</span>
                            <span style={{ fontSize: 11, opacity: 0.85 }}>{userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* More Reactions Popover */}
                  {reactingToMessageId === msg.id && (
                    <EmojiPickerPopover 
                      onSelectEmoji={(emoji) => {
                        handleToggleReaction(msg.id, emoji);
                        setReactingToMessageId(null);
                      }}
                      onClose={() => setReactingToMessageId(null)}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box Area */}
      <div className="chat-input-container">
        <div className="typing-indicator">
          {typingText}
        </div>

        {/* Image Attachment Preview Before Sending */}
        {attachment && (
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 8,
              border: '1px solid var(--border-color)',
              maxWidth: 'fit-content',
              animation: 'slideUp 0.15s ease'
            }}
          >
            <img 
              src={attachment.dataUrl} 
              alt="" 
              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} 
            />
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {attachment.name || 'Imagem anexada'}
            </div>
            <button 
              className="icon-btn hover-danger"
              onClick={() => setAttachment(null)}
              title="Remover anexo"
              style={{ padding: 4 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="chat-input-box">
          {/* Hidden File Input for Image Upload */}
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length > 0) {
                handleImageFile(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />

          <button 
            className="icon-btn" 
            onClick={() => fileInputRef.current?.click()}
            title="Anexar Imagem ou Foto"
            style={{ padding: 6, color: 'var(--text-muted)' }}
          >
            <Paperclip size={18} />
          </button>

          <textarea
            className="chat-textarea"
            placeholder={`Conversar em #${activeChannel?.name || 'geral'} (Enter envia, Ctrl+V anexa foto, **negrito**)`}
            rows={1}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />

          <button 
            className="icon-btn"
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            title="Seletor de Emojis"
            style={{ padding: 6, color: isEmojiPickerOpen ? 'var(--accent-primary)' : 'var(--text-muted)' }}
          >
            <Smile size={18} />
          </button>

          <button 
            className="btn btn-primary" 
            onClick={handleSendMessage}
            disabled={!inputText.trim() && !attachment}
            style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
          >
            <Send size={15} />
          </button>
        </div>

        {/* Main Emoji Picker Popover */}
        {isEmojiPickerOpen && (
          <EmojiPickerPopover 
            onSelectEmoji={(emoji) => {
              setInputText((prev) => prev + emoji);
              setIsEmojiPickerOpen(false);
            }}
            onClose={() => setIsEmojiPickerOpen(false)}
          />
        )}
      </div>

      {/* Lightbox Modal for Fullscreen Image View */}
      {selectedLightboxImage && (
        <ImageLightboxModal 
          imageUrl={selectedLightboxImage} 
          onClose={() => setSelectedLightboxImage(null)} 
        />
      )}
    </main>
  );
}
