// astro.config.mjs — Astro ビルド設定（本番 URL と sitemap 生成）
// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://pitwu.com',
  integrations: [sitemap()],
});
