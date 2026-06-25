import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest 設定 — 驗證 gate 骨幹 (F1)。
 *
 * - environment: 'node' — 排盤/校正/抽牌等核心邏輯皆為純函式,不需 DOM。
 *   元件測試之後另加 jsdom 環境 (依需求最小化依賴,見 PLAN §18 F1)。
 * - alias '@' 對齊 tsconfig.json paths,確保 `@/lib/...` 在測試中可解析。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});
