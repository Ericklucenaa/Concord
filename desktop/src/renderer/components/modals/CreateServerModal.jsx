import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { api } from '../../services/api';
import { X, Sparkles, LogIn } from 'lucide-react';

export default function CreateServerModal() {
  const { modalState, closeModal, refreshServers, setActiveServer } = useServer();
  const [tab, setTab] = useState('create'); // 'create' or 'join'
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!modalState.createServer) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsLoading(true);
      setError('');
      const data = await api.createServer({
        name: name.trim(),
        description: description.trim()
      });

      await refreshServers();
      setActiveServer(data.server);
      closeModal('createServer');
      setName('');
      setDescription('');
    } catch (err) {
      setError(err.message || 'Erro ao criar servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    try {
      setIsLoading(true);
      setError('');
      const data = await api.joinByCode(inviteCode.trim());
      await refreshServers();
      closeModal('createServer');
      setInviteCode('');
    } catch (err) {
      setError(err.message || 'Erro ao entrar no servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => closeModal('createServer')}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {tab === 'create' ? 'Criar um Servidor' : 'Entrar em um Servidor'}
          </h3>
          <button className="icon-btn" onClick={() => closeModal('createServer')}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          <button 
            className={`btn ${tab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, borderRadius: 0, border: 'none' }}
            onClick={() => { setTab('create'); setError(''); }}
          >
            <Sparkles size={16} />
            Criar Novo
          </button>
          <button 
            className={`btn ${tab === 'join' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, borderRadius: 0, border: 'none' }}
            onClick={() => { setTab('join'); setError(''); }}
          >
            <LogIn size={16} />
            Entrar com Código
          </button>
        </div>

        {error && <div className="auth-error" style={{ margin: '16px 20px 0' }}>{error}</div>}

        {tab === 'create' ? (
          <form onSubmit={handleCreate}>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nome do Servidor</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: Sala dos Amigos, Trabalho, Jogos..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Descrição (Opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Sobre o que é este espaço?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => closeModal('createServer')}
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isLoading || !name.trim()}
              >
                {isLoading ? 'Criando...' : 'Criar Servidor'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoin}>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Código de Convite</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: aB3x9kLq"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Insira o código de 8 caracteres fornecido pelo administrador do servidor.
              </p>
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => closeModal('createServer')}
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isLoading || !inviteCode.trim()}
              >
                {isLoading ? 'Entrando...' : 'Entrar no Servidor'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
