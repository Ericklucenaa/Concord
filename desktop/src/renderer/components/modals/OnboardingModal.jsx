import React, { useEffect, useRef, useState } from 'react';
import { Radio, Server, LogIn, Mic, Check, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';
import { useNotification } from '../../context/NotificationContext';
import { logWarn } from '../../services/log';

/** Microphone level meter for the "test your mic" step. */
function MicTest() {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);
  const cleanupRef = useRef(() => {});

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let frame;
      const loop = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(100, Math.round((avg / 128) * 100)));
        frame = requestAnimationFrame(loop);
      };
      loop();
      cleanupRef.current = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      };
    } catch (err) {
      logWarn('onboarding mic test', err);
      setError('Não foi possível acessar o microfone. Verifique as permissões do sistema.');
    }
  };

  useEffect(() => {
    start();
    return () => cleanupRef.current();
  }, []);

  if (error) return <div className="auth-error">{error}</div>;
  return (
    <div className="mic-test">
      <div className="mic-test-bar"><div style={{ width: `${level}%` }} /></div>
      <span>{level > 12 ? 'Estamos ouvindo você! 🎙️' : 'Fale algo para testar…'}</span>
    </div>
  );
}

export default function OnboardingModal() {
  const { user, updateProfile } = useAuth();
  const { modalState, closeModal, openModal, createServer, joinByCode, servers } = useServer();
  const { showError } = useNotification();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (!modalState.onboarding) return null;

  const finish = async () => {
    closeModal('onboarding');
    await updateProfile({ onboardingDone: true }).catch((err) => logWarn('onboarding done', err));
  };

  const createStarter = async () => {
    setBusy(true);
    try {
      await createServer({ name: `Servidor de ${user.username}`, description: 'Meu primeiro servidor no Concord', starter: true });
      setStep(2);
    } catch (err) {
      showError('Criar servidor', err.message);
    } finally {
      setBusy(false);
    }
  };

  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await joinByCode(code.replace(/.*#invite=/, '').trim());
      setStep(2);
    } catch (err) {
      showError('Entrar no servidor', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container onboarding" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-steps">
          {[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'done' : ''} />)}
        </div>

        {step === 0 && (
          <div className="onboarding-body">
            <Radio size={44} className="onboarding-icon" />
            <h2>Bem-vindo ao Concord, {user.username}!</h2>
            <p>Converse por texto, fale por voz e transmita sua tela com seus amigos. Vamos deixar tudo pronto em menos de um minuto.</p>
            <button className="btn btn-primary" onClick={() => setStep(1)}>Começar <ArrowRight size={16} /></button>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-body">
            <Server size={40} className="onboarding-icon" />
            <h2>Seu primeiro servidor</h2>
            <p>Servidores reúnem canais de texto e voz. Crie o seu ou entre com um convite.</p>
            <button className="btn btn-primary wide" disabled={busy} onClick={createStarter}>
              <Server size={16} /> Criar meu servidor
            </button>
            <form onSubmit={join} className="onboarding-join">
              <input className="form-input" placeholder="Código ou link de convite" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn btn-secondary" disabled={busy || !code.trim()}><LogIn size={16} /> Entrar</button>
            </form>
            <button className="link-button" onClick={() => setStep(2)}>
              {servers.length > 0 ? 'Já tenho servidores, pular' : 'Pular por enquanto'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-body">
            <Mic size={40} className="onboarding-icon" />
            <h2>Teste seu microfone</h2>
            <p>Você pode trocar o dispositivo, ativar "aperte para falar" e mais em Configurações → Voz & Áudio.</p>
            <MicTest />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => { finish(); openModal('settings'); }}>Abrir configurações de voz</button>
              <button className="btn btn-primary" onClick={finish}><Check size={16} /> Tudo pronto</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
