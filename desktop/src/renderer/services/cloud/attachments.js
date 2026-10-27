import { doc, setDoc, getDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn } from '../log';
import { newId, nowIso } from './util';

// Firebase Storage is not enabled on this project (it requires the paid plan),
// so files are stored as base64 chunks in Firestore. Each chunk stays well
// under the 1 MiB document limit.
const ATTACHMENTS = 'concord_attachments';
const CHUNK_CHARS = 700_000;

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const INLINE_IMAGE_LIMIT_CHARS = 700_000;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

/**
 * Uploads a file. `scope` is { scopeType: 'server' | 'dm', scopeId }.
 * Returns the attachment descriptor stored on the message.
 */
export async function uploadAttachment(file, ownerId, scope, onProgress) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`O arquivo "${file.name}" passa do limite de 8 MB.`);
  }
  const base64 = await blobToBase64(file);
  const chunks = [];
  for (let i = 0; i < base64.length; i += CHUNK_CHARS) chunks.push(base64.slice(i, i + CHUNK_CHARS));

  const id = newId('att');
  const meta = {
    id,
    ownerId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    name: String(file.name || 'arquivo').slice(0, 200),
    type: file.type || 'application/octet-stream',
    size: file.size,
    chunkCount: chunks.length,
    createdAt: nowIso()
  };
  await setDoc(doc(firestore, ATTACHMENTS, id), meta);

  for (let i = 0; i < chunks.length; i++) {
    await setDoc(doc(firestore, ATTACHMENTS, id, 'chunks', String(i).padStart(3, '0')), { index: i, data: chunks[i] });
    onProgress?.(Math.round(((i + 1) / chunks.length) * 100));
  }
  return { id, name: meta.name, type: meta.type, size: meta.size };
}

const blobCache = new Map();

/** Downloads and reassembles an attachment, returning an object URL. */
export async function getAttachmentUrl(attachmentId) {
  if (blobCache.has(attachmentId)) return blobCache.get(attachmentId);
  const promise = (async () => {
    const metaSnap = await getDoc(doc(firestore, ATTACHMENTS, attachmentId));
    if (!metaSnap.exists()) throw new Error('Anexo não encontrado.');
    const meta = metaSnap.data();
    const snap = await getDocs(collection(firestore, ATTACHMENTS, attachmentId, 'chunks'));
    const parts = snap.docs.map((d) => d.data()).sort((a, b) => a.index - b.index).map((c) => c.data);
    return URL.createObjectURL(base64ToBlob(parts.join(''), meta.type));
  })();
  blobCache.set(attachmentId, promise);
  promise.catch(() => blobCache.delete(attachmentId));
  return promise;
}

export async function deleteAttachment(attachment) {
  try {
    const snap = await getDocs(collection(firestore, ATTACHMENTS, attachment.id, 'chunks'));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(firestore, ATTACHMENTS, attachment.id));
  } catch (err) {
    logWarn('delete attachment', err);
  }
}

/** Downscales an image to fit `maxDim` and re-encodes it, returning a data URL. */
export function compressImage(file, { maxDim = 1600, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    // Animated GIFs would lose their animation on a canvas; keep them as files.
    if (file.type === 'image/gif') {
      reject(new Error('gif'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler esta imagem.'));
    };
    img.src = url;
  });
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
