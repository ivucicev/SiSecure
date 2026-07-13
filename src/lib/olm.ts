import olmJsUrl from '@matrix-org/olm/olm.js?url';
import olmWasmUrl from '@matrix-org/olm/olm.wasm?url';
import type OlmType from '@matrix-org/olm';

// @matrix-org/olm's olm.js does an undeclared global assignment internally
// (`OLM_OPTIONS = opts` inside its own init()), which only works in sloppy
// mode — ES modules are implicitly strict mode, so importing this file
// directly as an ES module throws `ReferenceError: OLM_OPTIONS is not
// defined` the moment init() is called with any options. Loading it as a
// classic <script> tag (non-strict by default) sidesteps that entirely; it
// still attaches itself to `window.Olm` as a side effect either way.
let Olm: typeof OlmType;

let olmReadyPromise: Promise<void> | null = null;

function loadOlmScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Olm) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = olmJsUrl;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load olm.js'));
    document.head.appendChild(script);
  });
}

export function initOlm(): Promise<void> {
  if (!olmReadyPromise) {
    olmReadyPromise = (async () => {
      await loadOlmScript();
      Olm = (window as any).Olm as typeof OlmType;
      await Olm.init({ locateFile: () => olmWasmUrl });
    })();
  }
  return olmReadyPromise;
}

// Not a secret and not an additional security layer — Olm's pickle()/unpickle() API
// requires *some* passphrase-shaped argument to serialize session state to IndexedDB.
// This app's trust boundary is already "the device" (privateKey and decrypted message
// content are already stored in plaintext in IndexedDB per PRODUCT_SPEC's Local
// Sovereignty model), so this fixed, non-secret key only satisfies the API shape.
export function pickleKeyFor(profileId: string): string {
  return `sisecure-local-pickle:${profileId}`;
}

export { Olm };
