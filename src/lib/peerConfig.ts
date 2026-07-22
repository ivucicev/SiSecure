import type { PeerOptions } from 'peerjs';
import type { AppSettings } from './db';

// PeerJS's default cloud broker (0.peerjs.com) only relays signaling — it
// ships with Google's public STUN servers but no TURN, so two peers that are
// both behind a symmetric NAT (common on carrier/mobile networks) can never
// hole-punch a direct connection and just fail silently. This lets the user
// point at their own PeerServer and/or TURN server to fix that.
export function buildPeerOptions(settings: AppSettings | null | undefined): PeerOptions {
  const opts: PeerOptions = {};

  if (settings?.customPeerHost) {
    opts.host = settings.customPeerHost;
    if (settings.customPeerPort) opts.port = settings.customPeerPort;
    if (settings.customPeerPath) opts.path = settings.customPeerPath;
    opts.secure = settings.customPeerSecure ?? true;
  }

  if (settings?.customTurnUrls) {
    const urls = settings.customTurnUrls.split(',').map(u => u.trim()).filter(Boolean);
    if (urls.length) {
      opts.config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls,
            username: settings.customTurnUsername || undefined,
            credential: settings.customTurnCredential || undefined
          }
        ]
      };
    }
  }

  return opts;
}
