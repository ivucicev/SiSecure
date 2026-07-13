<div align="center">

# SiSecure

**A pure peer-to-peer messenger with real end-to-end encryption — no server ever sees your messages, contacts, or metadata.**

*Local identity · WebRTC transport · Double Ratchet encryption · Zero cloud residue*

</div>

---

## What is this

SiSecure is a messaging app built on one premise: the service provider should have **zero knowledge, zero access, and zero metadata** about who you talk to or what you say. There is no backend database of messages, no account server, no contact directory. Every message travels directly between two devices over a WebRTC data channel, encrypted with a real [Double Ratchet](https://signal.org/docs/specifications/doubleratchet/) session that only the sender and recipient can decrypt.

If SiSecure's infrastructure disappeared tomorrow, your conversations wouldn't — they were never there to begin with.

## Features

- **Local identity, no phone number or email.** A Curve25519/Ed25519 keypair is generated on-device at signup. That's your entire account.
- **Physical contact verification.** Contacts are added by scanning a QR code or entering a public key directly — no central lookup, no "find people you may know."
- **Real end-to-end encryption.** Every 1:1 conversation runs its own [Olm](https://gitlab.matrix.org/matrix-org/olm) Double Ratchet session (the same cryptographic library Matrix/Element use in production). Group chats use Megolm, with session keys distributed individually over each member's pairwise encrypted channel.
- **Direct P2P transport.** Messages travel over `RTCDataChannel`, peer to peer. A public signaling broker is used only to help two devices find each other and negotiate the connection — it never sees a single byte of message content.
- **Groups.** Encrypted group chats with membership management and automatic key rotation when members are added.
- **Rich messaging.** Text, images, voice notes, reactions, read receipts, typing indicators, message forwarding — all encrypted, all local.
- **Presence without a server.** Online/offline status is derived from live peer connections, not a centralized presence service.
- **Local data sovereignty.** Everything lives in your browser's IndexedDB. Encrypted export/import lets you migrate to a new device on your own terms.
- **Auto-pruning.** Optionally erase message history older than a configurable window, automatically.

## How it works

```
┌──────────┐        WebRTC DataChannel (DTLS + Double Ratchet)        ┌──────────┐
│  You     │ ◄─────────────────────────────────────────────────────► │  Contact │
└────┬─────┘                                                          └────┬─────┘
     │                                                                     │
     └──────────────────────┐                       ┌──────────────────────┘
                             ▼                       ▼
                      Public signaling broker (SDP/ICE only — no message content)
```

1. **Identity.** On first launch, SiSecure generates a local Ed25519/Curve25519 keypair (via Olm) plus a set of one-time prekeys — entirely on-device.
2. **Contact exchange.** Scanning a contact's QR code (or entering their key manually) hands your device their public routing address. The two devices then open a direct WebRTC connection.
3. **Handshake.** The moment that connection opens, both sides exchange their Olm identity key and a one-time prekey — bootstrapping a Double Ratchet session with zero extra round trips.
4. **Messaging.** Every message is encrypted with that session before it ever leaves the device. Each message advances the ratchet, so compromising one message's key doesn't expose the rest of the conversation.
5. **Groups.** The first time you send into a group, a Megolm session key is generated and delivered to each member individually, encrypted through your pairwise session with them — the same key-distribution pattern used by Matrix.

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 + Vite + Tailwind CSS 4 |
| Local storage | Dexie (IndexedDB) |
| P2P transport | WebRTC via PeerJS (public broker for signaling only) |
| Encryption | [`@matrix-org/olm`](https://gitlab.matrix.org/matrix-org/olm) — Double Ratchet + Megolm |
| QR code | `qrcode.react` (generate) / `html5-qrcode` (scan) |
| Animation | Motion |

## Getting started

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`. Open it in two different browsers (or two devices on the same network) to test messaging between two identities — each browser's IndexedDB is its own independent local identity, exactly as it would be on two separate phones.

Other scripts:

```bash
npm run build     # production build
npm run preview   # preview the production build locally
npm run lint      # type-check (tsc --noEmit)
```

## Project structure

```
src/
├── SiSecureContext.tsx   # Core state: identity, contacts, P2P transport, encryption
├── lib/
│   ├── db.ts             # Dexie schema (profile, contacts, messages, groups, sessions)
│   ├── olm.ts            # Olm WASM initialization
│   ├── crypto.ts         # Double Ratchet / Megolm session management
│   └── utils.ts
└── components/
    ├── Onboarding.tsx     # Local identity creation
    ├── Home.tsx           # App shell
    ├── ChatList.tsx       # Conversation list, unread indicators
    ├── ChatView.tsx       # Message thread, composer, media
    ├── AddContactModal.tsx  # QR generation/scanning, manual key entry
    ├── CreateGroupModal.tsx
    ├── GroupInfoModal.tsx
    └── SettingsModal.tsx  # Backup export/import, privacy controls
```

## Security notes

- Message content and media are encrypted before they leave the device. A signaling broker is used only to help two peers discover each other and negotiate a WebRTC connection (SDP/ICE) — it never has access to plaintext or ciphertext message content.
- Encrypted local backups are protected with a user-supplied passphrase (AES) — the passphrase never leaves your device either.
- This project is under active development. Treat it as a strong technical foundation, not yet an audited production security product — see open items below before relying on it for high-stakes threat models.

**Known limitations / roadmap:**
- The WebRTC signaling identity (used to route connections) isn't yet cryptographically bound to the Olm identity key — verifying a contact's "Security Fingerprint" out-of-band is recommended for anyone with a serious adversary model.
- No TURN relay beyond the public broker's shared fallback; connections across some restrictive networks may be unreliable.
- Multi-device sync and self-destructing messages are on the roadmap, not yet implemented.

## License

Not yet licensed for external use.
