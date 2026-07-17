// At-rest encryption for local data, gated behind a user-set PIN and/or a
// WebAuthn biometric (Face ID / Touch ID / Windows Hello, via the `prf`
// extension — see src/lib/webauthn.ts). Opt-in — with neither configured,
// behavior is unchanged from before this existed.
//
// Two things this actually protects, and one thing it deliberately doesn't
// bother with:
//   1. The Olm account/session pickles (identity key, ratchet state for
//      every conversation) were "encrypted" with a pickle key of
//      `sisecure-local-pickle:${profileId}` — a static, fully-derivable
//      string stored in plaintext right next to the data itself. Anyone
//      with read access to the device's IndexedDB could trivially
//      reconstruct that key and unpickle everything. getVaultPickleKeyMaterial
//      below replaces that with real, derived key material once a PIN or
//      biometric is set (see src/lib/olm.ts's pickleKeyFor).
//   2. Message content/media (encryptField/decryptField), applied at the
//      point messages are written to/read from Dexie in SiSecureContext.tsx
//      — separate from, and in addition to, the P2P wire encryption
//      (Double Ratchet) those messages already went through in transit.
//   3. profile.privateKey / publicKey are NOT touched — they're not real
//      key material, just a fake routing-id pair predating the Olm work
//      (trivially re-derivable from the public id anyway, so "protecting"
//      them would be theater).
//
// Key model: there is one random 32-byte VAULT MASTER KEY, generated the
// first time either method is enabled. It lives in memory only (module-level,
// cleared on lock/reload) and is never itself persisted. What IS persisted
// (in AppSettings) is, per enabled method, a small wrapped (AES-GCM
// encrypted) copy of that same master key:
//   - pinWrappedKey (+ pinSalt): master key encrypted with a PBKDF2(pin,
//     salt)-derived key.
//   - biometricWrappedKey (+ biometricPrfSalt): master key encrypted with a
//     key derived from the authenticator's WebAuthn `prf` extension output.
// Either method independently recovers the SAME master key, so enabling a
// second method after the first just wraps the existing key again — no
// re-encryption of messages/pickles needed — and unlocking via either method
// gives identical access. A failed unwrap (wrong PIN, wrong/absent
// authenticator) is simply an AES-GCM auth-tag failure; no separate
// verifier ciphertext is needed the way the very first version of this file
// used for PIN.
//
// Backward compatibility: PIN-only vaults created before this file supported
// biometric use a simpler legacy format — pinVerifier (an encrypted known
// constant) instead of pinWrappedKey, and the PBKDF2 output IS the vault key
// directly rather than unwrapping a separately-generated master key. That
// path (setupPinLegacy/tryUnlockPinLegacy) still works unchanged; PIN-only
// users never re-encrypt anything just by upgrading this app. The legacy
// path is only used when no pinWrappedKey is present.

const PBKDF2_ITERATIONS = 250_000;
const VERIFIER_PLAINTEXT = 'sisecure-pin-verify';
const MASTER_KEY_BYTES = 32;

let vaultKeyBytes: Uint8Array | null = null;
let vaultCryptoKey: CryptoKey | null = null;

export function isVaultUnlocked(): boolean {
  return vaultCryptoKey !== null;
}

export function lockVault(): void {
  vaultKeyBytes = null;
  vaultCryptoKey = null;
}

// Exposes the in-memory master key so orchestration code (SiSecureContext)
// can wrap it under a SECOND method's key without needing to know anything
// about how the first method derived it.
export function getCurrentVaultKeyBytes(): Uint8Array | null {
  return vaultKeyBytes;
}

// Sets the in-memory vault key directly from already-derived bytes (used by
// the biometric unlock path, which recovers the master key via PRF rather
// than deriving it from a PIN).
async function setVaultKeyBytes(bytes: Uint8Array): Promise<void> {
  vaultKeyBytes = bytes;
  vaultCryptoKey = await importAesKey(bytes);
}

function randomBytes(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len));
}

