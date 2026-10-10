// astro.config.mjs — Astro ビルド設定（本番 URL と sitemap 生成）
// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// サイトは完全静的(SSG)。カレンダーのランタイム取得は Cloudflare Pages Functions
// (functions/api/calendar.ts) が担うため、Astro 側にアダプタは不要。
// https://astro.build/config
export default defineConfig({
  site: 'https://pitwu.com',
  // Astro 7 で既定が 'jsx'（隣り合うインライン要素間の空白を削る）に変わった。
  // WordPress 由来の本文や見た目を変えないため、従来の挙動を明示する。
  compressHTML: true,
  integrations: [sitemap()],
});
