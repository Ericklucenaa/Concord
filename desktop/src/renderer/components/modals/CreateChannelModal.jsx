import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { api } from '../../services/api';
import { X, Hash, Volume2 } from 'lucide-react';
import { CHANNEL_TYPES } from '@shared/constants';

export default function CreateChannelModal() {
  const { activeServer, modalState, closeModal, refreshServerDetails, setActiveChannel } = useServer();
  const [name, setName] = useState('');
  const [type, setType] = useState(CHANNEL_TYPES.TEXT);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!modalState.createChannel || !activeServer) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsLoading(true);
      setError('');
      const data = await api.createChannel(activeServer.id, {
        name: name.trim(),
        type,
        isPrivate
      });

      await refreshServerDetails(activeServer.id);
      if (type === CHANNEL_TYPES.TEXT) {
        setActiveChannel(data.channel);
      }
      closeModal('createChannel');
      setName('');
      setType(CHANNEL_TYPES.TEXT);
    } catch (err) {
      setError(err.message || 'Erro ao criar canal.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => closeModal('createChannel')}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Criar Canal</h3>
          <button className="icon-btn" onClick={() => closeModal('createChannel')}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="auth-error" style={{ margin: '16px 20px 0' }}>{error}</div>}

        <form onSubmit={handleCreate}>
          <div className="modal-body">
            {/* Channel Type Selector */}
            <div className="form-group">
              <label className="form-label">Tipo de Canal</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <div 
                  className={`source-item ${type === CHANNEL_TYPES.TEXT ? 'selected' : ''}`}
                  style={{ flex: 1, padding: 12, alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setType(CHANNEL_TYPES.TEXT)}
                >
                  <Hash size={24} style={{ color: 'var(--accent-primary)' }} />
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Texto</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Poste mensagens, imagens e conversas
                  </div>
                </div>

                <div 
                  className={`source-item ${type === CHANNEL_TYPES.VOICE ? 'selected' : ''}`}
                  style={{ flex: 1, padding: 12, alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setType(CHANNEL_TYPES.VOICE)}
                >
                  <Volume2 size={24} style={{ color: 'var(--accent-success)' }} />
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Voz & Vídeo</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Fale em tempo real e transmita tela
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Nome do Canal</label>
              <input
                type="text"
                className="form-input"
                placeholder={type === CHANNEL_TYPES.TEXT ? 'ex: novidades' : 'ex: Sala de Reunião'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => closeModal('createChannel')}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isLoading || !name.trim()}
            >
              {isLoading ? 'Criando...' : 'Criar Canal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
