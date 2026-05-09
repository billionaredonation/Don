import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/Don/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
