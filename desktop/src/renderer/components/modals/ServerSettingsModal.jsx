import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { 
  X, 
  Upload, 
  RefreshCw, 
  Camera, 
  Trash2, 
  Save, 
  Check, 
  Settings, 
  Shield 
} from 'lucide-react';
import { ROLES } from '@shared/constants';

export default function ServerSettingsModal() {
  const { 
    activeServer, 
    modalState, 
    closeModal, 
    updateServer, 
    deleteServer 
  } = useServer();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const isOwner = activeServer?.ownerId === user?.id || activeServer?.role === ROLES.OWNER;

  useEffect(() => {
    if (activeServer) {
      setName(activeServer.name || '');
      setDescription(activeServer.description || '');
      setIcon(activeServer.icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(activeServer.name || 'server')}`);
      setError('');
      setSaveSuccess(false);
    }
  }, [activeServer, modalState.serverSettings]);

  if (!modalState.serverSettings || !activeServer) return null;

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
    const seed = Math.random().toString(36).substring(7);
    setIcon(`https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome do servidor é obrigatório.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      setSaveSuccess(false);

      await updateServer(activeServer.id, {
        name: name.trim(),
        description: description.trim(),
        icon
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setError(err.message || 'Erro ao atualizar servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Tem certeza absoluta que deseja excluir o servidor "${activeServer.name}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      setIsSaving(true);
      await deleteServer(activeServer.id);
      closeModal('serverSettings');
    } catch (err) {
      setError(err.message || 'Erro ao excluir servidor.');
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => closeModal('serverSettings')}>
      <div className="modal-container" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={20} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="modal-title">Configurações do Servidor</h3>
          </div>
          <button className="icon-btn" onClick={() => closeModal('serverSettings')}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="auth-error" style={{ margin: '16px 20px 0' }}>{error}</div>}
        {saveSuccess && (
          <div style={{ margin: '16px 20px 0', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            Servidor atualizado com sucesso!
          </div>
        )}

        <form onSubmit={handleSave}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: 14, backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: 16 }}>
              <div 
                style={{ position: 'relative', width: 80, height: 80, cursor: 'pointer', flexShrink: 0 }}
                onClick={() => fileInputRef.current?.click()}
                title="Clique para escolher nova imagem para o servidor"
              >
                <img 
                  src={icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${name}`}
                  alt="Ícone do Servidor" 
                  style={{ width: 80, height: 80, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)', objectFit: 'cover', border: '2px solid var(--accent-primary)' }}
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
                  <Camera size={24} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Imagem do Servidor</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={15} />
                    Alterar Imagem
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    onClick={handleRandomIcon}
                  >
                    <RefreshCw size={14} />
                    Gerar Aleatório
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  A imagem aparecerá na barra lateral de todos os membros.
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Nome do Servidor</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Descrição do Servidor</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Sobre o que é este servidor?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Danger Zone */}
            {isOwner && (
              <div style={{ marginTop: 20, padding: 14, border: '1px solid var(--accent-danger)', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-danger)', margin: 0 }}>Excluir Servidor</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                      Remove este servidor e todos os seus canais permanentemente.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={handleDelete}
                    disabled={isSaving}
                  >
                    <Trash2 size={14} />
                    Excluir Servidor
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => closeModal('serverSettings')}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSaving || !name.trim()}
            >
              <Save size={15} />
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
