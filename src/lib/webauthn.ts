// Biometric app lock via WebAuthn platform authenticators (Face ID / Touch ID /
// Windows Hello / Android biometric unlock). There is no server here, so this
// intentionally is NOT the usual server-verified WebAuthn flow — SiSecure has no
// backend to hold a relying-party keypair or check challenge/signature validity
// against one. What it provides instead: `navigator.credentials.get()` only
// resolves if the platform authenticator itself verifies the real biometric, so
// a successful (non-throwing) call is a genuine OS-level gate on app access, the
// same trust model the "Lock the application access behind your device
// authentication flow" description already promises. It is a possession/presence
// gate, not a key-derivation step like the PIN vault (src/lib/vault.ts) — an
// attacker who could already tamper with the running JS could skip this the same
// way they could skip any client-only check. Treat it as a real device-lock UX,
// not a cryptographic boundary equivalent to the PIN vault.

const RP_NAME = 'SiSecure';

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

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Registers a new platform-authenticator credential and returns its id
// (base64url), stored in AppSettings.biometricCredentialId. Throws on
// cancellation, no available authenticator, or a non-secure context (WebAuthn
// requires HTTPS or localhost).
export async function registerBiometric(profileId: string, displayName: string): Promise<string> {
  const credential = (await navigator.credentials.create({
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
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('No credential returned');
  return bytesToBase64Url(credential.rawId);
}

// Prompts the platform authenticator (Face ID / Touch ID / Windows Hello) and
// resolves true only if it verifies the real biometric for the registered
// credential. Resolves false (never throws) on cancellation or failure, so
// callers can show a plain "try again" state.
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