function randomSaltB64(): string {
  return bytesToB64(randomBytes(16));
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

async function aesEncryptBytes(key: CryptoKey, plaintext: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToB64(combined);
}

async function aesDecryptBytes(key: CryptoKey, encoded: string): Promise<Uint8Array> {
  const combined = b64ToBytes(encoded);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}

async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<string> {
  return aesEncryptBytes(key, new TextEncoder().encode(plaintext));
}

async function aesDecrypt(key: CryptoKey, encoded: string): Promise<string> {
  return new TextDecoder().decode(await aesDecryptBytes(key, encoded));
}

// ---- PIN: legacy direct-derivation path (pre-dates biometric support) -----
// Used only when setting up PIN as the FIRST and (so far) only lock method —
// the PBKDF2 output IS the vault key, no wrapped master key involved. Kept
// so existing PIN-only vaults never need to re-encrypt anything just because
// this file gained biometric support.

export async function setupPinLegacy(pin: string): Promise<{ pinSalt: string; pinVerifier: string }> {
  const salt = randomSaltB64();
  const keyBytes = await deriveKeyMaterial(pin, salt);
  const cryptoKey = await importAesKey(keyBytes);
  const verifier = await aesEncrypt(cryptoKey, VERIFIER_PLAINTEXT);

  vaultKeyBytes = keyBytes;
  vaultCryptoKey = cryptoKey;

  return { pinSalt: salt, pinVerifier: verifier };
}

async function tryUnlockPinLegacy(pin: string, pinSalt: string, pinVerifier: string): Promise<boolean> {
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

// ---- PIN: wrapped-master-key path (used once a second method is added) ---

// Wraps `masterKey` (the CURRENT vault key, from wherever it came from) under
// a fresh PBKDF2(pin) key. Used both when PIN is added alongside an already-
// enabled biometric (masterKey = the biometric-derived key already in
// memory) and, symmetrically, when biometric is added alongside an already-
// enabled legacy PIN (masterKey = that PIN's direct PBKDF2 output).
export async function wrapMasterKeyWithPin(pin: string, masterKey: Uint8Array): Promise<{ pinSalt: string; pinWrappedKey: string }> {
  const salt = randomSaltB64();
  const wrappingKey = await importAesKey(await deriveKeyMaterial(pin, salt));
  const pinWrappedKey = await aesEncryptBytes(wrappingKey, masterKey);
  return { pinSalt: salt, pinWrappedKey };
}

async function tryUnlockPinWrapped(pin: string, pinSalt: string, pinWrappedKey: string): Promise<boolean> {
  try {
    const wrappingKey = await importAesKey(await deriveKeyMaterial(pin, pinSalt));
    const masterKey = await aesDecryptBytes(wrappingKey, pinWrappedKey);
    await setVaultKeyBytes(masterKey);
    return true;
  } catch {
    return false;
  }
}

// Single entry point App.tsx/SettingsModal call — picks legacy vs wrapped
// verification based on which fields are present, so callers don't need to
// know which format a given install is on.
export async function tryUnlockPin(
  pin: string,
  config: { pinSalt: string; pinVerifier?: string; pinWrappedKey?: string }
): Promise<boolean> {
  if (config.pinWrappedKey) {
    return tryUnlockPinWrapped(pin, config.pinSalt, config.pinWrappedKey);
  }
  if (config.pinVerifier) {
    return tryUnlockPinLegacy(pin, config.pinSalt, config.pinVerifier);
  }
  return false;
}

// ---- Biometric (WebAuthn `prf` extension) ---------------------------------

// A fresh master key, used when biometric is the FIRST lock method enabled
// (no existing vault key to reuse yet). Random and independent of the PRF
// output itself — the PRF output only ever WRAPS this key, it never IS this
// key, so rotating/re-registering the credential later stays possible
// without redefining what the data is encrypted with.
export function generateMasterKey(): Uint8Array {
  return randomBytes(MASTER_KEY_BYTES);
}

// The raw PRF output is already 32 bytes of high-entropy, deterministic,
// hardware-derived pseudorandom data (an HMAC over app-chosen salt material)
// — passed through one SHA-256 hash with a fixed app-specific label for
// clean domain separation before use as an AES key, rather than importing
// the authenticator's raw output directly.
async function deriveKeyFromPrfOutput(prfOutput: ArrayBuffer): Promise<Uint8Array> {
  const label = new TextEncoder().encode('sisecure-biometric-vault-key');
  const combined = new Uint8Array(prfOutput.byteLength + label.length);
  combined.set(new Uint8Array(prfOutput), 0);
  combined.set(label, prfOutput.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(digest);
}

// Wraps `masterKey` under a key derived from this credential's PRF output.
// Called right after registerBiometric() (masterKey = a fresh one, biometric
// enabled first) or when adding biometric alongside an existing PIN
// (masterKey = the PIN's current vault key).
export async function wrapMasterKeyWithPrf(prfOutput: ArrayBuffer, masterKey: Uint8Array): Promise<string> {
  const wrappingKey = await importAesKey(await deriveKeyFromPrfOutput(prfOutput));
  return aesEncryptBytes(wrappingKey, masterKey);
}

// Unwraps the stored biometricWrappedKey using a freshly obtained PRF
// output, and — on success — sets it as the live vault key. Returns false
// (leaves the vault locked) on any failure; a wrong/replaced authenticator
// produces a PRF output that fails AES-GCM's auth tag, same failure shape as
// a wrong PIN.
export async function tryUnlockBiometric(prfOutput: ArrayBuffer, biometricWrappedKey: string): Promise<boolean> {
  try {
    const wrappingKey = await importAesKey(await deriveKeyFromPrfOutput(prfOutput));
    const masterKey = await aesDecryptBytes(wrappingKey, biometricWrappedKey);
    await setVaultKeyBytes(masterKey);
    return true;
  } catch {
    return false;
  }
}

// Directly adopts `masterKey` as the live vault key without any unwrapping —
// used right after generating a brand new master key (setup time) or right
// after wrapping an existing one under a newly added second method, in both
// cases because the caller already has the plaintext master key in hand.
export async function adoptVaultKey(masterKey: Uint8Array): Promise<void> {
  await setVaultKeyBytes(masterKey);
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
// encryption — real secret material when a PIN and/or biometric is set, the
// old static per-profile string otherwise (unchanged behavior for opted-out
// users).
export function getVaultPickleKeyMaterial(profileId: string): string {
  if (vaultKeyBytes) {
    return `${profileId}:${bytesToB64(vaultKeyBytes)}`;
  }
  return `sisecure-local-pickle:${profileId}`;
}
