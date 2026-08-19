import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';
import { Hash, Send, Trash2, Smile, Users } from 'lucide-react';
import { SOCKET_EVENTS, ROLES } from '@shared/constants';
import { saveMessageToCloud, listenToMessagesFromCloud } from '../services/cloudSync';

export default function ChatArea({ onToggleMemberList }) {
  const { activeServer, activeChannel, joinByCode } = useServer();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const messagesEndRef = useRef(null);
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
      try {
        setIsLoadingMessages(true);
        const data = await api.getMessages(activeChannel.id);
        if (isMounted) {
          setMessages(data.messages || []);
          setTimeout(scrollToBottom, 50);
        }
      } catch (err) {
        if (isMounted) {
          unsubscribeCloud = listenToMessagesFromCloud(activeChannel.id, (cloudMsgs) => {
            if (isMounted && cloudMsgs && cloudMsgs.length > 0) {
              setMessages(cloudMsgs);
              setTimeout(scrollToBottom, 50);
            }
          });
        }
      } finally {
        if (isMounted) setIsLoadingMessages(false);
      }
    }

    loadMessages();

    // Join channel socket room
    if (socket) {
      socket.emit(SOCKET_EVENTS.CHANNEL_JOIN, { channelId: activeChannel.id });
    }

    return () => {
      isMounted = false;
      if (socket) {
        socket.emit(SOCKET_EVENTS.CHANNEL_LEAVE, { channelId: activeChannel.id });
      }
      if (unsubscribeCloud) {
        unsubscribeCloud();
      }
    };
  }, [activeChannel?.id, socket]);

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

  // Handle message sending
  const handleSendMessage = () => {
    if (!inputText.trim() || !activeChannel?.id) return;

    if (socket && socket.connected) {
      socket.emit(SOCKET_EVENTS.MESSAGE_SEND, {
        channelId: activeChannel.id,
        content: inputText.trim()
      });
      socket.emit(SOCKET_EVENTS.TYPING_STOP, { channelId: activeChannel.id });
    } else {
      // Offline/Firebase Firestore mode
      const localMsg = {
        id: 'msg-' + Date.now(),
        channelId: activeChannel.id,
        userId: user?.id || 'offline-user',
        username: user?.username || 'Você',
        avatar: user?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || 'user'}`,
        content: inputText.trim(),
        createdAt: new Date().toISOString()
      };
      // Save message to Firestore (the listener will catch it and display it for all users)
      saveMessageToCloud(activeChannel.id, localMsg);
    }

    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);

    if (socket && activeChannel?.id) {
      socket.emit(SOCKET_EVENTS.TYPING_START, { channelId: activeChannel.id });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (socket) {
          socket.emit(SOCKET_EVENTS.TYPING_STOP, { channelId: activeChannel.id });
        }
      }, 2500);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await api.deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      alert('Não foi possível excluir a mensagem.');
    }
  };

  const isStaff = activeServer?.role === ROLES.OWNER || activeServer?.role === ROLES.ADMIN || activeServer?.role === ROLES.MODERATOR;

  const renderMessageContent = (msg) => {
    const text = msg.content || '';
    // Match Concord invite link/code
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
                  alert(res.message || 'Você entrou no servidor com sucesso!');
                } catch (err) {
                  alert(err.message || 'Erro ao entrar no servidor.');
                }
              }}
            >
              Entrar
            </button>
          </div>
        </div>
      );
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a 
            key={index} 
            href={part} 
            target="_blank" 
            rel="noreferrer" 
            style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const typingArray = Array.from(typingUsers);
  const typingText = typingArray.length > 0 
    ? `${typingArray.join(', ')} ${typingArray.length === 1 ? 'está digitando...' : 'estão digitando...'}` 
    : '';

  return (
    <main className="chat-area">
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
            <p style={{ fontSize: 13, marginTop: 4 }}>Este é o início da conversa neste canal.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.userId === user?.id;
            const canDelete = isMe || isStaff;
            const formattedTime = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={msg.id} className="message-item">
                <img 
                  src={msg.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.username}`} 
                  alt="" 
                  className="message-avatar" 
                />
                <div className="message-content-wrapper">
                  <div className="message-meta">
                    <span className="message-author">{msg.username}</span>
                    <span className="message-time">{formattedTime}</span>
                    {canDelete && (
                      <button 
                        className="icon-btn" 
                        onClick={() => handleDeleteMessage(msg.id)}
                        title="Excluir mensagem"
                        style={{ padding: 2, marginLeft: 'auto', opacity: 0.6 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="message-text">{renderMessageContent(msg)}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="chat-input-container">
        <div className="typing-indicator">
          {typingText}
        </div>

        <div className="chat-input-box">
          <textarea
            className="chat-textarea"
            placeholder={`Conversar em #${activeChannel?.name || 'geral'} (Enter para enviar, Shift+Enter para nova linha)`}
            rows={1}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <button 
            className="btn btn-primary" 
            onClick={handleSendMessage}
            disabled={!inputText.trim()}
            style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </main>
  );
}
