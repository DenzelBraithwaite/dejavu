import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:6912',
        ws: true
      }
    }
  }
});
