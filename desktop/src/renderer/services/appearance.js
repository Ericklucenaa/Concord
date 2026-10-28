import { useEffect, useState } from 'react';
import { logWarn } from './log';

// Per-device look & feel: theme, accent color and chat background.
const KEY = 'concord_appearance_v1';
const LEGACY_THEME_KEY = 'concord_theme';

// `preview`: [app background, panel, accent, text] for the theme picker.
export const THEMES = [
  { id: 'dark', name: 'Concord', description: 'Violeta sobre grafite', preview: ['#0b0c12', '#181922', '#7c6cff', '#eef0f6'] },
  { id: 'midnight', name: 'Midnight OLED', description: 'Preto absoluto', preview: ['#000000', '#0b0b10', '#8b7bff', '#f2f2f7'] },
  { id: 'slate', name: 'Grafite', description: 'Cinza neutro e sóbrio', preview: ['#10131a', '#1d2230', '#8ea2ff', '#e6eaf2'] },
  { id: 'nebula', name: 'Nebulosa', description: 'Roxo cósmico com magenta', preview: ['#0d0717', '#1a1029', '#d946ef', '#f5ecff'] },
  { id: 'ocean', name: 'Oceano', description: 'Azul profundo', preview: ['#060d14', '#0f1c2a', '#38bdf8', '#e6f6ff'] },
  { id: 'aurora', name: 'Aurora', description: 'Verde-água e violeta', preview: ['#06121a', '#0e1f2a', '#2dd4bf', '#e8fbf8'] },
  { id: 'forest', name: 'Floresta', description: 'Esmeralda noturno', preview: ['#070e0b', '#101d18', '#34d399', '#e9fbf3'] },
  { id: 'nord', name: 'Nórdico', description: 'Azul gelo e neve', preview: ['#1f232b', '#2e3440', '#88c0d0', '#eceff4'] },
  { id: 'dracula', name: 'Vampiro', description: 'Roxo e rosa clássicos', preview: ['#191a21', '#282a36', '#bd93f9', '#f8f8f2'] },
  { id: 'sakura', name: 'Sakura', description: 'Rosa cerejeira à noite', preview: ['#140a10', '#22121b', '#f472b6', '#fdeef6'] },
  { id: 'crimson', name: 'Carmesim', description: 'Vermelho intenso', preview: ['#120708', '#1f0e10', '#f43f5e', '#fdecef'] },
  { id: 'sunset', name: 'Pôr do Sol', description: 'Laranja e coral quentes', preview: ['#140c08', '#22150f', '#fb923c', '#fff1e8'] },
  { id: 'mocha', name: 'Café', description: 'Marrom aconchegante', preview: ['#161210', '#241d19', '#d6a374', '#f5ebe0'] },
  { id: 'cyber', name: 'Cyberpunk', description: 'Neon amarelo e ciano', preview: ['#050508', '#0e0e16', '#facc15', '#f5f5f5'] },
  { id: 'light', name: 'Claro', description: 'Branco limpo', preview: ['#e9ebf2', '#ffffff', '#6d5cf6', '#12131a'], light: true },
  { id: 'latte', name: 'Latte', description: 'Claro e quentinho', preview: ['#efe7dd', '#fbf7f2', '#c2703d', '#3b2a20'], light: true },
  { id: 'lavender', name: 'Lavanda', description: 'Lilás suave', preview: ['#ebe7f7', '#f9f7ff', '#8b5cf6', '#221b38'], light: true },
  { id: 'mint', name: 'Menta', description: 'Verde fresco e claro', preview: ['#e3f1ec', '#f7fcfa', '#10b981', '#10241d'], light: true }
];

export const ACCENT_PRESETS = ['#7c6cff', '#5b8cff', '#38bdf8', '#2dd4bf', '#34d399', '#a3e635', '#facc15', '#fb923c', '#f43f5e', '#ec4899', '#d946ef', '#94a3b8'];

