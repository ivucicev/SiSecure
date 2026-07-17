// At-rest encryption for local data, gated behind a user-set PIN. Opt-in —
// with no PIN configured, behavior is unchanged from before this existed.
//
// Two things this actually protects, and one thing it deliberately doesn't
// bother with:
//   1. The Olm account/session pickles (identity key, ratchet state for
//      every conversation) were "encrypted" with a pickle key of
//      `sisecure-local-pickle:${profileId}` — a static, fully-derivable
//      string stored in plaintext right next to the data itself. Anyone
//      with read access to the device's IndexedDB could trivially
//      reconstruct that key and unpickle everything. getVaultPickleKeyMaterial
//      below replaces that with real, PIN-derived key material when a PIN
//      is set (see src/lib/olm.ts's pickleKeyFor).
//   2. Message content/media (encryptField/decryptField), applied at the
//      point messages are written to/read from Dexie in SiSecureContext.tsx
//      — separate from, and in addition to, the P2P wire encryption
//      (Double Ratchet) those messages already went through in transit.
//   3. profile.privateKey / publicKey are NOT touched — they're not real
//      key material, just a fake routing-id pair predating the Olm work
//      (trivially re-derivable from the public id anyway, so "protecting"
//      them would be theater).
//
// The derived key lives in memory only (module-level, cleared on lock/
// reload) — it is never itself persisted. What *is* persisted (in
// AppSettings) is a random salt and a small ciphertext of a known constant,
// used to verify a re-entered PIN produces the same key without ever
// storing the PIN.

const PBKDF2_ITERATIONS = 250_000;
const VERIFIER_PLAINTEXT = 'sisecure-pin-verify';

let vaultKeyBytes: Uint8Array | null = null;
let vaultCryptoKey: CryptoKey | null = null;

export function isVaultUnlocked(): boolean {
  return vaultCryptoKey !== null;
}

export function lockVault(): void {
  vaultKeyBytes = null;
  vaultCryptoKey = null;
}

function randomSaltB64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToB64(bytes);
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKeyMaterial(pin: string, saltB64: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256
  );
  return new Uint8Array(bits);
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToB64(combined);
}

async function aesDecrypt(key: CryptoKey, encoded: string): Promise<string> {
  const combined = b64ToBytes(encoded);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// Called once when the user first sets a PIN. Returns the values to persist
// in AppSettings (salt + verifier ciphertext) and unlocks the vault for the
// current session immediately.
export async function setupPin(pin: string): Promise<{ pinSalt: string; pinVerifier: string }> {
  const salt = randomSaltB64();
  const keyBytes = await deriveKeyMaterial(pin, salt);
  const cryptoKey = await importAesKey(keyBytes);
  const verifier = await aesEncrypt(cryptoKey, VERIFIER_PLAINTEXT);

  vaultKeyBytes = keyBytes;
  vaultCryptoKey = cryptoKey;

  return { pinSalt: salt, pinVerifier: verifier };
}

// Attempts to unlock with a re-entered PIN against the persisted salt/
// verifier. Returns false (and leaves the vault locked) on a wrong PIN —
// AES-GCM's auth tag check fails on the mismatched key, so this doesn't
// need its own explicit comparison.
export async function tryUnlock(pin: string, pinSalt: string, pinVerifier: string): Promise<boolean> {
  try {
    const keyBytes = await deriveKeyMaterial(pin, pinSalt);
    const cryptoKey = await importAesKey(keyBytes);
    const plaintext = await aesDecrypt(cryptoKey, pinVerifier);
    if (plaintext !== VERIFIER_PLAINTEXT) return false;

    vaultKeyBytes = keyBytes;
    vaultCryptoKey = cryptoKey;
    return true;
  } catch {
    return false;
  }
}

const ENC_PREFIX = 'sisecure-enc:';

export async function encryptField(plaintext: string): Promise<string> {
  if (plaintext == null || !vaultCryptoKey) return plaintext;
  return ENC_PREFIX + await aesEncrypt(vaultCryptoKey, plaintext);
}

// Returns the original string unchanged if it isn't tagged as encrypted
// (legacy plaintext data, or the vault was never enabled) — callers don't
// need to know which case they're in. Returns a placeholder, not the raw
// ciphertext, if the field is tagged encrypted but the vault is locked.
// `value` is typed as `string`, but a bad upstream write (e.g. a FileReader
// result read as null) can still land a real `null` in Dexie — guard it here
// too, since this is the security-critical boundary, not just at call sites.
export async function decryptField(value: string): Promise<string> {
  if (value == null) return value;
  if (!value.startsWith(ENC_PREFIX)) return value;
  if (!vaultCryptoKey) return '[Encrypted — unlock to view]';
  try {
    return await aesDecrypt(vaultCryptoKey, value.slice(ENC_PREFIX.length));
  } catch {
    return '[Encrypted — unlock to view]';
  }
}

// Olm's pickle key is just a string it uses internally for its own
// encryption — real secret material when a PIN is set, the old static
// per-profile string otherwise (unchanged behavior for opted-out users).
export function getVaultPickleKeyMaterial(profileId: string): string {
  if (vaultKeyBytes) {
    return `${profileId}:${bytesToB64(vaultKeyBytes)}`;
  }
  return `sisecure-local-pickle:${profileId}`;
}
