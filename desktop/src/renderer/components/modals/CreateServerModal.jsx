import React, { useState, useRef } from 'react';
import { useServer } from '../../context/ServerContext';
import { X, Sparkles, LogIn, Upload, RefreshCw, Camera, Image as ImageIcon } from 'lucide-react';

const DEFAULT_APP_ICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'><defs><linearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%236366f1'/><stop offset='100%25' stop-color='%233b82f6'/></linearGradient></defs><rect width='100' height='100' rx='26' fill='url(%23g)'/><circle cx='50' cy='50' r='12' fill='%23ffffff'/><path d='M 30 50 A 20 20 0 0 1 70 50' fill='none' stroke='%23ffffff' stroke-width='5' stroke-linecap='round'/><path d='M 20 50 A 30 30 0 0 1 80 50' fill='none' stroke='%23ffffff' stroke-width='5' stroke-linecap='round' opacity='0.6'/></svg>";

export default function CreateServerModal() {
  const { modalState, closeModal, createServer, joinByCode } = useServer();
  const [tab, setTab] = useState('create'); // 'create' or 'join'
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState(DEFAULT_APP_ICON);
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  if (!modalState.createServer) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione um arquivo de imagem válido (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5MB.');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      setIcon(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRandomIcon = () => {
    setIcon(DEFAULT_APP_ICON);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsLoading(true);
      setError('');
      await createServer({
        name: name.trim(),
        description: description.trim(),
        icon: icon || DEFAULT_APP_ICON
      });

      closeModal('createServer');
      setName('');
      setDescription('');
      setIcon(DEFAULT_APP_ICON);
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
      await joinByCode(inviteCode.trim());
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
              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/png, image/jpeg, image/webp, image/gif"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              {/* Server Icon Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: 16 }}>
                <div 
                  style={{ position: 'relative', width: 64, height: 64, cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => fileInputRef.current?.click()}
                  title="Clique para escolher foto do computador"
                >
                  <img 
                    src={icon}
                    alt="Ícone do Servidor" 
                    style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)', objectFit: 'cover', border: '2px solid var(--accent-primary)' }}
                  />
                  <div 
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                      color: '#fff'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
                  >
                    <Camera size={20} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Ícone do Servidor</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={13} />
                      Escolher Imagem
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={handleRandomIcon}
                    >
                      <RefreshCw size={13} />
                      Aleatório
                    </button>
                  </div>
                </div>
              </div>

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
