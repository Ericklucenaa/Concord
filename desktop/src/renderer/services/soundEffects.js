// High-fidelity Web Audio API sound synthesizer for Discord-style Soundboard

class SoundBoardSynthesizer {
  constructor() {
    this.ctx = null;
  }

  getAudioContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // 1. Airhorn
  playAirhorn() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [466.16, 466.16 * 1.01, 370.0, 311.13];

    for (let i = 0; i < 3; i++) {
      const burstStart = now + i * 0.18;
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, burstStart);

        gain.gain.setValueAtTime(0, burstStart);
        gain.gain.linearRampToValueAtTime(0.2, burstStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, burstStart + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(burstStart);
        osc.stop(burstStart + 0.16);
      });
    }
  }

  // 2. Notification Pop
  playNotification() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.08); // A5

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  // 3. Level Up / Coin
  playCoin() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(987.77, now); // B5
    osc1.frequency.setValueAtTime(1318.51, now + 0.08); // E6

    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.setValueAtTime(0.15, now + 0.08);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.45);
  }

  // 4. Victory / Fanfare
  playVictory() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { f: 523.25, t: 0, d: 0.12 }, // C5
      { f: 659.25, t: 0.12, d: 0.12 }, // E5
      { f: 783.99, t: 0.24, d: 0.12 }, // G5
      { f: 1046.50, t: 0.36, d: 0.5 } // C6
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      gain.gain.setValueAtTime(0, now + n.t);
      gain.gain.linearRampToValueAtTime(0.25, now + n.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.t);
      osc.stop(now + n.t + n.d);
    });
  }

  // 5. Crowd Cheer / Noise
  playCheer() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 1.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(3.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + 1.2);
  }

  // 6. Cartoon Meme Boing
  playBoing() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  // Dispatch by sound ID
  play(soundId) {
    switch (soundId) {
      case 'airhorn':
        this.playAirhorn();
        break;
      case 'notification':
        this.playNotification();
        break;
      case 'coin':
        this.playCoin();
        break;
      case 'victory':
        this.playVictory();
        break;
      case 'cheer':
        this.playCheer();
        break;
      case 'boing':
        this.playBoing();
        break;
      default:
        this.playNotification();
    }
  }
}

export const soundSynthesizer = new SoundBoardSynthesizer();

export const SOUNDBOARD_SOUNDS = [
  { id: 'airhorn', name: 'Buzina Airhorn', emoji: '📢', color: '#ef4444' },
  { id: 'victory', name: 'Vitória Épica', emoji: '🏆', color: '#f59e0b' },
  { id: 'coin', name: 'Level Up / Coin', emoji: '🪙', color: '#10b981' },
  { id: 'cheer', name: 'Aplausos / Torcida', emoji: '👏', color: '#8b5cf6' },
  { id: 'notification', name: 'Ping Concord', emoji: '🔔', color: '#6366f1' },
  { id: 'boing', name: 'Meme Boing', emoji: '🎯', color: '#ec4899' }
];
