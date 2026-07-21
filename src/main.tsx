import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import './index.css';

// See the --vvh comment in index.css — plain 100dvh doesn't track the
// keyboard on every device, so body height is driven from this instead.
// Set before the first paint so there's no flash of the (wrong) dvh height.
function updateViewportHeightVar() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--vvh', `${height}px`);
}
updateViewportHeightVar();
window.visualViewport?.addEventListener('resize', updateViewportHeightVar);
window.visualViewport?.addEventListener('scroll', updateViewportHeightVar);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
