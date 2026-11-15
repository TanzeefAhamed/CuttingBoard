import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/zustand')) {
            return 'vendor';
          }
          if (id.includes('@radix-ui')) {
            return 'ui';
          }
          if (id.includes('@dnd-kit')) {
            return 'dnd';
          }
          if (id.includes('@tanstack')) {
            return 'virtual';
          }
          if (id.includes('react-hook-form') || id.includes('zod')) {
            return 'forms';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});