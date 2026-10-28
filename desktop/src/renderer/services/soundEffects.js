// Soundboard: every sound is synthesized with the Web Audio API, so nothing is
// downloaded and only the sound id travels to the other people in the call.

const VOLUME_KEY = 'concord_soundboard_volume';
const FAVORITES_KEY = 'concord_soundboard_favorites';

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'A4' → 440, 'C#5', 'Bb3'… */
export function noteFreq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return Number(name) || 440;
  const semis = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

const f = (n) => (typeof n === 'number' ? n : noteFreq(n));

function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function getSoundboardVolume() {
  const v = Number(readJson(VOLUME_KEY, 0.8));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
}

export function setSoundboardVolume(value) {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function getFavoriteSounds() {
  const list = readJson(FAVORITES_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function setFavoriteSounds(list) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * Small toolkit bound to one playback: every time is relative to the moment
 * the sound starts, and everything goes through one master gain + limiter.
 */
class Voice {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.t0 = ctx.currentTime + 0.02;
  }

  envelope(gain, t, d, g, attack = 0.01, sustain = false) {
    const p = gain.gain;
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(g, t + attack);
    if (sustain) p.setValueAtTime(g, Math.max(t + attack, t + d - 0.06));
    p.exponentialRampToValueAtTime(0.0001, t + d);
  }

  /** Oscillator note. */
  tone({ freq, t = 0, d = 0.3, type = 'sine', g = 0.2, to = null, slide = null, attack = 0.01, sustain = false, vibrato = null, lp = null, detune = 0 }) {
    const { ctx } = this;
    const start = this.t0 + t;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f(freq), start);
    if (to) osc.frequency.exponentialRampToValueAtTime(f(to), start + (slide ?? d));
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = vibrato.rate;
      depth.gain.value = vibrato.depth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + d);
    }
    this.envelope(gain, start, d, g, attack, sustain);
    let node = osc;
    if (lp) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lp;
      node = node.connect(filter);
    }
    node.connect(gain).connect(this.out);
    osc.start(start);
    osc.stop(start + d + 0.05);
  }

  /** Filtered white noise. */
  noise({ t = 0, d = 0.3, g = 0.2, type = 'bandpass', freq = 1000, to = null, q = 1, attack = 0.005, sustain = false }) {
    const { ctx } = this;
    const start = this.t0 + t;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, start);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, start + d);
    filter.Q.value = q;
    const gain = ctx.createGain();
    this.envelope(gain, start, d, g, attack, sustain);
    src.connect(filter).connect(gain).connect(this.out);
    src.start(start, Math.random());
    src.stop(start + d + 0.05);
  }

  /** Bell/metal: inharmonic partials with long decay. */
  bell(freq, t = 0, d = 1.5, g = 0.15, partials = [1, 2.0, 2.76, 4.07, 5.4]) {
    partials.forEach((p, i) => this.tone({ freq: f(freq) * p, t, d: d / (1 + i * 0.35), g: g / (1 + i * 0.8), attack: 0.002 }));
  }

  /** Plucked string (Karplus–Strong). */
  pluck(freq, t = 0, d = 1.6, g = 0.35) {
    const { ctx } = this;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * d);
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    const period = Math.max(2, Math.round(rate / f(freq)));
    const ring = new Float32Array(period).map(() => Math.random() * 2 - 1);
    for (let i = 0; i < length; i++) {
      const idx = i % period;
      const next = (idx + 1) % period;
      data[i] = ring[idx];
      ring[idx] = 0.497 * (ring[idx] + ring[next]);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = g;
    src.connect(gain).connect(this.out);
    src.start(this.t0 + t);
  }

  /** Several notes in sequence: [note, start, duration]. */
  seq(notes, opts = {}) {
    notes.forEach(([freq, t, d]) => this.tone({ ...opts, freq, t, d }));
  }
}

let cachedNoise = null;
function noiseBuffer(ctx) {
  if (cachedNoise && cachedNoise.sampleRate === ctx.sampleRate) return cachedNoise;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  cachedNoise = buffer;
  return buffer;
}

const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Sound library
// ---------------------------------------------------------------------------

export const SOUND_CATEGORIES = [
  { id: 'memes', name: 'Memes', emoji: '😂' },
  { id: 'games', name: 'Jogos', emoji: '🎮' },
  { id: 'reactions', name: 'Reações', emoji: '👏' },
  { id: 'music', name: 'Música', emoji: '🎵' },
  { id: 'alerts', name: 'Alertas & Ambiente', emoji: '🔔' }
];

