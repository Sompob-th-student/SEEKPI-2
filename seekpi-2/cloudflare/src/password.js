// Password hashing for Workers: PBKDF2-SHA256 through WebCrypto (native, fast enough for the Workers CPU limit;
// bcrypt in pure JS is not). Format: pbkdf2$<iterations>$<salt base64>$<hash base64>
// scripts/build-seed.mjs produces the same format with node:crypto for the demo accounts.
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const ITERATIONS = 100000; // Workers' WebCrypto allows at most 100,000 PBKDF2 iterations

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('pbkdf2$')) return false;
  const [, it, salt, hash] = stored.split('$');
  const expected = unb64(hash);
  const actual = await derive(password ?? '', unb64(salt), Number(it));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]; // constant time
  return diff === 0;
}
