import React, { useRef, useState } from 'react';
import { Download, Trash2, MailCheck, ShieldCheck, Mic, Square, Play, Keyboard, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';
import { useDM } from '../../context/DMContext';
import { useVoice } from '../../context/VoiceContext';
import { useNotification } from '../../context/NotificationContext';
import { useSettings } from '../../services/settings';
import { exportMyData, deleteMyData } from '../../services/cloud/account';

const BANNER_COLORS = ['#5b4ae6', '#2f7bff', '#14b8a6', '#22c55e', '#f59e0b', '#f43f5e', '#ec4899', '#64748b'];

/** Bio and profile banner color (shown on the profile card). */
export function ProfileExtras() {
  const { user, updateProfile } = useAuth();
  const { showToast, showError } = useNotification();
  const [bio, setBio] = useState(user.bio || '');
  const [color, setColor] = useState(user.bannerColor || BANNER_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ bio, bannerColor: color });
      showToast('Perfil atualizado.', 'success');
    } catch (err) {
      showError('Perfil', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-title">Cartão de perfil</div>
      <div className="profile-preview" style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }} />
      <div className="color-swatches">
        {BANNER_COLORS.map((c) => (
          <button key={c} type="button" className={`swatch ${c === color ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Cor ${c}`} />
        ))}
      </div>
      <label className="form-label" htmlFor="bio">Sobre mim ({bio.length}/190)</label>
      <textarea id="bio" className="form-input" rows={3} maxLength={190} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Conte um pouco sobre você, seus jogos favoritos…" />
      <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={save} disabled={saving}>
        {saving ? 'Salvando…' : 'Salvar cartão'}
      </button>
    </div>
  );
}