// CSS backgrounds that need no download.
export const CHAT_BACKGROUNDS = [
  { id: 'aurora', name: 'Aurora', css: 'radial-gradient(ellipse at 20% 10%, rgba(45,212,191,0.55), transparent 55%), radial-gradient(ellipse at 80% 30%, rgba(139,92,246,0.55), transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(59,130,246,0.45), transparent 60%), #0a0f1c' },
  { id: 'sunset', name: 'Entardecer', css: 'linear-gradient(160deg, #3b1d4a 0%, #8a2f4f 45%, #f08a4b 100%)' },
  { id: 'galaxy', name: 'Galáxia', css: 'radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 80%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 70%, #fff, transparent), radial-gradient(1px 1px at 85% 15%, #fff, transparent), radial-gradient(1.5px 1.5px at 10% 85%, #fff, transparent), radial-gradient(ellipse at 60% 40%, rgba(124,58,237,0.55), transparent 60%), radial-gradient(ellipse at 30% 60%, rgba(219,39,119,0.35), transparent 55%), #05040d' },
  { id: 'ocean', name: 'Mar aberto', css: 'linear-gradient(180deg, #0c4a6e 0%, #075985 40%, #0e7490 75%, #155e75 100%)' },
  { id: 'forest', name: 'Mata', css: 'radial-gradient(ellipse at 50% 0%, rgba(132,204,22,0.35), transparent 60%), linear-gradient(180deg, #14532d 0%, #052e16 100%)' },
  { id: 'candy', name: 'Algodão-doce', css: 'linear-gradient(135deg, #f9a8d4 0%, #c4b5fd 50%, #93c5fd 100%)' },
  { id: 'ember', name: 'Brasa', css: 'radial-gradient(ellipse at 50% 120%, rgba(251,146,60,0.75), transparent 60%), radial-gradient(ellipse at 20% 100%, rgba(239,68,68,0.5), transparent 55%), #140806' },
  { id: 'grid', name: 'Grade neon', css: 'linear-gradient(rgba(124,108,255,0.22) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, rgba(124,108,255,0.22) 1px, transparent 1px) 0 0 / 32px 32px, radial-gradient(ellipse at 50% 0%, rgba(124,108,255,0.35), transparent 70%), #07070f' },
  { id: 'dots', name: 'Pontilhado', css: 'radial-gradient(rgba(255,255,255,0.16) 1.2px, transparent 1.4px) 0 0 / 18px 18px, linear-gradient(160deg, #1e1b4b, #0f172a)' },
  { id: 'waves', name: 'Ondas', css: 'repeating-radial-gradient(circle at 0 100%, transparent 0 24px, rgba(56,189,248,0.12) 24px 26px), linear-gradient(160deg, #0b1220, #172554)' },
  { id: 'stripes', name: 'Listras', css: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 14px, transparent 14px 28px), linear-gradient(135deg, #312e81, #701a75)' },
  { id: 'paper', name: 'Papel', css: 'radial-gradient(rgba(120,90,60,0.12) 1px, transparent 1px) 0 0 / 6px 6px, linear-gradient(180deg, #f6efe3, #ecdfca)' }
];

export const DEFAULT_APPEARANCE = {
  theme: 'dark',
  accent: null, // hex override or null (theme default)
  chatBackground: { type: 'none', value: null }, // none | preset | image
  chatDim: 0.55,
  chatBlur: 0
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) return { ...DEFAULT_APPEARANCE, ...saved };
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    return { ...DEFAULT_APPEARANCE, theme: THEMES.some((t) => t.id === legacy) ? legacy : 'dark' };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

let current = load();
const listeners = new Set();

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix([r, g, b], amount) {
  const t = amount > 0 ? 255 : 0;
  const p = Math.abs(amount);
  const c = (v) => Math.round(v + (t - v) * p).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rotateHue([r, g, b], degrees) {
  // Small hue rotation for the second gradient stop.
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const m = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072
  ];
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${clamp(m[0] * r + m[1] * g + m[2] * b)}${clamp(m[3] * r + m[4] * g + m[5] * b)}${clamp(m[6] * r + m[7] * g + m[8] * b)}`;
}

const ACCENT_VARS = ['--accent-primary', '--accent-primary-hover', '--accent-gradient', '--accent-glow', '--accent-soft', '--bg-active', '--border-focus', '--ring'];

/** Applies the saved appearance to the document (call before first paint too). */
export function applyAppearance(value = current) {
  const root = document.documentElement;
  const theme = THEMES.find((t) => t.id === value.theme) || THEMES[0];
  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-theme-mode', theme.light ? 'light' : 'dark');

  const rgb = hexToRgb(value.accent);
  if (rgb) {
    const [r, g, b] = rgb;
    root.style.setProperty('--accent-primary', value.accent);
    root.style.setProperty('--accent-primary-hover', mix(rgb, 0.15));
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${mix(rgb, 0.1)} 0%, ${rotateHue(rgb, -28)} 100%)`);
    root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.35)`);
    root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.14)`);
    root.style.setProperty('--bg-active', `rgba(${r}, ${g}, ${b}, 0.16)`);
    root.style.setProperty('--border-focus', value.accent);
    root.style.setProperty('--ring', `0 0 0 3px rgba(${r}, ${g}, ${b}, 0.35)`);
  } else {
    ACCENT_VARS.forEach((v) => root.style.removeProperty(v));
  }

  const bg = value.chatBackground || {};
  let css = null;
  if (bg.type === 'preset') css = CHAT_BACKGROUNDS.find((p) => p.id === bg.value)?.css || null;
  if (bg.type === 'image' && typeof bg.value === 'string' && /^(data:image\/|https:\/\/)/.test(bg.value)) {
    css = `url("${bg.value.replace(/"/g, '%22')}") center / cover no-repeat`;
  }
  if (css) {
    root.setAttribute('data-chat-bg', bg.type);
    root.style.setProperty('--chat-bg', css);
    root.style.setProperty('--chat-bg-dim', String(value.chatDim));
    root.style.setProperty('--chat-bg-blur', `${value.chatBlur}px`);
  } else {
    root.removeAttribute('data-chat-bg');
    root.style.removeProperty('--chat-bg');
  }
}

export function getAppearance() {
  return current;
}

export function updateAppearance(patch) {
  current = { ...current, ...patch };
  applyAppearance(current);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
    localStorage.setItem(LEGACY_THEME_KEY, current.theme);
  } catch (err) {
    logWarn('save appearance', err);
    throw new Error('Não foi possível salvar: a imagem é grande demais para este dispositivo.');
  }
  listeners.forEach((fn) => fn(current));
}

export function useAppearance() {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return [value, updateAppearance];
}

/** Shrinks a picked image so it fits in local storage (≈ under 700 KB). */
export function compressBackground(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Escolha um arquivo de imagem.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1920 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let quality = 0.82;
      let data = canvas.toDataURL('image/jpeg', quality);
      while (data.length > 950_000 && quality > 0.4) {
        quality -= 0.12;
        data = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível abrir essa imagem.'));
    };
    img.src = url;
  });
}
