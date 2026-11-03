/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages ではリポジトリ名がパスになる（https://<user>.github.io/fp-master/）
const base = process.env.VITE_BASE ?? '/fp-master/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FP Master',
        short_name: 'FP Master',
        description: 'FP技能検定2級・3級（日本FP協会）の学習アプリ',
        lang: 'ja',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f766e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // プリキャッシュはアプリ本体（シェル）に限定する。問題データのチャンクは
        // 初回読み込み時にランタイムキャッシュ（CacheFirst）へ入り、2回目以降と
        // オフライン時はそこから配信される。全データをプリキャッシュすると
        // SW のインストールが重くなり（約19MB）、リロード時の動的 import と
        // 競合して読み込み失敗の原因になるため分離した（I-004/I-005）。
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        globIgnores: [
          '**/g2_*.js',
          '**/g2n_*.js',
          '**/g2o_*.js',
          '**/j2_*.js',
          '**/j2o_*.js',
          '**/explanations-*.js',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/(?:g2_|g2n_|g2o_|j2_|j2o_|explanations-)[^/]*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fp-question-data-v1',
              // ファイル名に内容ハッシュが付くため、同じURLの中身は変わらない（期限切れによる再取得は不要）。
              // maxAgeSeconds を付けると、最後の取得から期限を過ぎた時点でオフラインでは問題データを読めなくなるため付けない。
              // 古い版のチャンクは maxEntries（最近使っていないものから削除）で整理される。
              expiration: { maxEntries: 400 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
