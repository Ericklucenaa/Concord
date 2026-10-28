// End-to-end call test in real Electron windows (separate sessions, fake
// microphones, Firebase emulators):
//   1. voice: A and B join, C joins late — everyone must hear everyone;
//   2. screen: A and B both present AND watch each other at the same time;
//      stopping watching keeps presenting, stopping presenting keeps watching.
const { app, BrowserWindow, desktopCapturer } = require('electron');
const path = require('path');

const MAIN = process.env.CONCORD_MAIN;
const PRELOAD = path.join(path.dirname(MAIN), '../preload/index.cjs');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
require(MAIN);

const FS = 'http://127.0.0.1:8085/v1/projects/concord-3af70/databases/(default)/documents';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const SPEECH_B64 = require('fs').readFileSync(path.join(__dirname, 'speech.wav')).toString('base64');

// Real speech as the microphone (Chromium's fake device only beeps, which
// noise suppression removes and short polls miss). Each window starts the
// loop at a different offset.
const speechMic = (offset) => `
  (() => {
    const b64 = '${SPEECH_B64}';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!constraints?.audio || constraints.video) return origGUM(constraints);
      const ctx = new (window.__OrigAudioContext || AudioContext)();
      const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest); src.start(0, ${offset});
      return dest.stream;
    };
    return true;
  })()`;
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}

// Injected into each page: UI helpers plus probes on Web Audio analysers so
// we can tell whether each remote participant's audio actually arrives.
const HELPERS = `window.__e2e = {
  setValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  byPlaceholder(p) { return [...document.querySelectorAll('input,textarea')].find((e) => (e.placeholder || '').includes(p)); },
  clickText(t) {
    const el = [...document.querySelectorAll('button,a,[role=button]')].find((e) => e.textContent.trim().toLowerCase().includes(t.toLowerCase()) && e.offsetParent !== null);
    if (!el) throw new Error('no clickable with text: ' + t);
    el.click(); return true;
  },
  hasText(t) { return document.body.innerText.toLowerCase().includes(t.toLowerCase()); }
};
if (!window.__probe) {
  window.__probe = { ctxs: [], analysers: [] };
  const OrigCtx = window.AudioContext; window.__OrigAudioContext = OrigCtx;
  window.AudioContext = function (...a) { const c = new OrigCtx(...a); window.__probe.ctxs.push(c); c.__where = ((new Error().stack.match(/(VoiceContext|noiseSuppression|soundEffects|SettingsModal|AccountPanels)[^)]*/) || ['?'])[0]).slice(0, 80) + ' @' + Math.round(performance.now() / 1000); return c; };
  window.AudioContext.prototype = OrigCtx.prototype;
  const gbf = AnalyserNode.prototype.getByteFrequencyData;
  AnalyserNode.prototype.getByteFrequencyData = function (arr) {
    gbf.call(this, arr);
    let s = 0; for (const x of arr) s += x;
    const lvl = Math.round((s / arr.length / 128) * 100);
    let entry = window.__probe.analysers.find((e) => e.node === this);
    if (!entry) { entry = { node: this, ctx: window.__probe.ctxs.indexOf(this.context), max: 0, recentMax: 0 }; window.__probe.analysers.push(entry); }
    entry.max = Math.max(entry.max, lvl);
    entry.recentMax = Math.max(entry.recentMax, lvl);
  };
}`;

function api(win) {
  const js = (code) => win.webContents.executeJavaScript(`(async()=>{ ${HELPERS}; ${code} })()`, true);
  const waitFor = async (code, label, timeout = 25000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (await js(`return Boolean(${code});`)) return; } catch { /* not ready */ }
      await sleep(250);
    }
    throw new Error('timeout: ' + label + '\n' + (await js('return document.body.innerText').catch(() => '')).slice(0, 600));
  };
  const click = async (text) => {
    await waitFor(`(() => { try { return __e2e.clickText(${JSON.stringify(text)}); } catch { return false; } })()`, 'click ' + text);
  };
  return { js, waitFor, click };
}

