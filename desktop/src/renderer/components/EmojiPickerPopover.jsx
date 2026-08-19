import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

const EMOJI_CATEGORIES = [
  {
    name: 'Reações Populares',
    emojis: ['❤️', '😂', '🔥', '👍', '🎉', '💀', '🚀', '💯', '✨', '👏', '😍', '👀', '🥺', '😎']
  },
  {
    name: 'Expressões & Carinhas',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😭', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖']
  },
  {
    name: 'Gestos & Pessoas',
    emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '🫡']
  },
  {
    name: 'Jogos, Atividades & Objetos',
    emojis: ['🎮', '🕹️', '👾', '🎲', '♟️', '🎯', '🎳', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎟️', '🎫', '🎪', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '⚔️', '🛡️', '💎', '👑', '💻', '🖥️', '⌨️', '🖱️', '📱', '🔋', '💡', '🔦', '🕯️', '🧨', '💣', '🔪', '🔫', '🧭', '🧱', '🪙', '💰', '💵', '📦', '🎁', '🎈', '🎉', '🎊']
  }
];

export default function EmojiPickerPopover({ onSelectEmoji, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleDocumentClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        if (onClose) onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (onClose) onClose();
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const filteredCategories = EMOJI_CATEGORIES.map((cat) => {
    if (!searchTerm.trim()) return cat;
    const emojis = cat.emojis.filter((emoji) => emoji.includes(searchTerm.trim()));
    return { ...cat, emojis };
  }).filter((cat) => cat.emojis.length > 0);

  const handleEmojiClick = (e, emoji) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectEmoji(emoji);
    if (onClose) onClose();
  };

  return (
    <div 
      ref={popoverRef}
      className="emoji-picker-popover"
      style={{
        position: 'absolute',
        bottom: '60px',
        right: '16px',
        width: '320px',
        height: '380px',
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-xl)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        overflow: 'hidden',
        animation: 'slideUp 0.15s ease'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'var(--bg-secondary)' }}>
        <Search size={16} style={{ color: 'var(--text-muted)' }} />
        <input 
          type="text" 
          placeholder="Buscar emoji..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoFocus
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 13
          }}
        />
        {onClose && (
          <button 
            type="button" 
            className="icon-btn" 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} 
            style={{ padding: 2 }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Emojis Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {filteredCategories.map((cat) => (
          <div key={cat.name} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.5px' }}>
              {cat.name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {cat.emojis.map((emoji, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={(e) => handleEmojiClick(e, emoji)}
                  style={{
                    fontSize: 20,
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease, background-color 0.1s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-active)';
                    e.currentTarget.style.transform = 'scale(1.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
