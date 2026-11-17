import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [WxtVitest(), svelte(), svelteTesting()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // Thin wrappers over browser APIs, exercised by the end-to-end tests.
      exclude: ['src/lib/**/*.d.ts', 'src/lib/messages.ts', 'src/lib/zip/hosts.ts'],
      reporter: ['text', 'text-summary', 'lcov', 'html'],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});
