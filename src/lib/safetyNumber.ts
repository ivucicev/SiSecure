// Derives a short code from both parties' Olm identity keys that they can
// compare out-of-band (in person, phone call) to confirm the connection
// wasn't intercepted before the Double Ratchet handshake — the signaling
// broker (PeerJS) only negotiates the WebRTC connection and isn't
// cryptographically bound to the Olm identity, so this is the mitigation
// for that gap. Sorting the two keys first guarantees both sides compute
// the identical code regardless of who's "me" vs "them" locally.
export async function computeSafetyNumber(keyA: string, keyB: string): Promise<string> {
  const [first, second] = [keyA, keyB].sort();
  const data = new TextEncoder().encode(`${first}|${second}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const groups = hex.slice(0, 40).match(/.{1,4}/g) || [];
  return groups.join(' ').toUpperCase();
}
