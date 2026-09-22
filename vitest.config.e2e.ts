import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // class-transformer e o DI do Nest dependem do polyfill de metadata dos decorators.
    setupFiles: ['reflect-metadata'],
    // Todos os arquivos e2e compartilham o mesmo banco de testes: rodam um por vez
    // para que um não apague os dados do outro.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
