import { defineConfig } from 'vitest/config';
import path from 'path';

// Tests run against the Firebase emulators:
//   npm run test:emulators   (from desktop/)
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  define: {
    'import.meta.env.VITE_FIREBASE_EMULATOR': JSON.stringify('1')
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false
  }
});
