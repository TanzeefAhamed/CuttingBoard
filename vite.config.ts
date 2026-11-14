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
        manualChunks: {
          vendor: ['react', 'react-dom', 'zustand'],
          ui: ['@radix-ui/react-tabs', '@radix-ui/react-dropdown-menu', '@radix-ui/react-dialog', '@radix-ui/react-slider', '@radix-ui/react-switch', '@radix-ui/react-select', '@radix-ui/react-tooltip'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          virtual: ['@tanstack/react-virtual'],
          forms: ['react-hook-form', 'zod'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});