async function register(win, nick) {
  const { js, waitFor, click } = api(win);
  await waitFor(`__e2e.hasText('Cadastre-se')`, 'auth');
  await js(`__e2e.clickText('Cadastre-se')`);
  await waitFor(`__e2e.byPlaceholder('Seu apelido')`, 'register');
  await js(`
    __e2e.setValue(__e2e.byPlaceholder('Seu apelido'), '${nick}');
    __e2e.setValue(__e2e.byPlaceholder('seuemail@exemplo.com'), '${nick}@example.com');
    [...document.querySelectorAll('input[type=password]')].forEach((p) => __e2e.setValue(p, 'senha-segura-123'));
  `);
  await js(`document.querySelector('form button[type=submit]').click()`);
  await click('Começar');
  await click('Criar meu servidor');
  await click('Tudo pronto');
  await waitFor(`document.querySelector('.chat-textarea')`, 'chat');
  return js(`const m = await import('/src/renderer/services/firebase.js'); return m.auth.currentUser.uid;`);
}

/** Remote participants whose audio reached my speakers since the last reset. */
const audibleRemotes = (win) => api(win).js(`
  const p = window.__probe;
  for (const a of p.analysers) a.recentMax = 0;
  await new Promise((r) => setTimeout(r, 3000));
  // The output context is the one holding one analyser per remote peer.
  const byCtx = new Map();
  for (const a of p.analysers) { if (!byCtx.has(a.ctx)) byCtx.set(a.ctx, []); byCtx.get(a.ctx).push(a); }
  // Output context = the most recently created context that owns analysers
  // (the mic detector is created before it, when joining).
  const outIdx = Math.max(...[...byCtx.keys()].filter((i) => window.__probe.ctxs[i]?.state === 'running' && /VoiceContext/.test(window.__probe.ctxs[i].__where || '')));
  const best = byCtx.get(outIdx) || [];
  const live = best.filter((a) => a.recentMax >= 14).length;
  const pcs = (window.__pcs || []).filter((pc) => pc.connectionState === 'connected').length;
  return { audible: live, analysers: best.length, levels: best.map((a) => a.recentMax).join('/') };
`);

const diag = (win) => api(win).js(`
  const out = [];
  for (const pc of window.__pcs || []) {
    if (pc.connectionState === 'closed') continue;
    const r = await pc.getStats();
    let inPk = 0, outB = 0;
    r.forEach((s) => { if (s.type === 'inbound-rtp' && s.kind === 'audio') inPk += s.packetsReceived || 0; if (s.type === 'outbound-rtp' && s.kind === 'audio') outB += s.bytesSent || 0; });
    out.push(pc.connectionState + '/' + pc.signalingState + ' in=' + inPk + ' out=' + outB + ' snd=' + pc.getSenders().map((x) => x.track ? x.track.kind[0] + (x.track.enabled ? '+' : '-') + x.track.readyState[0] : '0').join(',') + ' rcv=' + pc.getReceivers().map((x) => x.track.kind[0] + x.track.readyState[0]).join(','));
  }
  const det = window.__probe.analysers.map((a) => 'c' + a.ctx + ':' + a.max).join(' ');
  return JSON.stringify({ pcs: out, analysers: det, ctxs: window.__probe.ctxs.map((c) => c.state + ' ' + c.__where).join(' | ') });
`);

const streamState = (win) => api(win).js(`
  const v = document.querySelector('.screen-video');
  const sharing = Boolean(document.querySelector('.dock-btn.on[title="Parar transmissão"]'));
  if (!v) return { sharing, video: false, badge: document.querySelector('.stream-overlay-badge')?.textContent || null };
  const q1 = v.getVideoPlaybackQuality().totalVideoFrames;
  await new Promise((r) => setTimeout(r, 1500));
  const q2 = v.getVideoPlaybackQuality().totalVideoFrames;
  const track = v.srcObject?.getVideoTracks?.()[0];
  return {
    sharing,
    video: true,
    width: v.videoWidth,
    framesAdvancing: q2 > q1,
    badge: document.querySelector('.stream-overlay-badge')?.textContent || null,
    remoteTrack: Boolean(track && !/screen|window|desktop/i.test(track.label)),
    label: track?.label || null
  };
`);

