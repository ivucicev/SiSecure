// Biometric app lock via WebAuthn platform authenticators (Face ID / Touch ID /
// Windows Hello / Android biometric unlock).
//
// Two tiers:
//   1. Real at-rest encryption, via the `prf` WebAuthn extension: a get() with
//      extensions.prf.eval can return a deterministic, hardware-derived secret
//      that's genuine, non-exportable key material — it never touches disk,
//      only the derived AES key it produces does (see src/lib/vault.ts) — so
//      when supported, biometric unlock is as real a protection as the PIN
//      vault, no PIN required.
//   2. Presence-only fallback, when prf isn't supported (uneven platform-
//      authenticator support as of writing). navigator.credentials.get() only
//      resolves if the platform authenticator verifies the real biometric, so
//      a successful call is still a genuine OS-level gate on app access — just
//      not a source of key material.
//
// registerBiometric() deliberately does NOT request the `prf` extension
// during create() — verified live that at least one real WebAuthn
// implementation doesn't degrade gracefully the spec says it should when an
// authenticator lacks a requested extension (unsupported extension = absent
// from results; instead the WHOLE ceremony hung for the full 60s timeout,
// then rejected). Registration always uses a plain, extension-free create(),
// exactly like tier-2-only code always has, so it can't regress into that
// failure mode. prf support is instead probed separately and safely via
// PublicKeyCredential.getClientCapabilities() (a static, ceremony-free
// check, itself not universally available — treated as unsupported when
// absent, which only means falling back to tier 2, never a failure).
//
// Either way there is no server: SiSecure has no backend to hold a relying-
// party keypair or check challenge/signature validity server-side. That's
// fine for tier 1 (the prf secret is verified implicitly — a wrong/absent
// authenticator produces an output that fails the vault's AES-GCM auth tag,
// no server round-trip needed) and is the documented tradeoff for tier 2.

const RP_NAME = 'SiSecure';
const PRF_INFO = 'sisecure-vault-prf';

function randomChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// A fixed, non-secret label used as the PRF "salt" for every eval call on a
// given credential. It doesn't need to be secret or random — its only job is
// giving this app's derived secret a distinct input from whatever else might
// query the same authenticator/credential; the credential's own private key
// material (never exposed to the page) is what actually makes the output
// unpredictable to anyone else.
function prfSaltBytes(): Uint8Array {
  return new TextEncoder().encode(PRF_INFO);
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Ceremony-free capability probe — no prompt, no user interaction, just asks
// the browser what it supports. Not universally available yet; treated as
// "no prf" (tier 2) rather than attempted, when absent.
async function isPrfSupported(): Promise<boolean> {
  const getCapabilities = (PublicKeyCredential as any)?.getClientCapabilities;
  if (typeof getCapabilities !== 'function') return false;
  try {
    const capabilities = await getCapabilities();
    return capabilities?.['extension:prf'] === true;
  } catch {
    return false;
  }
}

// Registers a new platform-authenticator credential with a plain,
// extension-free create() — see the module comment for why the `prf`
// extension is never requested here. Returns the credential id (base64url)
// and whether this browser supports prf at all (checked separately, safely,
// after registration); the caller decides tier 1 vs 2 from that. Throws on
// cancellation, no available authenticator, or a non-secure context
// (WebAuthn requires HTTPS or localhost).
export async function registerBiometric(
  profileId: string,
  displayName: string
): Promise<{ credentialId: string; prfSupported: boolean }> {
  const credential = await navigator.credentials.create({
    publicKey: {
      rp: { name: RP_NAME },
      user: {
        id: new TextEncoder().encode(profileId),
        name: displayName,
        displayName,
      },
      challenge: randomChallenge(),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60_000,
    },
  });

  if (!credential) throw new Error('No credential returned');
  const credentialId = bytesToBase64Url((credential as PublicKeyCredential).rawId);
  const prfSupported = await isPrfSupported();
  return { credentialId, prfSupported };
}

// Prompts the platform authenticator and, when it supports prf, returns the
// derived secret as raw bytes for src/lib/vault.ts to turn into an AES key.
// Returns null (never throws) on cancellation, failure, or when prf isn't
// supported by this authenticator — callers distinguish "wrong biometric"
// from "no prf support" via the separate presence-only verifyBiometric().
export async function getPrfOutput(credentialId: string): Promise<ArrayBuffer | null> {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: base64UrlToBytes(credentialId), type: 'public-key' }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: prfSaltBytes() } } },
        timeout: 60_000,
      },
    });
    if (!assertion) return null;
    // Cast through `any`: WebAuthn Level 3's `prf` extension isn't uniformly
    // typed across TS DOM lib versions yet, and the shape here is exactly
    // what the spec defines regardless.
    const results = (assertion as any).getClientExtensionResults();
    const first: BufferSource | undefined = results?.prf?.results?.first;
    if (!first) return null;
    return first instanceof ArrayBuffer ? first : new Uint8Array(first.buffer, first.byteOffset, first.byteLength).slice().buffer;
  } catch {
    return null;
  }
}

// Presence-only verification (tier 2 fallback, and also usable as a plain
// "confirm it's really you" check independent of the vault). Resolves true
// only if the platform authenticator verifies the real biometric for the
// registered credential. Resolves false (never throws) on cancellation or
// failure, so callers can show a plain "try again" state.
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: base64UrlToBytes(credentialId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return assertion !== null;
  } catch {
    return false;
  }
}
