import { useEffect, useState } from 'react';

const STORAGE_KEY = 'sisecure_debug_overlay';

// Visit the app with ?debug=1 once (in Safari — an installed PWA launches
// from a fixed start_url with no way to add a query param to it) to show
// this from then on, including from the home-screen icon: the flag is
// persisted to localStorage, which iOS shares between Safari and an
// Add-to-Home-Screen app for the same origin. ?debug=0 clears it again.
// Exists because several rounds of mobile-viewport/keyboard fixes were
// shipped on reasoning about iOS behavior alone, with no way to see what
// was actually happening on the reporting device — each fix layered a new
// guess on the last instead of converging. This gives real numbers to
// screenshot instead.
export function DebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, string>>({});

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('debug');
    if (param === '1') localStorage.setItem(STORAGE_KEY, '1');
    if (param === '0') localStorage.removeItem(STORAGE_KEY);
    setEnabled(param === '1' || localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const measureSafeArea = (side: 'top' | 'bottom' | 'left' | 'right') => {
      const probe = document.createElement('div');
      probe.style.cssText = `position:fixed;padding-${side}:env(safe-area-inset-${side});visibility:hidden;pointer-events:none;`;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe)[`padding${side.charAt(0).toUpperCase()}${side.slice(1)}` as any];
      document.body.removeChild(probe);
      return value;
    };

    const update = () => {
      const vv = window.visualViewport;
      const body = document.body;
      const bodyHeightVar = getComputedStyle(document.documentElement).getPropertyValue('--app-height');
      setMetrics({
        'window.innerHeight': `${window.innerHeight}`,
        'window.innerWidth': `${window.innerWidth}`,
        'visualViewport.height': vv ? `${vv.height}` : 'n/a',
        'visualViewport.offsetTop': vv ? `${vv.offsetTop}` : 'n/a',
        'body.offsetHeight': `${body.offsetHeight}`,
        'body computed height': getComputedStyle(body).height,
        '--app-height (unused now)': bodyHeightVar || '(unset)',
        'window.scrollY/X': `${window.scrollY} / ${window.scrollX}`,
        'safe-area-inset-top': measureSafeArea('top'),
        'safe-area-inset-bottom': measureSafeArea('bottom'),
        'activeElement': document.activeElement?.tagName || 'none',
        'display-mode': window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
      });
    };

    update();
    const interval = setInterval(update, 500);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.85)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: '10px',
        lineHeight: 1.5,
        padding: '6px 8px',
        pointerEvents: 'none',
        maxWidth: '100vw',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {Object.entries(metrics).map(([key, value]) => (
        <div key={key}>{key}: {value}</div>
      ))}
    </div>
  );
}
