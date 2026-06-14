// astro.config.mjs — Astro ビルド設定（本番 URL と sitemap 生成）
// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// サイトは完全静的(SSG)。カレンダーのランタイム取得は Cloudflare Pages Functions
// (functions/api/calendar.ts) が担うため、Astro 側にアダプタは不要。
// https://astro.build/config
export default defineConfig({
  site: 'https://pitwu.com',
  integrations: [sitemap()],
});
