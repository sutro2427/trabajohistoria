import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    sourcemap: true,
    outDir: 'dist',
  },
  server: { port: 5173 },
});
