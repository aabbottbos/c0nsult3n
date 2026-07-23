import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // Prisma 7 no longer generates an index.ts barrel — point the directory
      // import to client.ts so Vitest (Node) can resolve it.
      '@/app/generated/prisma': path.resolve(__dirname, 'app/generated/prisma/client.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000,
    fileParallelism: false,
  },
})
