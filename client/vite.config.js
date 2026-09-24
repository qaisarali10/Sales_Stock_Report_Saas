import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Follow the backend's own PORT (server/.env) so the proxy never needs manual configuration.
  const serverEnv = loadEnv(mode, path.resolve(process.cwd(), '../server'), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${serverEnv.PORT || 5051}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
