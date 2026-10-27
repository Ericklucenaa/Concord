import React, { useEffect, useState } from 'react';
import { Radio, Mic, Keyboard } from 'lucide-react';
import { useSettings } from '../../services/settings';
import { requestNotificationPermission } from '../../services/notificationService';

const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

function keyLabel(e) {
  if (e.key === ' ') return 'Espaço';
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key;
}

function Toggle({ checked, onChange, title, description, disabled }) {
  return (
    <label className={`toggle-row ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <div>
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
    </label>
  );
}

export function VoiceModeSettings() {
  const [settings, update] = useSettings();
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }
      update({ pttKey: e.code, pttKeyLabel: keyLabel(e) });
      setCapturing(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, update]);

  return (
    <div className="settings-card">
      <div className="settings-card-title">Modo de entrada</div>
      <div className="mode-choice">
        <button
          type="button"
          className={`mode-option ${settings.voiceMode === 'activity' ? 'active' : ''}`}
          onClick={() => update({ voiceMode: 'activity' })}
        >
          <Mic size={18} />
          <strong>Detecção de voz</strong>
          <span>O microfone abre quando você fala.</span>
        </button>
        <button
          type="button"
          className={`mode-option ${settings.voiceMode === 'ptt' ? 'active' : ''}`}
          onClick={() => update({ voiceMode: 'ptt' })}
        >
          <Radio size={18} />
          <strong>Aperte para falar</strong>
          <span>Só transmite enquanto a tecla estiver pressionada.</span>
        </button>
      </div>

      {settings.voiceMode === 'ptt' && (
        <div className="ptt-config">
          <div>
            <div className="form-label">Tecla de atalho</div>
            <button type="button" className={`keybind ${capturing ? 'capturing' : ''}`} onClick={() => setCapturing(true)}>
              <Keyboard size={14} />
              {capturing ? 'Pressione uma tecla… (Esc cancela)' : settings.pttKeyLabel}
            </button>
            <div className="hint">
              {isElectron
                ? 'Funciona mesmo com o Concord em segundo plano (ex.: durante um jogo).'
                : 'No navegador, o atalho só funciona com a aba do Concord em foco. Use o app de desktop para um atalho global.'}
            </div>
          </div>
          <div>
            <div className="form-label">Atraso ao soltar: {settings.pttReleaseDelayMs} ms</div>
            <input
              type="range"
              min="0"
              max="1000"
              step="50"
              value={settings.pttReleaseDelayMs}
              onChange={(e) => update({ pttReleaseDelayMs: Number(e.target.value) })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function AppSettingsPanel() {
  const [settings, update] = useSettings();
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [version, setVersion] = useState(null);

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then(setVersion).catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="settings-card">
        <div className="settings-card-title">Notificações</div>
        {permission !== 'granted' && permission !== 'unsupported' && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={async () => {
              await requestNotificationPermission();
              setPermission(Notification.permission);
            }}
          >
            Permitir notificações do sistema
          </button>
        )}
        <Toggle
          checked={settings.notifyMentions}
          onChange={(v) => update({ notifyMentions: v })}
          title="Menções"
          description="Quando alguém usar @seu-apelido ou @everyone."
        />
        <Toggle
          checked={settings.notifyDMs}
          onChange={(v) => update({ notifyDMs: v })}
          title="Mensagens diretas"
          description="Mensagens novas em conversas privadas e grupos."
        />
        <Toggle
          checked={settings.notificationSounds}
          onChange={(v) => update({ notificationSounds: v })}
          title="Som de notificação"
        />
        <div className="hint">No status "Não perturbe" nenhuma notificação é exibida.</div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">Aplicativo de desktop</div>
        <Toggle
          checked={settings.closeToTray}
          onChange={(v) => update({ closeToTray: v })}
          title="Minimizar para a bandeja ao fechar"
          description="O Concord continua rodando (voz e notificações) ao clicar no X."
          disabled={!isElectron}
        />
        <Toggle
          checked={settings.launchAtStartup}
          onChange={(v) => update({ launchAtStartup: v })}
          title="Iniciar com o Windows"
          description="Abre o Concord minimizado quando você liga o computador."
          disabled={!isElectron}
        />
        <Toggle
          checked={settings.overlayEnabled}
          onChange={(v) => update({ overlayEnabled: v })}
          title="Overlay nos jogos"
          description="Mostra quem está na chamada e quem está falando por cima dos jogos (modo janela ou tela cheia sem borda)."
          disabled={!isElectron}
        />
        <Toggle
          checked={settings.shareActivity}
          onChange={(v) => update({ shareActivity: v })}
          title="Mostrar o jogo que estou jogando"
          description="Seus amigos veem “Jogando …” no seu perfil enquanto um jogo conhecido estiver aberto."
          disabled={!isElectron}
        />
        {!isElectron && <div className="hint">Disponível apenas no aplicativo instalado.</div>}
        {version && <div className="hint">Versão instalada: v{version}</div>}
      </div>

      <div className="settings-card">
        <div className="settings-card-title">Atalhos de teclado</div>
        <div className="shortcut-list">
          <div><kbd>Ctrl</kbd> + <kbd>K</kbd><span>Ir para canal ou conversa</span></div>
          <div><kbd>Ctrl</kbd> + <kbd>F</kbd><span>Pesquisar no canal</span></div>
          <div><kbd>↑</kbd><span>Editar sua última mensagem (com a caixa vazia)</span></div>
          <div><kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd><span>Canal anterior / próximo</span></div>
          <div><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd><span>Silenciar / ativar microfone</span></div>
          <div><kbd>Esc</kbd><span>Cancelar resposta ou edição</span></div>
        </div>
      </div>
    </div>
  );
}
