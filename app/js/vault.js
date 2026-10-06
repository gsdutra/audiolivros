// Decrypts the library. Mirrors pipeline/publish.py: PBKDF2-SHA256 -> AES-256-GCM, blob = iv(12) || ct+tag.

const KEY_STORE = 'audiolivros:key';
const LIB = 'library/';
let key = null;

const b64 = {
  dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
};

async function importRaw(raw) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
}

export async function decrypt(buf, k = key) {
  const bytes = new Uint8Array(buf);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, k, bytes.slice(12));
}

async function fetchBuf(path) {
  const res = await fetch(LIB + path);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`);
  return res.arrayBuffer();
}

/** Restore a key saved on this device. Resolves true when the library can be opened. */
export async function restore() {
  let raw = null;
  try { raw = localStorage.getItem(KEY_STORE); } catch (e) { /* storage blocked */ }
  if (!raw) return false;
  key = await importRaw(b64.dec(raw));
  return true;
}

/** Derive the key from the passphrase, verify it against vault.json, and remember it. */
export async function unlock(passphrase) {
  const vault = JSON.parse(new TextDecoder().decode(await fetchBuf('vault.json')));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.trim()), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64.dec(vault.salt), iterations: vault.iter }, base, 256);
  const candidate = await importRaw(bits);
  try {
    await decrypt(b64.dec(vault.check), candidate);
  } catch (e) {
    return false;
  }
  key = candidate;
  try { localStorage.setItem(KEY_STORE, b64.enc(bits)); } catch (e) { /* key lives for this session only */ }
  return true;
}

export function forget() {
  key = null;
  try { localStorage.removeItem(KEY_STORE); } catch (e) { /* nothing stored */ }
}

export async function json(path) {
  return JSON.parse(new TextDecoder().decode(await decrypt(await fetchBuf(path))));
}

/** Decrypted file as a Blob (audio or image). */
export async function blob(path, type) {
  return new Blob([await decrypt(await fetchBuf(path))], { type });
}

/** Ask the service worker to keep a file offline; resolves when cached. */
export async function cache(path) {
  const res = await fetch(LIB + path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await res.arrayBuffer();
}

export async function isCached(path) {
  if (!('caches' in window)) return false;
  return !!(await caches.match(new URL(LIB + path, location.href).href));
}