function downloadJson(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Privacy settings, e-mail verification, data export and account deletion. */
export function PrivacyAccountPanel() {
  const { user, updateProfile, resendVerification, deleteAccount } = useAuth();
  const { servers } = useServer();
  const { threads } = useDM();
  const { showToast, showError, showConfirm } = useNotification();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const doExport = async () => {
    setExporting(true);
    try {
      const data = await exportMyData(user.id, servers, threads);
      downloadJson(data, `concord-meus-dados-${new Date().toISOString().slice(0, 10)}.json`);
      showToast('Seus dados foram baixados.', 'success');
    } catch (err) {
      showError('Exportar dados', err.message);
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async () => {
    const ok = await showConfirm(
      'Excluir conta definitivamente',
      'Suas mensagens, amizades, servidores que você criou (a propriedade passa para outro membro) e o seu perfil serão apagados. Não dá para desfazer.',
      { isDanger: true, confirmText: 'Excluir minha conta' }
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteAccount(password, () => deleteMyData(user, servers, threads, setProgress));
    } catch (err) {
      showError('Excluir conta', err.message);
      setDeleting(false);
      setProgress('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="settings-card">
        <div className="settings-card-title">Privacidade</div>
        <label className="form-label">Quem pode me mandar mensagens diretas</label>
        <select className="form-select" value={user.dmPolicy} onChange={(e) => updateProfile({ dmPolicy: e.target.value })}>
          <option value="everyone">Qualquer pessoa</option>
          <option value="friends">Só amigos</option>
        </select>
        <div className="hint">Pessoas que você bloquear nunca conseguem mandar mensagens nem te adicionar em grupos.</div>
      </div>

      {user.isPasswordAccount && (
        <div className="settings-card">
          <div className="settings-card-title">E-mail</div>
          {user.emailVerified ? (
            <div className="verified-row"><ShieldCheck size={16} /> {user.email} — verificado</div>
          ) : (
            <>
              <div className="hint">{user.email} ainda não foi verificado. A verificação ajuda a recuperar a conta se você esquecer a senha.</div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => resendVerification().then(() => showToast('E-mail de verificação enviado.', 'success')).catch((err) => showError('Verificação', err.message))}
              >
                <MailCheck size={14} /> Enviar e-mail de verificação
              </button>
            </>
          )}
        </div>
      )}

      <div className="settings-card">
        <div className="settings-card-title">Seus dados</div>
        <div className="hint">Baixe um arquivo com seu perfil, amizades, servidores e mensagens.</div>
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={doExport} disabled={exporting}>
          <Download size={14} /> {exporting ? 'Preparando…' : 'Baixar meus dados'}
        </button>
      </div>

      <div className="settings-card danger-zone">
        <div className="settings-card-title">Excluir conta</div>
        <div className="hint">Para confirmar, digite EXCLUIR{user.isPasswordAccount ? ' e sua senha' : ''}.</div>
        <input className="form-input" placeholder="EXCLUIR" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        {user.isPasswordAccount && (
          <input className="form-input" type="password" placeholder="Senha atual" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
        {progress && <div className="hint">{progress}</div>}
        <button
          type="button"
          className="btn btn-danger btn-sm"
          style={{ alignSelf: 'flex-start' }}
          disabled={deleting || confirmText !== 'EXCLUIR' || (user.isPasswordAccount && !password)}
          onClick={doDelete}
        >
          <Trash2 size={14} /> {deleting ? 'Excluindo…' : 'Excluir minha conta'}
        </button>
      </div>
    </div>
  );
}

function shortcutLabel(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join(' + ');
}

function ShortcutField({ label, value, onChange }) {
  const [capturing, setCapturing] = useState(false);
  return (
    <div className="shortcut-field">
      <span>{label}</span>
      <button
        type="button"
        className={`keybind ${capturing ? 'capturing' : ''}`}
        onClick={() => setCapturing(true)}
        onKeyDown={(e) => {
          if (!capturing) return;
          e.preventDefault();
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
          if (e.key === 'Escape') {
            setCapturing(false);
            return;
          }
          onChange({ code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, label: shortcutLabel(e) });
          setCapturing(false);
        }}
        onBlur={() => setCapturing(false)}
      >
        <Keyboard size={14} /> {capturing ? 'Pressione a combinação…' : value?.label || 'Nenhum'}
      </button>
      {value && <button type="button" className="icon-btn" aria-label="Remover atalho" onClick={() => onChange(null)}><X size={14} /></button>}
    </div>
  );
}

/** AI noise suppression, mic/speaker test and global shortcuts. */
export function VoiceExtras() {
  const { aiNoiseSuppression, updateAiNoiseSuppression } = useVoice();
  const [settings, update] = useSettings();
  const [recording, setRecording] = useState(false);
  const [clipUrl, setClipUrl] = useState(null);
  const recorderRef = useRef(null);

  const record = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const chunks = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setClipUrl(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })));
      setRecording(false);
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    setClipUrl(null);
    setTimeout(() => rec.state === 'recording' && rec.stop(), 5000);
  };

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-title">Supressão de ruído com IA</div>
        <label className="toggle-row">
          <input type="checkbox" checked={aiNoiseSuppression} onChange={(e) => updateAiNoiseSuppression(e.target.checked)} />
          <div>
            <strong>Remover ruído com IA (RNNoise)</strong>
            <span>Tira teclado, ventilador e barulho de fundo muito melhor que o filtro padrão. Usa um pouco mais de CPU.</span>
          </div>
        </label>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">Teste de microfone</div>
        <div className="hint">Grave 5 segundos e ouça como os outros escutam você.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {recording ? (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => recorderRef.current?.stop()}><Square size={13} /> Parar</button>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={record}><Mic size={14} /> Gravar teste</button>
          )}
          {clipUrl && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => new Audio(clipUrl).play()}><Play size={14} /> Ouvir</button>
          )}
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">Atalhos globais</div>
        <div className="hint">Funcionam mesmo com o Concord em segundo plano (app de desktop).</div>
        <ShortcutField label="Silenciar / ativar microfone" value={settings.muteShortcut} onChange={(v) => update({ muteShortcut: v })} />
        <ShortcutField label="Ensurdecer / ativar áudio" value={settings.deafenShortcut} onChange={(v) => update({ deafenShortcut: v })} />
      </div>
    </>
  );
}
