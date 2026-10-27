export function newId(prefix) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}${random.slice(0, 12)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function cleanNickname(value) {
  return String(value || '').trim().replace(/^@/, '');
}

export function defaultAvatar(seed) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed || 'concord')}`;
}

/** Splits an array into chunks (Firestore `in` queries accept at most 30 values). */
export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function pairIdFor(a, b) {
  const [x, y] = [String(a), String(b)].sort();
  return `${x}_${y}`;
}

export function dmThreadIdFor(a, b) {
  return `dm_${pairIdFor(a, b)}`;
}

export function sortedPair(a, b) {
  return [String(a), String(b)].sort();
}