const SOUNDS = [
  // --- Memes ---------------------------------------------------------------
  { id: 'airhorn', name: 'Buzina Airhorn', emoji: '📢', color: '#ef4444', category: 'memes', play: (v) => {
    for (let i = 0; i < 3; i++) {
      const len = i === 2 ? 0.55 : 0.16;
      [466.16, 470.8, 370, 311.13].forEach((fr) => v.tone({ freq: fr, t: i * 0.2, d: len, type: 'sawtooth', g: 0.1, sustain: true, lp: 2600 }));
    }
  } },
  { id: 'boing', name: 'Boing', emoji: '🎯', color: '#ec4899', category: 'memes', play: (v) => {
    v.tone({ freq: 150, to: 800, d: 0.4, slide: 0.3, g: 0.3, vibrato: { rate: 14, depth: 25 } });
  } },
  { id: 'sadtrombone', name: 'Trombone Triste', emoji: '😢', color: '#64748b', category: 'memes', play: (v) => {
    [['Bb3', 0, 0.38], ['A3', 0.4, 0.38], ['Ab3', 0.8, 0.38]].forEach(([n, t, d]) => v.tone({ freq: n, t, d, type: 'sawtooth', g: 0.16, lp: 1100, sustain: true, attack: 0.04 }));
    v.tone({ freq: 'G3', t: 1.2, d: 1.3, type: 'sawtooth', g: 0.16, lp: 1100, sustain: true, attack: 0.04, vibrato: { rate: 5.5, depth: 7 } });
  } },
  { id: 'rimshot', name: 'Ba Dum Tss', emoji: '🥁', color: '#f59e0b', category: 'memes', play: (v) => {
    v.tone({ freq: 190, to: 95, d: 0.18, g: 0.5 });
    v.noise({ d: 0.08, g: 0.15, freq: 1800 });
    v.tone({ freq: 140, to: 70, t: 0.22, d: 0.2, g: 0.5 });
    v.noise({ t: 0.22, d: 0.08, g: 0.15, freq: 1500 });
    v.noise({ t: 0.48, d: 1.1, g: 0.22, type: 'highpass', freq: 6500 });
  } },
  { id: 'dramatic', name: 'Dun Dun Duuun', emoji: '😱', color: '#7f1d1d', category: 'memes', play: (v) => {
    const hit = (t, d, notes) => notes.forEach((n) => v.tone({ freq: n, t, d, type: 'sawtooth', g: 0.12, lp: 900, sustain: true, attack: 0.02 }));
    hit(0, 0.28, ['G2', 'D3', 'G3']);
    hit(0.36, 0.28, ['G2', 'D3', 'G3']);
    hit(0.72, 1.6, ['Eb2', 'Bb2', 'Eb3']);
    v.noise({ t: 0.72, d: 1.2, g: 0.08, type: 'lowpass', freq: 400 });
  } },
  { id: 'slideup', name: 'Apito Subindo', emoji: '⬆️', color: '#22c55e', category: 'memes', play: (v) => {
    v.tone({ freq: 320, to: 1700, d: 0.65, g: 0.2, vibrato: { rate: 9, depth: 18 }, sustain: true });
  } },
  { id: 'slidedown', name: 'Apito Descendo', emoji: '⬇️', color: '#0ea5e9', category: 'memes', play: (v) => {
    v.tone({ freq: 1700, to: 260, d: 0.75, g: 0.2, vibrato: { rate: 9, depth: 18 }, sustain: true });
  } },
  { id: 'cartoonfall', name: 'Queda de Desenho', emoji: '🪂', color: '#a855f7', category: 'memes', play: (v) => {
    v.tone({ freq: 1500, to: 180, d: 1.0, g: 0.18, sustain: true, vibrato: { rate: 7, depth: 10 } });
    v.tone({ freq: 95, to: 38, t: 1.02, d: 0.45, g: 0.6 });
    v.noise({ t: 1.02, d: 0.3, g: 0.3, type: 'lowpass', freq: 500 });
  } },
  { id: 'honk', name: 'Buzina de Palhaço', emoji: '🤡', color: '#f97316', category: 'memes', play: (v) => {
    [0, 0.28].forEach((t) => {
      v.tone({ freq: 340, to: 300, t, d: 0.2, type: 'square', g: 0.12, lp: 1500, sustain: true });
      v.tone({ freq: 345, to: 304, t, d: 0.2, type: 'square', g: 0.12, lp: 1500, sustain: true });
    });
  } },
  { id: 'boom', name: 'Boom Grave', emoji: '💥', color: '#1f2937', category: 'memes', play: (v) => {
    v.tone({ freq: 65, to: 32, d: 1.5, g: 0.8, slide: 1.2 });
    v.tone({ freq: 130, to: 48, d: 0.7, type: 'triangle', g: 0.4 });
    v.noise({ d: 0.25, g: 0.35, type: 'lowpass', freq: 300 });
  } },
  { id: 'scratch', name: 'Disco Arranhado', emoji: '💿', color: '#334155', category: 'memes', play: (v) => {
    v.noise({ d: 0.13, g: 0.35, freq: 3200, to: 500, q: 3 });
    v.noise({ t: 0.15, d: 0.16, g: 0.35, freq: 500, to: 2800, q: 3 });
    v.tone({ freq: 220, to: 70, d: 0.13, type: 'sawtooth', g: 0.08, lp: 1200 });
    v.tone({ freq: 70, to: 210, t: 0.15, d: 0.16, type: 'sawtooth', g: 0.08, lp: 1200 });
  } },
  { id: 'crickets', name: 'Grilos (silêncio)', emoji: '🦗', color: '#65a30d', category: 'memes', play: (v) => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) v.tone({ freq: 4400, t: r * 0.5 + c * 0.055, d: 0.04, g: 0.07, attack: 0.004 });
    }
  } },
  { id: 'fart', name: 'Pum', emoji: '💨', color: '#a16207', category: 'memes', play: (v) => {
    v.tone({ freq: 95, to: 70, d: 0.7, type: 'sawtooth', g: 0.22, lp: 380, vibrato: { rate: 24, depth: 18 }, sustain: true, attack: 0.03 });
    v.noise({ d: 0.7, g: 0.08, type: 'lowpass', freq: 250 });
  } },
  { id: 'tada', name: 'Tcharam!', emoji: '🎉', color: '#eab308', category: 'memes', play: (v) => {
    v.tone({ freq: 'G4', d: 0.1, type: 'sawtooth', g: 0.1, lp: 3000 });
    v.tone({ freq: 'C5', t: 0.1, d: 0.1, type: 'sawtooth', g: 0.1, lp: 3000 });
    ['C5', 'E5', 'G5', 'C6'].forEach((n) => v.tone({ freq: n, t: 0.22, d: 1.0, type: 'sawtooth', g: 0.08, lp: 3200, sustain: true, vibrato: { rate: 5, depth: 3 } }));
  } },
  { id: 'fail', name: 'Errou! (buzzer)', emoji: '❌', color: '#dc2626', category: 'memes', play: (v) => {
    v.tone({ freq: 110, d: 0.85, type: 'square', g: 0.12, sustain: true, lp: 1600 });
    v.tone({ freq: 116, d: 0.85, type: 'square', g: 0.12, sustain: true, lp: 1600 });
  } },
  { id: 'bonk', name: 'Bonk', emoji: '🔨', color: '#b45309', category: 'memes', play: (v) => {
    v.tone({ freq: 900, to: 180, d: 0.1, type: 'triangle', g: 0.4 });
    v.tone({ freq: 170, to: 120, d: 0.25, g: 0.4 });
    v.noise({ d: 0.05, g: 0.3, freq: 1600, q: 2 });
  } },
  { id: 'spring', name: 'Mola', emoji: '🌀', color: '#14b8a6', category: 'memes', play: (v) => {
    v.tone({ freq: 240, to: 180, d: 0.9, g: 0.25, vibrato: { rate: 17, depth: 90 } });
  } },
  { id: 'pop', name: 'Pop', emoji: '🫧', color: '#38bdf8', category: 'memes', play: (v) => {
    v.tone({ freq: 380, to: 1500, d: 0.07, g: 0.35, slide: 0.05 });
  } },

  // --- Jogos ---------------------------------------------------------------
  { id: 'coin', name: 'Moeda', emoji: '🪙', color: '#10b981', category: 'games', play: (v) => {
    v.tone({ freq: 'B5', d: 0.08, type: 'square', g: 0.1 });
    v.tone({ freq: 'E6', t: 0.08, d: 0.4, type: 'square', g: 0.1 });
  } },
  { id: 'victory', name: 'Vitória Épica', emoji: '🏆', color: '#f59e0b', category: 'games', play: (v) => {
    v.seq([['C5', 0, 0.13], ['E5', 0.13, 0.13], ['G5', 0.26, 0.13]], { type: 'triangle', g: 0.22 });
    ['C6', 'G5', 'E5'].forEach((n) => v.tone({ freq: n, t: 0.39, d: 0.75, type: 'triangle', g: 0.16, sustain: true }));
  } },
  { id: 'levelup', name: 'Subiu de Nível', emoji: '⭐', color: '#84cc16', category: 'games', play: (v) => {
    ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => v.tone({ freq: n, t: i * 0.06, d: i === 5 ? 0.5 : 0.07, type: 'square', g: 0.08 }));
  } },
  { id: 'powerup', name: 'Power-up', emoji: '🍄', color: '#e11d48', category: 'games', play: (v) => {
    for (let i = 0; i < 16; i++) v.tone({ freq: noteFreq('G4') * 2 ** ((i * 1.5) / 12), t: i * 0.035, d: 0.05, type: 'square', g: 0.07 });
  } },
  { id: 'extralife', name: 'Vida Extra', emoji: '💚', color: '#16a34a', category: 'games', play: (v) => {
    v.seq([['A5', 0, 0.09], ['C#6', 0.09, 0.09], ['E6', 0.18, 0.09], ['A6', 0.27, 0.09], ['E6', 0.36, 0.09], ['A6', 0.45, 0.3]], { type: 'square', g: 0.08 });
  } },
  { id: 'jump', name: 'Pulo', emoji: '🦘', color: '#0284c7', category: 'games', play: (v) => {
    v.tone({ freq: 240, to: 760, d: 0.16, type: 'square', g: 0.08 });
  } },
  { id: 'laser', name: 'Laser', emoji: '🔫', color: '#f43f5e', category: 'games', play: (v) => {
    v.tone({ freq: 1800, to: 110, d: 0.28, type: 'sawtooth', g: 0.12 });
    v.tone({ freq: 2400, to: 160, d: 0.24, type: 'square', g: 0.05 });
  } },
  { id: 'explosion', name: 'Explosão', emoji: '💣', color: '#ea580c', category: 'games', play: (v) => {
    v.noise({ d: 1.8, g: 0.6, type: 'lowpass', freq: 1400, to: 90 });
    v.tone({ freq: 80, to: 28, d: 1.2, g: 0.6 });
  } },
  { id: 'gameover', name: 'Game Over', emoji: '💀', color: '#475569', category: 'games', play: (v) => {
    v.seq([['G4', 0, 0.3], ['F#4', 0.32, 0.3], ['F4', 0.64, 0.3]], { type: 'square', g: 0.08, lp: 1800 });
    v.tone({ freq: 'E4', t: 0.96, d: 1.1, type: 'square', g: 0.08, lp: 1800, sustain: true, vibrato: { rate: 6, depth: 6 } });
  } },
  { id: 'hit', name: 'Dano', emoji: '🩸', color: '#b91c1c', category: 'games', play: (v) => {
    v.tone({ freq: 240, to: 70, d: 0.14, type: 'square', g: 0.14 });
    v.noise({ d: 0.09, g: 0.25, freq: 900 });
  } },
  { id: 'pickup', name: 'Pegou Item', emoji: '💎', color: '#06b6d4', category: 'games', play: (v) => {
    v.tone({ freq: 1200, to: 1900, d: 0.08, type: 'triangle', g: 0.2 });
    v.tone({ freq: 1600, to: 2500, t: 0.09, d: 0.12, type: 'triangle', g: 0.2 });
  } },
  { id: 'achievement', name: 'Conquista', emoji: '🏅', color: '#ca8a04', category: 'games', play: (v) => {
    v.bell('G5', 0, 1.0, 0.14);
    v.bell('D6', 0.16, 1.6, 0.14);
  } },
  { id: 'countdown', name: 'Contagem 3, 2, 1', emoji: '⏱️', color: '#7c3aed', category: 'games', play: (v) => {
    [0, 0.8, 1.6].forEach((t) => v.tone({ freq: 880, t, d: 0.18, type: 'square', g: 0.08, sustain: true }));
    v.tone({ freq: 1760, t: 2.4, d: 0.6, type: 'square', g: 0.08, sustain: true });
  } },
  { id: 'ding', name: 'Headshot Ding', emoji: '🎯', color: '#facc15', category: 'games', play: (v) => {
    v.bell(1568, 0, 1.0, 0.18, [1, 2.0, 3.01]);
  } },
  { id: 'combo', name: 'Combo!', emoji: '🔥', color: '#f97316', category: 'games', play: (v) => {
    [0, 4, 7].forEach((step, k) => ['C5', 'E5', 'G5'].forEach((n, i) => v.tone({ freq: noteFreq(n) * 2 ** (step / 12), t: k * 0.18 + i * 0.045, d: 0.08, type: 'square', g: 0.07 })));
  } },
  { id: 'teleport', name: 'Teletransporte', emoji: '🌌', color: '#8b5cf6', category: 'games', play: (v) => {
    v.tone({ freq: 200, to: 2200, d: 0.75, g: 0.18, vibrato: { rate: 32, depth: 60 } });
    v.noise({ d: 0.75, g: 0.06, type: 'highpass', freq: 4000 });
  } },
  { id: 'shield', name: 'Escudo', emoji: '🛡️', color: '#2563eb', category: 'games', play: (v) => {
    v.tone({ freq: 110, to: 440, d: 0.6, type: 'sawtooth', g: 0.1, lp: 1500, vibrato: { rate: 12, depth: 8 } });
    v.tone({ freq: 220, to: 880, d: 0.6, g: 0.1 });
  } },

  // --- Reações -------------------------------------------------------------
  { id: 'applause', name: 'Aplausos', emoji: '👏', color: '#8b5cf6', category: 'reactions', play: (v) => {
    for (let i = 0; i < 70; i++) {
      const t = rand(0, 2.4);
      v.noise({ t, d: 0.05, g: rand(0.05, 0.13) * (1 - t / 3), freq: rand(1200, 2600), q: 1.2, attack: 0.002 });
    }
  } },
  { id: 'cheer', name: 'Torcida', emoji: '🙌', color: '#a855f7', category: 'reactions', play: (v) => {
    v.noise({ d: 2.0, g: 0.18, freq: 1100, q: 2.5, attack: 0.25 });
    v.noise({ d: 2.0, g: 0.1, freq: 2400, q: 3, attack: 0.3 });
    for (let i = 0; i < 25; i++) v.noise({ t: rand(0, 1.7), d: 0.04, g: 0.08, freq: 2000, attack: 0.002 });
  } },
  { id: 'drumroll', name: 'Rufar de Tambores', emoji: '🥁', color: '#be123c', category: 'reactions', play: (v) => {
    for (let i = 0; i < 46; i++) v.noise({ t: i * 0.04, d: 0.05, g: 0.05 + (i / 46) * 0.14, freq: 1800, q: 0.8, attack: 0.002 });
    v.tone({ freq: 110, to: 60, t: 1.86, d: 0.3, g: 0.5 });
    v.noise({ t: 1.86, d: 1.2, g: 0.25, type: 'highpass', freq: 5500 });
  } },
  { id: 'correct', name: 'Acertou!', emoji: '✅', color: '#22c55e', category: 'reactions', play: (v) => {
    v.tone({ freq: 'E6', d: 0.12, g: 0.22 });
    v.tone({ freq: 'A6', t: 0.12, d: 0.45, g: 0.22 });
  } },
  { id: 'whoosh', name: 'Whoosh', emoji: '🌪️', color: '#94a3b8', category: 'reactions', play: (v) => {
    v.noise({ d: 0.35, g: 0.3, freq: 300, to: 3200, q: 1.5, attack: 0.2 });
    v.noise({ t: 0.35, d: 0.3, g: 0.2, freq: 3200, to: 400, q: 1.5 });
  } },
  { id: 'suspense', name: 'Suspense', emoji: '🫣', color: '#581c87', category: 'reactions', play: (v) => {
    ['D3', 'F3', 'Ab3', 'B3'].forEach((n) => v.tone({ freq: n, d: 2.6, type: 'sawtooth', g: 0.05, lp: 1300, sustain: true, attack: 0.8, vibrato: { rate: 7, depth: 4 } }));
  } },
  { id: 'heartbeat', name: 'Coração Acelerado', emoji: '💓', color: '#e11d48', category: 'reactions', play: (v) => {
    for (let i = 0; i < 4; i++) {
      v.tone({ freq: 62, to: 40, t: i * 0.62, d: 0.18, g: 0.75 });
      v.tone({ freq: 56, to: 38, t: i * 0.62 + 0.2, d: 0.2, g: 0.55 });
    }
  } },
  { id: 'kiss', name: 'Beijinho', emoji: '💋', color: '#f472b6', category: 'reactions', play: (v) => {
    v.tone({ freq: 700, to: 1500, d: 0.12, g: 0.18, slide: 0.08 });
    v.noise({ t: 0.08, d: 0.04, g: 0.25, freq: 3000, attack: 0.002 });
  } },
  { id: 'wow', name: 'Uau!', emoji: '🤩', color: '#fb7185', category: 'reactions', play: (v) => {
    // Vowel-ish sweep: two formants following a rising-falling pitch.
    v.tone({ freq: 180, to: 300, d: 0.35, type: 'sawtooth', g: 0.12, lp: 900, slide: 0.25 });
    v.tone({ freq: 300, to: 160, t: 0.33, d: 0.55, type: 'sawtooth', g: 0.12, lp: 700, slide: 0.5 });
  } },
  { id: 'facepalm', name: 'Facepalm', emoji: '🤦', color: '#78716c', category: 'reactions', play: (v) => {
    v.noise({ d: 0.12, g: 0.45, type: 'lowpass', freq: 1400, attack: 0.002 });
    v.tone({ freq: 140, to: 90, d: 0.12, g: 0.3 });
    v.tone({ freq: 'Eb4', t: 0.35, d: 0.9, type: 'triangle', g: 0.12, to: 'Bb3', slide: 0.9 });
  } },

  // --- Música --------------------------------------------------------------
  { id: 'piano', name: 'Acorde de Piano', emoji: '🎹', color: '#e5e7eb', category: 'music', play: (v) => {
    ['C4', 'E4', 'G4', 'C5'].forEach((n, i) => {
      v.tone({ freq: n, t: i * 0.02, d: 1.8, type: 'triangle', g: 0.14, attack: 0.003 });
      v.tone({ freq: noteFreq(n) * 2, t: i * 0.02, d: 0.9, g: 0.05, attack: 0.003 });
    });
  } },
  { id: 'harp', name: 'Harpa Mágica', emoji: '🪕', color: '#c084fc', category: 'music', play: (v) => {
    ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7'].forEach((n, i) => v.tone({ freq: n, t: i * 0.05, d: 1.2, type: 'triangle', g: 0.09, attack: 0.003 }));
  } },
  { id: 'gong', name: 'Gongo', emoji: '🔔', color: '#b45309', category: 'music', play: (v) => {
    [[1, 0.3], [1.48, 0.18], [2.1, 0.12], [2.83, 0.08], [3.6, 0.05]].forEach(([p, g]) => v.tone({ freq: 92 * p, d: 3.2, g, attack: 0.01, vibrato: { rate: 3, depth: 1.5 } }));
    v.noise({ d: 0.3, g: 0.12, type: 'lowpass', freq: 800 });
  } },
  { id: 'churchbell', name: 'Sino de Igreja', emoji: '⛪', color: '#a8a29e', category: 'music', play: (v) => {
    v.bell(392, 0, 2.2, 0.15, [0.5, 1, 1.2, 1.5, 2, 2.6]);
    v.bell(392, 1.1, 2.0, 0.12, [0.5, 1, 1.2, 1.5, 2, 2.6]);
  } },
  { id: 'cowbell', name: 'Cowbell', emoji: '🐄', color: '#57534e', category: 'music', play: (v) => {
    [0, 0.25, 0.5].forEach((t) => {
      v.tone({ freq: 545, t, d: 0.22, type: 'square', g: 0.1, lp: 2500 });
      v.tone({ freq: 815, t, d: 0.22, type: 'square', g: 0.08, lp: 2500 });
    });
  } },
  { id: 'triangle', name: 'Triângulo', emoji: '🔺', color: '#d4d4d8', category: 'music', play: (v) => {
    v.bell(2900, 0, 1.6, 0.08, [1, 1.47, 2.1]);
  } },
  { id: 'arp', name: 'Arpejo Synth', emoji: '🎛️', color: '#6366f1', category: 'music', play: (v) => {
    const pattern = ['A3', 'C4', 'E4', 'A4', 'E4', 'C4', 'F3', 'A3', 'C4', 'F4', 'C4', 'A3', 'G3', 'B3', 'D4', 'G4'];
    pattern.forEach((n, i) => v.tone({ freq: n, t: i * 0.11, d: 0.12, type: 'sawtooth', g: 0.08, lp: 1800 }));
  } },
  { id: 'bassdrop', name: 'Bass Drop', emoji: '🔊', color: '#0f172a', category: 'music', play: (v) => {
    v.tone({ freq: 1200, to: 60, d: 0.9, type: 'sawtooth', g: 0.08, lp: 2000 });
    v.tone({ freq: 55, t: 0.9, d: 1.2, type: 'sawtooth', g: 0.3, lp: 300, vibrato: { rate: 6, depth: 4 }, sustain: true });
    v.tone({ freq: 55, t: 0.9, d: 1.2, g: 0.45, sustain: true });
  } },
  { id: 'xylophone', name: 'Xilofone', emoji: '🎼', color: '#f59e0b', category: 'music', play: (v) => {
    ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'].forEach((n, i) => {
      v.tone({ freq: n, t: i * 0.12, d: 0.4, g: 0.2, attack: 0.002 });
      v.tone({ freq: noteFreq(n) * 4, t: i * 0.12, d: 0.08, g: 0.05, attack: 0.002 });
    });
  } },
  { id: 'chiptune', name: 'Jingle 8-bit', emoji: '👾', color: '#22d3ee', category: 'music', play: (v) => {
    v.seq([['E5', 0, 0.1], ['G5', 0.12, 0.1], ['A5', 0.24, 0.1], ['C6', 0.36, 0.2], ['A5', 0.6, 0.1], ['C6', 0.72, 0.1], ['D6', 0.84, 0.1], ['E6', 0.96, 0.4]], { type: 'square', g: 0.07 });
    v.seq([['C3', 0, 0.22], ['C3', 0.24, 0.22], ['F3', 0.48, 0.22], ['G3', 0.72, 0.22], ['C3', 0.96, 0.4]], { type: 'triangle', g: 0.18 });
  } },
  { id: 'guitar', name: 'Violão', emoji: '🎸', color: '#92400e', category: 'music', play: (v) => {
    ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'].forEach((n, i) => v.pluck(n, i * 0.025, 2.2, 0.22));
  } },
  { id: 'fanfare', name: 'Fanfarra Real', emoji: '👑', color: '#d97706', category: 'music', play: (v) => {
    const o = { type: 'sawtooth', g: 0.07, lp: 2600, sustain: true };
    v.seq([['G4', 0, 0.14], ['G4', 0.16, 0.14], ['G4', 0.32, 0.14], ['C5', 0.48, 0.5], ['E5', 1.0, 0.25], ['G5', 1.26, 0.8]], o);
    v.seq([['E4', 0.48, 0.5], ['G4', 1.0, 0.25], ['C5', 1.26, 0.8]], o);
  } },

  // --- Alertas & ambiente --------------------------------------------------
  { id: 'notification', name: 'Ping Concord', emoji: '🔔', color: '#6366f1', category: 'alerts', play: (v) => {
    v.tone({ freq: 587.33, to: 880, d: 0.25, g: 0.25, slide: 0.08 });
  } },
  { id: 'doorbell', name: 'Campainha', emoji: '🚪', color: '#0891b2', category: 'alerts', play: (v) => {
    v.bell('E5', 0, 1.0, 0.16, [1, 2, 3]);
    v.bell('C5', 0.5, 1.6, 0.16, [1, 2, 3]);
  } },
  { id: 'alarm', name: 'Alarme', emoji: '🚨', color: '#dc2626', category: 'alerts', play: (v) => {
    for (let i = 0; i < 8; i++) v.tone({ freq: i % 2 ? 660 : 880, t: i * 0.14, d: 0.13, type: 'square', g: 0.08, sustain: true });
  } },
  { id: 'siren', name: 'Sirene', emoji: '🚓', color: '#1d4ed8', category: 'alerts', play: (v) => {
    for (let i = 0; i < 3; i++) {
      v.tone({ freq: 650, to: 1250, t: i * 0.8, d: 0.4, type: 'sawtooth', g: 0.06, lp: 2200, sustain: true });
      v.tone({ freq: 1250, to: 650, t: i * 0.8 + 0.4, d: 0.4, type: 'sawtooth', g: 0.06, lp: 2200, sustain: true });
    }
  } },
  { id: 'phone', name: 'Telefone Tocando', emoji: '☎️', color: '#059669', category: 'alerts', play: (v) => {
    [0, 0.55].forEach((t) => {
      v.tone({ freq: 1050, t, d: 0.4, g: 0.1, sustain: true, vibrato: { rate: 20, depth: 60 } });
      v.tone({ freq: 1300, t, d: 0.4, g: 0.06, sustain: true, vibrato: { rate: 20, depth: 70 } });
    });
  } },
  { id: 'thunder', name: 'Trovão', emoji: '⛈️', color: '#334155', category: 'alerts', play: (v) => {
    v.noise({ d: 0.4, g: 0.5, type: 'lowpass', freq: 2500, to: 600 });
    v.noise({ t: 0.1, d: 3.0, g: 0.45, type: 'lowpass', freq: 380, to: 120, attack: 0.3 });
    for (let i = 0; i < 6; i++) v.noise({ t: rand(0.3, 2.2), d: 0.5, g: 0.2, type: 'lowpass', freq: 250, attack: 0.08 });
  } },
  { id: 'rain', name: 'Chuva', emoji: '🌧️', color: '#3b82f6', category: 'alerts', play: (v) => {
    v.noise({ d: 3.0, g: 0.12, type: 'highpass', freq: 1800, attack: 0.5, sustain: true });
    for (let i = 0; i < 30; i++) v.tone({ freq: rand(1800, 4200), t: rand(0, 2.8), d: 0.03, g: 0.04, attack: 0.002 });
  } },
  { id: 'clock', name: 'Relógio', emoji: '🕰️', color: '#78716c', category: 'alerts', play: (v) => {
    for (let i = 0; i < 6; i++) v.noise({ t: i * 0.5, d: 0.025, g: 0.4, freq: i % 2 ? 2600 : 3400, q: 8, attack: 0.001 });
  } },
  { id: 'camera', name: 'Câmera', emoji: '📸', color: '#475569', category: 'alerts', play: (v) => {
    v.noise({ d: 0.03, g: 0.5, freq: 2500, q: 2, attack: 0.001 });
    v.noise({ t: 0.09, d: 0.04, g: 0.45, freq: 1800, q: 2, attack: 0.001 });
    v.tone({ freq: 400, to: 900, t: 0.15, d: 0.25, type: 'sawtooth', g: 0.02, lp: 1200 });
  } },
  { id: 'typewriter', name: 'Máquina de Escrever', emoji: '⌨️', color: '#525252', category: 'alerts', play: (v) => {
    for (let i = 0; i < 9; i++) v.noise({ t: i * 0.11 + rand(0, 0.04), d: 0.03, g: 0.4, freq: rand(1800, 3500), q: 3, attack: 0.001 });
    v.bell(2100, 1.15, 0.9, 0.12, [1, 2.4]);
  } },
  { id: 'bubbles', name: 'Bolhas', emoji: '🫧', color: '#0ea5e9', category: 'alerts', play: (v) => {
    for (let i = 0; i < 7; i++) {
      const base = rand(300, 700);
      v.tone({ freq: base, to: base * 2.5, t: i * 0.13 + rand(0, 0.05), d: 0.08, g: 0.15, slide: 0.06 });
    }
  } },
  { id: 'magic', name: 'Brilho Mágico', emoji: '✨', color: '#e879f9', category: 'alerts', play: (v) => {
    for (let i = 0; i < 20; i++) v.tone({ freq: rand(2000, 5200), t: i * 0.05 + rand(0, 0.03), d: 0.35, g: 0.045, attack: 0.002 });
    v.noise({ d: 1.2, g: 0.04, type: 'highpass', freq: 7000, attack: 0.2 });
  } },
  { id: 'wind', name: 'Vento', emoji: '🍃', color: '#10b981', category: 'alerts', play: (v) => {
    v.noise({ d: 1.5, g: 0.18, freq: 400, to: 1400, q: 4, attack: 0.6 });
    v.noise({ t: 1.2, d: 1.6, g: 0.16, freq: 1400, to: 350, q: 4, attack: 0.2 });
  } }
];

export const SOUNDBOARD_SOUNDS = SOUNDS.map(({ play: _play, ...meta }) => meta);
const BY_ID = new Map(SOUNDS.map((s) => [s.id, s]));

class SoundBoardSynthesizer {
  constructor() {
    this.ctx = null;
  }

  getAudioContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) this.ctx = new AudioContextClass();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** Plays a sound locally. Unknown ids (from newer clients) fall back to a ping. */
  play(soundId, volume = getSoundboardVolume()) {
    const ctx = this.getAudioContext();
    if (!ctx || volume <= 0) return;
    const sound = BY_ID.get(soundId) || BY_ID.get('notification');
    const master = ctx.createGain();
    master.gain.value = volume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    master.connect(limiter).connect(ctx.destination);
    try {
      sound.play(new Voice(ctx, master));
    } catch (err) {
      console.warn('soundboard', soundId, err);
    }
    setTimeout(() => {
      master.disconnect();
      limiter.disconnect();
    }, 6000);
  }
}

export const soundSynthesizer = new SoundBoardSynthesizer();