async function joinChannel(win, label, serverTag, voiceName) {
  const { js, waitFor } = api(win);
  await js(`[...document.querySelectorAll('.server-sidebar .server-icon-wrapper')].find((x) => (x.title || '').includes('${serverTag}'))?.querySelector('.server-btn')?.click()`);
  await waitFor(`[...document.querySelectorAll('.channel-item')].some((e) => e.textContent.includes('${voiceName}'))`, 'voice channel ' + label);
  await js(`[...document.querySelectorAll('.channel-item')].find((e) => e.textContent.includes('${voiceName}')).click()`);
}

async function startShare(win, label) {
  const { js, waitFor, click } = api(win);
  await js(`document.querySelector('.dock-btn[title="Transmitir tela"]').click()`);
  await waitFor(`document.querySelector('.source-item')`, 'screen sources ' + label);
  await js(`document.querySelector('.source-item').click()`);
  await click('Iniciar Transmissão');
  await waitFor(`document.querySelector('.dock-btn.on[title="Parar transmissão"]')`, 'sharing ' + label);
}

app.whenReady().then(async () => {
  await sleep(300);
  const existing = BrowserWindow.getAllWindows();
  const mk = (part) => {
    const w = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { offscreen: true, preload: PRELOAD, contextIsolation: true, sandbox: false, partition: part, backgroundThrottling: false } });
    const ses = w.webContents.session;
    ses.setPermissionRequestHandler((_wc, _p, cb) => cb(true));
    ses.setDisplayMediaRequestHandler(async (_req, cb) => {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      cb({ video: sources[0] });
    });
    return w;
  };
  const A = mk('persist:call-a');
  const B = mk('persist:call-b');
  const C = mk('persist:call-c');
  existing.forEach((w) => w.destroy());
  setTimeout(() => { console.log('RESULT timeout'); app.exit(1); }, 420000);
  for (const w of [A, B, C]) {
    await w.webContents.session.clearStorageData();
    await w.loadURL('http://localhost:5173');
    if (process.env.AI_OFF) {
      await w.webContents.executeJavaScript(`localStorage.setItem('concord_ai_noise', 'false'); true`);
      await w.loadURL('http://localhost:5173');
    }
    await w.webContents.executeJavaScript(speechMic([A, B, C].indexOf(w) * 6));
    await w.webContents.executeJavaScript(`window.__pcs = []; const O = window.RTCPeerConnection; window.RTCPeerConnection = function (...a) { const pc = new O(...a); window.__pcs.push(pc); return pc; }; window.RTCPeerConnection.prototype = O.prototype; true;`);
  }
  try {
    const tag = Date.now().toString(36).slice(-4);
    const names = { A: `ana${tag}`, B: `bruno${tag}`, C: `caio${tag}` };
    const aId = await register(A, names.A);
    const bId = await register(B, names.B);
    const cId = await register(C, names.C);
    // Registration reloads nothing, but make sure the RTCPeerConnection spy is present.
    for (const w of [A, B, C]) {
      await w.webContents.executeJavaScript(`if (!window.__pcs) { window.__pcs = []; const O = window.RTCPeerConnection; window.RTCPeerConnection = function (...a) { const pc = new O(...a); window.__pcs.push(pc); return pc; }; window.RTCPeerConnection.prototype = O.prototype; } true;`);
      await api(w).js('return 1');
    }

    const servers = await (await fetch(`${FS}/concord_servers`, { headers: { Authorization: 'Bearer owner' } })).json();
    const sDoc = servers.documents.find((d) => d.fields.ownerId?.stringValue === aId);
    const serverId = sDoc.name.split('/').pop();
    const members = sDoc.fields.memberIds.arrayValue.values.map((v) => v.stringValue);
    await fetch(`${FS}/concord_servers/${serverId}?updateMask.fieldPaths=memberIds`, {
      method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { memberIds: enc([...members, bId, cId]) } })
    });
    const voiceName = sDoc.fields.channels.arrayValue.values.map((v) => v.mapValue.fields).find((c) => c.type.stringValue === 'voice').name.stringValue;
    await sleep(2500);

    // --- 1. Voice ---------------------------------------------------------
    await joinChannel(A, 'A', names.A, voiceName);
    await joinChannel(B, 'B', names.A, voiceName);
    await sleep(6000);
    let a = await audibleRemotes(A);
    let b = await audibleRemotes(B);
    check('voz: A ouve B', a.audible >= 1, JSON.stringify(a));
    check('voz: B ouve A', b.audible >= 1, JSON.stringify(b));

    await joinChannel(C, 'C', names.A, voiceName); // late join
    await sleep(7000);
    a = await audibleRemotes(A);
    b = await audibleRemotes(B);
    const c = await audibleRemotes(C);
    check('voz (entrada tardia): A ouve B e C', a.audible >= 2, JSON.stringify(a));
    check('voz (entrada tardia): B ouve A e C', b.audible >= 2, JSON.stringify(b));
    check('voz (entrada tardia): C ouve A e B', c.audible >= 2, JSON.stringify(c));
    if (process.env.DIAG) { for (const [n, w] of [['A', A], ['B', B], ['C', C]]) console.log('DIAG', n, await diag(w)); }

    // Mute: A mutes, B and C should stop hearing A.
    await api(A).js(`document.querySelector('.dock-btn[title="Silenciar microfone"]').click()`);
    await sleep(1500);
    b = await audibleRemotes(B);
    check('mute: com A mudo, B ouve só C', b.audible === 1, JSON.stringify(b));
    await api(A).js(`document.querySelector('.dock-btn[title="Ativar microfone"]').click()`);

    // C leaves to keep the screen test focused on A and B.
    await api(C).js(`document.querySelector('.dock-btn.leave')?.click()`);

    // --- 2. Screen: present and watch simultaneously -----------------------
    await startShare(A, 'A');
    await startShare(B, 'B');
    await sleep(3000);
    await api(A).waitFor(`[...document.querySelectorAll('.stream-switcher button')].some((x) => x.textContent.includes('${names.B}'))`, 'switcher A');
    await api(A).js(`[...document.querySelectorAll('.stream-switcher button')].find((x) => x.textContent.includes('${names.B}')).click()`);
    await api(B).waitFor(`[...document.querySelectorAll('.stream-switcher button')].some((x) => x.textContent.includes('${names.A}'))`, 'switcher B');
    await api(B).js(`[...document.querySelectorAll('.stream-switcher button')].find((x) => x.textContent.includes('${names.A}')).click()`);
    await sleep(6000);
    let sa = await streamState(A);
    let sb = await streamState(B);
    check('tela: A transmite e assiste B ao mesmo tempo', sa.sharing && sa.remoteTrack && sa.framesAdvancing && sa.width > 0, JSON.stringify(sa));
    check('tela: B transmite e assiste A ao mesmo tempo', sb.sharing && sb.remoteTrack && sb.framesAdvancing && sb.width > 0, JSON.stringify(sb));

    // Switch to own screen and back without stopping anything.
    await api(A).js(`[...document.querySelectorAll('.stream-switcher button')].find((x) => x.textContent.includes('Sua tela')).click()`);
    await sleep(1500);
    sa = await streamState(A);
    check('tela: A alterna para a própria tela', sa.sharing && !sa.remoteTrack && sa.framesAdvancing, JSON.stringify(sa));
    sb = await streamState(B);
    check('tela: B continua recebendo a tela de A', sb.remoteTrack && sb.framesAdvancing, JSON.stringify(sb));

    // B stops presenting: B keeps watching A.
    await api(B).js(`document.querySelector('.dock-btn.on[title="Parar transmissão"]').click()`);
    await sleep(3000);
    sb = await streamState(B);
    check('tela: B para de transmitir e continua assistindo A', !sb.sharing && sb.remoteTrack && sb.framesAdvancing, JSON.stringify(sb));

    // B stops watching: A keeps presenting.
    await api(B).js(`document.querySelector('[title="Parar de assistir"]').click()`);
    await sleep(2000);
    sa = await streamState(A);
    check('tela: B para de assistir e A continua transmitindo', sa.sharing && sa.framesAdvancing, JSON.stringify(sa));
  } catch (err) {
    check('execução do teste', false, err.message.slice(0, 500));
  } finally {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`RESULT ${results.length - failed}/${results.length} passed`);
    setTimeout(() => app.exit(0), 300);
  }
});
