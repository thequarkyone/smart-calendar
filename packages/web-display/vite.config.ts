import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fullscreen display renderer. Built and served by the server at /display; in
// dev it runs on its own port and connects to the server's WebSocket (wired up
// later). Kept lean so it runs well on a 512MB Pi Zero 2 W.
export default defineConfig({
  plugins: [react()],
  // Served by the server under /display (see app.ts's fastifyStatic prefix). Without this,
  // Vite emits root-absolute asset URLs (/assets/...) that 404 once mounted under a subpath —
  // the built bundle's own JS/CSS never load, so the kiosk/preview screen stays blank forever
  // even though index.html itself returns 200. Dev mode (its own port, no prefix) is unaffected.
  base: '/display/',
  server: {
    port: 5174,
    proxy: {
      '/ws/display': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/api/auth/display-info': {
        target: 'http://localhost:3000',
      },
    },
  },
});
