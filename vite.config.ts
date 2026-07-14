import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // manifest.webmanifest + icons already hand-authored in public/ and
        // linked from index.html — this plugin only owns the service worker.
        manifest: false,
        injectRegister: 'auto',
        workbox: {
          // Olm's .wasm asset is ~150KB and the main bundle is ~1MB; default
          // 2MB precache cap would silently skip one of them.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,png,svg,wasm,webmanifest}'],
        },
        // Service workers and Vite's dev-time HMR fight each other (stale
        // cached modules, double reloads) — only ship the SW in production
        // builds, which is also the only place this app is actually served
        // from behind the Docker/nginx setup.
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      exclude: ['@matrix-org/olm'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
