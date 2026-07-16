import { useEffect, useState } from 'react';

// Always on, unconditionally — no query param, no localStorage flag, no
// tap gesture. Both of those depended on something (the query string
// reaching the app, the tap handler firing) that wasn't reliably working
// on the device this was needed on, which defeated the entire point.
// This is temporary instrumentation for chasing a specific mobile-viewport
// bug, not a real app feature — remove it once that's resolved.
export function DebugOverlay() {
  const [metrics, setMetrics] = useState<Record<string, string>>({});

  useEffect(() => {
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
  }, []);

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
