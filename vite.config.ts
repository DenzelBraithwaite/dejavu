import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler'
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(moduleId): string | undefined {
          if (moduleId.includes('/node_modules/')) {
            return 'vendor';
          }

          if (moduleId.endsWith('/StoryLibrary.svelte')) {
            return 'story-editor';
          }

          if (moduleId.includes('/src/lib/components/')
            && /\/(Billywig|Chopsticks|DroneRelay|FirewallAuction|LoHi|Mastermind|NetRunners|PacketWar|Pigz|TraceRace)\.svelte$/.test(moduleId)) {
            return 'minigames';
          }

          return undefined;
        }
      }
    }
  },
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
