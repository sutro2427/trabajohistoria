import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El dominio y el arte son TypeScript puro sin DOM: corren en Node, en milisegundos.
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts', 'tests/sim/**/*.spec.ts'],
  },
});
