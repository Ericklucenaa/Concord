import React from 'react';
import { X, Volume2, Sparkles } from 'lucide-react';
import { SOUNDBOARD_SOUNDS, soundSynthesizer } from '../services/soundEffects';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { sendSoundboardInCloud } from '../services/cloudSync';

export default function SoundboardModal({ isOpen, onClose }) {
  const { activeVoiceChannel } = useVoice();
  const { user } = useAuth();

  if (!isOpen) return null;

  const handlePlaySound = (sound) => {
    // Play locally
    soundSynthesizer.play(sound.id);

    // Broadcast to other users in the voice room via Firestore/Cloud
    if (activeVoiceChannel?.id) {
      sendSoundboardInCloud(activeVoiceChannel.id, user?.id, user?.username, sound.id);
    }
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div 
        className="modal-container"
        style={{
          width: '420px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} style={{ color: 'var(--accent-warning)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Painel de Sons (Soundboard)</h3>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, marginTop: 0 }}>
            {activeVoiceChannel 
              ? `Os sons tocarão em tempo real para todos no canal de voz "${activeVoiceChannel.name}".`
              : 'Conecte-se a um canal de voz para que todos ouçam seus efeitos sonoros!'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {SOUNDBOARD_SOUNDS.map((sound) => (
              <button
                key={sound.id}
                onClick={() => handlePlaySound(sound)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: `1px solid var(--border-color)`,
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'transform 0.1s ease, border-color 0.15s ease, background-color 0.15s ease',
                  fontSize: 13,
                  fontWeight: 600
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.borderColor = sound.color;
                  e.currentTarget.style.backgroundColor = 'var(--bg-active)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                }}
              >
                <span style={{ fontSize: 24 }}>{sound.emoji}</span>
                <span>{sound.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
