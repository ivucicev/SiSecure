# SiSecure - Product & UX/UI Specification

## 1. Product Overview
SiSecure is a high-security, peer-to-peer (P2P) messaging platform designed for individuals who prioritize absolute privacy and data sovereignty. Unlike traditional messengers (WhatsApp, Telegram, Signal) that rely on central servers to route or store encrypted messages, SiSecure operates on a pure P2P model.

### Purpose
To provide a communication channel where the service provider has zero knowledge, zero access, and zero metadata regarding user interactions.

### Target Users
- Privacy activists and whistleblowers.
- Businesses handling sensitive intellectual property.
- Individuals in high-surveillance regions.
- Tech-savvy users who want "off-the-grid" digital communication.

### Privacy & Security Principles
1. **Zero Cloud Residue**: No messages, media, or contact lists ever touch a 3rd party server.
2. **Physical Verification**: Contacts are added only through out-of-band QR code exchange, preventing Man-in-the-Middle (MITM) attacks.
3. **Local Sovereignty**: All data is stored in the device's secure enclave or encrypted local database.
4. **Metadata Minimization**: No central registry of "who is talking to whom".

---

## 2. Feature Set & Flows

### Onboarding & Identity
- **Local Identity Creation**: Users generate an Ed25519 key pair locally. No phone number or email required.
- **Profile**: Minimalist local profile (Display name, Avatar) stored only on-device.

### Adding Contacts (The QR Exchange)
- **Generation**: User A displays a QR code containing their Public Key and a temporary signaling address.
- **Scanning**: User B scans the code. A secure handshake is initiated over a P2P signaling channel (WebRTC).
- **Verification**: The UI displays a "Security Fingerprint" comparison to ensure the handshake was successful.

### Messaging Experience
- **One-to-One Chats**: Fluid, instant messaging.
- **Media Support**: Full-resolution images, Video, and Voice snippets.
- **Voice Messages**: Circular UI with waveform visualization.
- **Message Status**:
  - `Sent` (Left device)
  - `Delivered` (Reached peer device)
  - `Read` (Peer opened chat)
- **Persistence**: Because it's P2P, if a user is offline, the message waits in the sender's "outbox" until both peers are concurrently online.

### Data Management
- **Local Media Storage**: Automatic pruning options (e.g., delete media older than 30 days).
- **Export/Import**: Full backup of the local database into a `.sisecure` file, encrypted with a user-defined passphrase.
- **Migration**: To move to a new device, the user must export from Device A and import into Device B.

---

## 3. Security Model

### End-to-End Encryption (E2EE)
- **Protocol**: Double Ratchet Algorithm (Signal Protocol inspired) for forward secrecy and break-in recovery.
- **Key Storage**: Keys are stored in the device's secure storage (KeyChain/KeyStore) and never leave the hardware.

### Network Layer
- **Transport**: WebRTC Data Channels for direct device-to-device communication.
- **Signaling**: STUN/TURN servers are used only for discovery and NAT traversal; they never see the payload.

### Threat Model
- **Device Theft**: Protected by optional App Lock (Biometrics/PIN).
- **Network Sniffing**: All traffic is TLS-encrypted via WebRTC.
- **Server Compromise**: Irrelevant, as there is no central server.

---

## 4. UX/UI Design System

### Aesthetic: "The Obsidian Guard"
- **Mood**: High-fidelity, industrial, trustworthy.
- **Palette**:
  - `Background`: Deep Obsidian (#0F172A)
  - `Accents`: Emerald Green (#10B981) for secure states, Slate (#64748B) for secondary UI.
  - `Bubbles`: Subtle glassmorphism for a premium feel.

### Typography
- **Primary**: Inter (Clean, readable).
- **Monospaced**: JetBrains Mono for security fingerprints and keys.

### Animations
- **Spring Physics**: Smooth, weighted transitions for message bubbles.
- **Route Transitions**: Professional fade-and-slide (Motion).

---

## 5. Screen Definitions

1. **Welcome/Splash**: Atmospheric intro with "Pure P2P" branding.
2. **Identity Setup**: Simple input for "Display Name".
3. **Contact List**: Clean list with presence indicators (Online/Offline).
4. **Chat View**: Bubble-based chat with custom media player.
5. **QR Exchange**: High-contrast QR display and full-screen camera scanner.
6. **Settings**: High-level control over Storage, Privacy, and Keys.

---

## 6. Technical Architecture (Proposed)

- **Frontend**: React + Vite + Tailwind.
- **Local DB**: Dexie.js (IndexedDB wrapper) for high-performance message querying.
- **P2P Engine**: PeerJS or SimplePeer (WebRTC) for direct connections.
- **Cryptography**: Web Crypto API + Noble-Curves (for Ed25519).
- **Packaging**: Capacitor or Electron for cross-platform deployment.

---

## 7. MVP Scope
- Local identity creation.
- QR-based contact addition.
- Encrypted text messaging.
- Persistent local history.
- Dark mode only (Obsidian theme).

## 8. Future Enhancements
- Multi-device sync (Syncing via local P2P mesh).
- Self-destructing messages.
- Hidden "Denial" chats (Duress passwords).
