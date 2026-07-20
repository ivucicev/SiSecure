import React, { useEffect, useState } from 'react';

// Gated behind ?debug=1 (see main.tsx) — a way to actually see what the
// visual viewport / scroll state is doing on a specific device instead of
// guessing at iOS Safari keyboard quirks from a machine that can't
// reproduce them. Not shipped visible by default.
function readSnapshot(): string {
  const vv = window.visualViewport;
  return [
    `win ${window.innerWidth}x${window.innerHeight} scrollY:${Math.round(window.scrollY)}`,
    vv
      ? `vv ${Math.round(vv.width)}x${Math.round(vv.height)} offsetTop:${Math.round(vv.offsetTop)} scale:${vv.scale.toFixed(2)}`
      : 'vv n/a',
    `doc clientH:${document.documentElement.clientHeight} scrollH:${document.documentElement.scrollHeight}`,
    `body clientH:${document.body.clientHeight} scrollTop:${document.body.scrollTop}`,
    `active: ${document.activeElement?.tagName || 'none'}`
  ].join('\n');
}

export function DebugViewportOverlay() {
  const [snapshot, setSnapshot] = useState(readSnapshot);

  useEffect(() => {
    const update = () => setSnapshot(readSnapshot());
    const interval = setInterval(update, 200);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('focusin', update);
    return () => {
      clearInterval(interval);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('focusin', update);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999999,
        background: 'rgba(0,0,0,0.85)',
        color: '#4ade80',
        fontFamily: 'monospace',
        fontSize: 10,
        lineHeight: 1.4,
        padding: '4px 8px',
        whiteSpace: 'pre',
        pointerEvents: 'none'
      }}
    >
      {snapshot}
    </div>
  );
}
