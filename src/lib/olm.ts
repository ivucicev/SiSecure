import olmJsUrl from '@matrix-org/olm/olm.js?url';
import olmWasmUrl from '@matrix-org/olm/olm.wasm?url';
import type OlmType from '@matrix-org/olm';
import { getVaultPickleKeyMaterial } from './vault';

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

// Real, PIN-derived secret material when the user has set up a vault PIN
// (src/lib/vault.ts) — otherwise the same fixed, non-secret placeholder as
// before (Olm's pickle()/unpickle() API requires *some* passphrase-shaped
// argument regardless; without a PIN there's no secret to derive one from,
// so this only satisfies the API shape, same as it always did).
export function pickleKeyFor(profileId: string): string {
  return getVaultPickleKeyMaterial(profileId);
}

export { Olm };
