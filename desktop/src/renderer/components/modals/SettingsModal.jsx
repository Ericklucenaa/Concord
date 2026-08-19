import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { useVoice } from '../../context/VoiceContext';
import { 
  X, 
  User, 
  Mic, 
  Volume2, 
  Moon, 
  Sun, 
  LogOut, 
  ShieldCheck, 
  KeyRound, 
  Save,
  Check,
  Copy,
  Upload,
  Camera,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import { USER_STATUS } from '@shared/constants';
import { useNotification } from '../../context/NotificationContext';

export default function SettingsModal() {
  const { modalState, closeModal } = useServer();
  const { user, updateProfile, logout } = useAuth();
  const { showSuccess, showError, showToast } = useNotification();
  const { 
    inputDevices, 
    outputDevices, 
    selectedInputDevice, 
    selectedOutputDevice, 
    setSelectedInputDevice, 
    setSelectedOutputDevice,
    refreshAudioDevices,
    micVolumeLevel
  } = useVoice();

  const [activeTab, setActiveTab] = useState('account'); // 'account', 'audio', 'appearance'
  const [username, setUsername] = useState(user?.username || '');
  const [copiedNickname, setCopiedNickname] = useState(false);
  const [status, setStatus] = useState(user?.status || USER_STATUS.ONLINE);
  const [customStatus, setCustomStatus] = useState(user?.customStatus || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || 'user'}`);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  const [isScanningDevices, setIsScanningDevices] = useState(false);
  const [deviceScanMessage, setDeviceScanMessage] = useState('');
  const [isPlayingSoundTest, setIsPlayingSoundTest] = useState(false);

  const fileInputRef = useRef(null);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const testStreamRef = useRef(null);
  const [testMicLevel, setTestMicLevel] = useState(0);

  const [theme, setTheme] = useState(() => localStorage.getItem('concord_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('concord_theme', theme);
  }, [theme]);

  if (!modalState.settings) return null;

  // Microphone Test with Web Audio API
  const toggleTestMic = async () => {
    if (isTestingMic) {
      if (testStreamRef.current) {
        testStreamRef.current.getTracks().forEach((t) => t.stop());
        testStreamRef.current = null;
      }
      setIsTestingMic(false);
      setTestMicLevel(0);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined }
      });
      testStreamRef.current = stream;
      setIsTestingMic(true);

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        if (!testStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setTestMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      console.warn('Mic test error:', err);
    }
  };

  // Scan and validate real audio hardware devices
  const handleScanRealDevices = async () => {
    try {
      setIsScanningDevices(true);
      setDeviceScanMessage('');
      const res = await refreshAudioDevices(true);
      setDeviceScanMessage(`✓ Validação concluída: ${res.inputs.length} microfone(s) e ${res.outputs.length} dispositivo(s) de som reais detectados no seu PC.`);
      setTimeout(() => setDeviceScanMessage(''), 5000);
    } catch (err) {
      console.warn('Scan devices failed:', err);
    } finally {
      setIsScanningDevices(false);
    }
  };

  // Play a pleasant chime tone to test the chosen speaker/headset
  const handleTestOutputSound = () => {
    try {
      setIsPlayingSoundTest(true);
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Note 1 (523.25 Hz - C5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.5);

      // Note 2 (659.25 Hz - E5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
      gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.65);

      // Note 3 (783.99 Hz - G5)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24);
      gain3.gain.setValueAtTime(0.18, ctx.currentTime + 0.24);
      gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.85);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(ctx.currentTime + 0.24);
      osc3.stop(ctx.currentTime + 0.85);

      setTimeout(() => setIsPlayingSoundTest(false), 900);
    } catch (e) {
      setIsPlayingSoundTest(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('A foto de perfil deve ter no máximo 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRandomAvatar = () => {
    const randomSeed = Math.random().toString(36).substring(7);
    const newAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${randomSeed}`;
    setAvatarPreview(newAvatar);
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setError('');
      setSaveSuccess(false);

      const cleanUser = username.trim().replace(/^@/, '');
      if (!cleanUser || cleanUser.length < 3 || cleanUser.length > 24) {
        setError('O apelido deve ter entre 3 e 24 caracteres.');
        setIsSaving(false);
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(cleanUser)) {
        setError('O apelido deve conter apenas letras, números e underline (_).');
        setIsSaving(false);
        return;
      }

      await updateProfile({
        username: cleanUser,
        userTag,
        avatar: avatarPreview,
        status,
        customStatus: customStatus.trim(),
        ...(newPassword ? { currentPassword, newPassword } : {})
      });

      setSaveSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      showToast(`Perfil atualizado com sucesso! Identificador: ${cleanUser}#${userTag}`, 'success');
      showSuccess('Perfil Atualizado!', `Seu apelido agora é ${cleanUser}#${userTag} e já está sincronizado em tempo real sem precisar atualizar a tela.`);
    } catch (err) {
      setError(err.message || 'Erro ao salvar perfil.');
      showError('Não foi possível salvar', err.message || 'Erro ao atualizar dados do perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => closeModal('settings')}>
      <div className="modal-container" style={{ width: 740, height: 600 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', height: '100%' }}>
          {/* Settings Sidebar */}
          <div 
            style={{ 
              width: 200, 
              backgroundColor: 'var(--bg-tertiary)', 
              borderRight: '1px solid var(--border-color)',
              padding: '16px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}
          >
            <div style={{ padding: '0 8px 8px', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Configurações
            </div>

            <button 
              className={`btn ${activeTab === 'account' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', border: 'none', padding: '8px 12px' }}
              onClick={() => setActiveTab('account')}
            >
              <User size={16} />
              Minha Conta
            </button>

            <button 
              className={`btn ${activeTab === 'audio' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', border: 'none', padding: '8px 12px' }}
              onClick={() => setActiveTab('audio')}
            >
              <Mic size={16} />
              Voz & Áudio
            </button>

            <button 
              className={`btn ${activeTab === 'appearance' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', border: 'none', padding: '8px 12px' }}
              onClick={() => setActiveTab('appearance')}
            >
              <Moon size={16} />
              Aparência
            </button>

            <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
              <button 
                className="btn btn-danger"
                style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 12px' }}
                onClick={() => {
                  closeModal('settings');
                  logout();
                }}
              >
                <LogOut size={16} />
                Sair da Conta
              </button>
            </div>
          </div>

          {/* Settings Content Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {activeTab === 'account' && 'Minha Conta'}
                {activeTab === 'audio' && 'Configurações de Áudio & Microfone'}
                {activeTab === 'appearance' && 'Aparência & Personalização'}
              </h3>
              <button className="icon-btn" onClick={() => closeModal('settings')}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ flex: 1 }}>
              {error && <div className="auth-error">{error}</div>}
              {saveSuccess && (
                <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  Configurações salvas com sucesso!
                </div>
              )}

              {/* ACCOUNT TAB */}
              {activeTab === 'account' && (
                <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png, image/jpeg, image/webp, image/gif"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />

                  {/* Avatar Picker Section */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: 14, backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div 
                      style={{ position: 'relative', width: 72, height: 72, cursor: 'pointer', flexShrink: 0 }}
                      onClick={() => fileInputRef.current?.click()}
                      title="Clique para escolher foto do computador"
                    >
                      <img 
                        src={avatarPreview}
                        alt="Avatar" 
                        style={{ width: 72, height: 72, borderRadius: 'var(--radius-full)', backgroundColor: 'var(--bg-primary)', objectFit: 'cover', border: '2px solid var(--accent-primary)' }}
                      />
                      <div 
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          borderRadius: 'var(--radius-full)',
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
                        <Camera size={22} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>Foto de Perfil</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '5px 12px', fontSize: 12 }}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload size={14} />
                          Alterar Foto
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '5px 12px', fontSize: 12 }}
                          onClick={handleRandomAvatar}
                        >
                          <RefreshCw size={13} />
                          Gerar Aleatório
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Nickname / Meu Apelido Section */}
                  <div className="form-group" style={{ backgroundColor: 'var(--bg-tertiary)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label className="form-label" style={{ marginBottom: 0, fontWeight: 700 }}>
                        Meu apelido
                      </label>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={copyMyNickname}
                        title={`Copiar ${username || user?.username}#${userTag}`}
                      >
                        {copiedNickname ? <Check size={13} style={{ color: 'var(--accent-success)' }} /> : <Copy size={13} />}
                        {copiedNickname ? 'Copiado!' : 'Copiar Apelido'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="ex: seu_apelido" 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)}
                        style={{ flex: 1, fontWeight: 600 }}
                        required 
                      />
                      <span 
                        style={{ 
                          padding: '8px 12px', 
                          backgroundColor: 'var(--bg-secondary)', 
                          borderRadius: 'var(--radius-sm)', 
                          fontFamily: 'var(--font-mono)', 
                          fontSize: 13, 
                          color: 'var(--text-muted)', 
                          fontWeight: 700, 
                          border: '1px solid var(--border-color)' 
                        }}
                      >
                        #{userTag}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                      Seu identificador completo para amigos e convites é <strong>{username || user?.username}#{userTag}</strong>.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Status Personalizado / Atividade</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="ex: Trabalhando, Estudando, Ouvindo música, Disponível, Em reunião..." 
                      value={customStatus} 
                      onChange={(e) => setCustomStatus(e.target.value)}
                      maxLength={60}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Status de Presença</label>
                    <select 
                      className="form-select"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value={USER_STATUS.ONLINE}>🟢 Online</option>
                      <option value={USER_STATUS.IDLE}>🟡 Ausente</option>
                      <option value={USER_STATUS.DND}>🔴 Não Perturbe</option>
                      <option value={USER_STATUS.OFFLINE}>⚪ Invisível</option>
                    </select>
                  </div>

                  {/* Password Change Section */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      <KeyRound size={15} />
                      Alterar Senha de Acesso (Opcional)
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Senha Atual</label>
                        <input 
                          type="password" 
                          className="form-input" 
                          placeholder="••••••••" 
                          value={currentPassword} 
                          onChange={(e) => setCurrentPassword(e.target.value)} 
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Nova Senha</label>
                        <input 
                          type="password" 
                          className="form-input" 
                          placeholder="Mínimo 6 caracteres" 
                          value={newPassword} 
                          onChange={(e) => setNewPassword(e.target.value)} 
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ padding: '8px 18px', fontWeight: 700 }}>
                      <Save size={15} />
                      {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              )}

              {/* AUDIO & VOICE TAB */}
              {activeTab === 'audio' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Detectar Dispositivos de Áudio do Sistema</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Escaneia microfones e fones reais conectados</div>
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-primary"
                      onClick={handleScanRealDevices}
                      disabled={isScanningDevices}
                      style={{ padding: '6px 12px', fontSize: 12 }}
                    >
                      <RefreshCw size={13} className={isScanningDevices ? 'spin' : ''} />
                      {isScanningDevices ? 'Escaneando...' : 'Escanear'}
                    </button>
                  </div>

                  {deviceScanMessage && (
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                      {deviceScanMessage}
                    </div>
                  )}

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>Dispositivo de Entrada (Microfone)</label>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inputDevices.length} detectado(s)</span>
                    </div>
                    <select 
                      className="form-select"
                      value={selectedInputDevice}
                      onChange={(e) => setSelectedInputDevice(e.target.value)}
                    >
                      {inputDevices.map((dev) => (
                        <option key={dev.deviceId} value={dev.deviceId}>
                          🎤 {dev.label || `Microfone (${dev.deviceId.substring(0, 5)})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>Dispositivo de Saída (Alto-falantes / Fone)</label>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{outputDevices.length} detectado(s)</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select 
                        className="form-select"
                        value={selectedOutputDevice}
                        onChange={(e) => setSelectedOutputDevice(e.target.value)}
                        style={{ flex: 1 }}
                      >
                        {outputDevices.map((dev) => (
                          <option key={dev.deviceId} value={dev.deviceId}>
                            🔊 {dev.label || `Alto-falante (${dev.deviceId.substring(0, 5)})`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0 12px', fontSize: 12, whiteSpace: 'nowrap' }}
                        onClick={handleTestOutputSound}
                        disabled={isPlayingSoundTest}
                      >
                        <Volume2 size={15} />
                        {isPlayingSoundTest ? 'Tocando...' : 'Testar Saída'}
                      </button>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                    <label className="form-label">Teste de Microfone em Tempo Real</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                      <button 
                        type="button" 
                        className={`btn ${isTestingMic ? 'btn-danger' : 'btn-primary'}`}
                        onClick={toggleTestMic}
                      >
                        <Mic size={15} />
                        {isTestingMic ? 'Parar Teste' : 'Iniciar Teste'}
                      </button>

                      <div 
                        style={{ 
                          flex: 1, 
                          height: 12, 
                          backgroundColor: 'var(--bg-tertiary)', 
                          borderRadius: 'var(--radius-sm)', 
                          overflow: 'hidden',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        <div 
                          style={{ 
                            width: `${isTestingMic ? testMicLevel : micVolumeLevel}%`, 
                            height: '100%', 
                            backgroundColor: (isTestingMic ? testMicLevel : micVolumeLevel) > 70 ? 'var(--accent-warning)' : 'var(--accent-success)',
                            transition: 'width 0.05s ease'
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* APPEARANCE TAB */}
              {activeTab === 'appearance' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Theme Selector */}
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, marginBottom: 8 }}>
                      Tema da Interface
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {/* 1. Discord Dark */}
                      <div 
                        className={`source-item ${theme === 'dark' ? 'selected' : ''}`}
                        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: '#313338', border: theme === 'dark' ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)' }}
                        onClick={() => setTheme('dark')}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#f2f3f5' }}>Escuro Clássico</div>
                        <div style={{ fontSize: 11, color: '#949ba4' }}>Padrão Discord Dark</div>
                      </div>

                      {/* 2. Midnight OLED */}
                      <div 
                        className={`source-item ${theme === 'midnight' ? 'selected' : ''}`}
                        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: '#000000', border: theme === 'midnight' ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.15)' }}
                        onClick={() => setTheme('midnight')}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>Midnight OLED</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Preto Absoluto</div>
                      </div>

                      {/* 3. Slate / Grafite */}
                      <div 
                        className={`source-item ${theme === 'slate' ? 'selected' : ''}`}
                        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: '#181a20', border: theme === 'slate' ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)' }}
                        onClick={() => setTheme('slate')}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>Grafite / Slate</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Cinza Neutro Sóbrio</div>
                      </div>

                      {/* 4. Ocean Navy */}
                      <div 
                        className={`source-item ${theme === 'ocean' ? 'selected' : ''}`}
                        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: '#0a1118', border: theme === 'ocean' ? '2px solid var(--accent-primary)' : '1px solid rgba(56,189,248,0.2)' }}
                        onClick={() => setTheme('ocean')}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#f0f9ff' }}>Deep Ocean</div>
                        <div style={{ fontSize: 11, color: '#7dd3fc' }}>Azul Profundo Navy</div>
                      </div>

                      {/* 5. Forest Dark */}
                      <div 
                        className={`source-item ${theme === 'forest' ? 'selected' : ''}`}
                        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: '#0a1410', border: theme === 'forest' ? '2px solid var(--accent-primary)' : '1px solid rgba(52,211,153,0.2)' }}
                        onClick={() => setTheme('forest')}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#ecfdf5' }}>Forest Dark</div>
                        <div style={{ fontSize: 11, color: '#6ee7b7' }}>Esmeralda Noturno</div>
                      </div>

                      {/* 6. Light Mode */}
                      <div 
                        className={`source-item ${theme === 'light' ? 'selected' : ''}`}
                        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: '#ffffff', border: theme === 'light' ? '2px solid var(--accent-primary)' : '1px solid rgba(0,0,0,0.15)' }}
                        onClick={() => setTheme('light')}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#060607' }}>Claro Clássico</div>
                        <div style={{ fontSize: 11, color: '#5c5e66' }}>Tema Branco Limpo</div>
                      </div>
                    </div>
                  </div>

                  {/* Custom Wallpaper Section */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                    <input 
                      type="file" 
                      ref={wallpaperInputRef} 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={handleWallpaperSelect}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Papel de Parede Personalizado do App</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Defina uma imagem de fundo para o Concord</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button 
                          type="button" 
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={() => wallpaperInputRef.current?.click()}
                        >
                          <Upload size={13} />
                          Escolher Imagem
                        </button>
                        {wallpaper && (
                          <button 
                            type="button" 
                            className="btn btn-secondary hover-danger"
                            style={{ padding: '6px 12px', fontSize: 12 }}
                            onClick={handleRemoveWallpaper}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </div>

                    {wallpaper ? (
                      <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                          <img 
                            src={wallpaper} 
                            alt="Wallpaper Preview" 
                            style={{ width: 90, height: 55, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}
                          />
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                <span>Opacidade da Imagem:</span>
                                <strong>{wallpaperOpacity}%</strong>
                              </div>
                              <input 
                                type="range" 
                                min="10" 
                                max="100" 
                                value={wallpaperOpacity} 
                                onChange={(e) => handleUpdateOpacity(Number(e.target.value))}
                                style={{ width: '100%' }}
                              />
                            </div>

                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                <span>Desfoque (Blur):</span>
                                <strong>{wallpaperBlur}px</strong>
                              </div>
                              <input 
                                type="range" 
                                min="0" 
                                max="20" 
                                value={wallpaperBlur} 
                                onChange={(e) => handleUpdateBlur(Number(e.target.value))}
                                style={{ width: '100%' }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '14px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                        Nenhum papel de parede ativo. Clique em "Escolher Imagem" para personalizar seu fundo.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
