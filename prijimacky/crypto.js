// The data files are AES-256-GCM encrypted (12-byte IV + ciphertext). The key comes
// from the URL fragment (#k=…), which browsers never send to the server, and is then
// remembered in localStorage so a plain bookmark works.

const STORAGE_KEY = 'prijimacky.key';

function fromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function forgetKey() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage blocked */ }
}

/** Key text from the fragment (saved for next time) or from storage; null when unknown. */
export function keyText(input = location.hash) {
  const m = /[#&]k=([A-Za-z0-9_-]{43})/.exec(input);
  if (m) {
    try {
      localStorage.setItem(STORAGE_KEY, m[1]);
    } catch { /* storage blocked: key lives only in the URL */ }
    return m[1];
  }
  return readStored();
}

export function importKey(text) {
  return crypto.subtle.importKey('raw', fromB64url(text), 'AES-GCM', false, ['decrypt']);
}

export async function loadEncrypted(url, key) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}
