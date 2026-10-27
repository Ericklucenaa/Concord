// Minimal Firestore admin client over the REST API, authenticated with the
// developer's gcloud credentials (`gcloud auth login`). Admin requests bypass
// security rules, so this is only for maintenance scripts run by the owner.
import { execSync } from 'child_process';

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'concord-3af70';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let cachedToken = null;
function token() {
  if (!cachedToken) {
    cachedToken = execSync('gcloud auth print-access-token', { encoding: 'utf8', shell: true }).trim();
  }
  return cachedToken;
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// --- Value conversion --------------------------------------------------------

export function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

export function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decode(v)]));
}

export function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: encodeFields(value) } };
}

export function encodeFields(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)]));
}

// --- Operations --------------------------------------------------------------

// Document ids may contain spaces or ':' (old nicknames), so encode each segment.
const docUrl = (path) => `${BASE}/${path.split('/').map(encodeURIComponent).join('/')}`;

export async function listCollection(collection) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${BASE}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await request('GET', url);
    (data.documents || []).forEach((d) => docs.push({ id: d.name.split('/').pop(), data: decodeFields(d.fields) }));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

export async function getDocument(path) {
  try {
    const d = await request('GET', docUrl(path));
    return decodeFields(d.fields);
  } catch (err) {
    if (String(err.message).includes('404')) return null;
    throw err;
  }
}

/** Replaces the whole document. */
export async function setDocument(path, data) {
  return request('PATCH', docUrl(path), { fields: encodeFields(data) });
}

export async function deleteDocument(path) {
  return request('DELETE', docUrl(path));
}
