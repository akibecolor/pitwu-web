/**
 * 移行スクリプト用 .env パーサー。
 * インラインコメント (` # ...`) と前後のクォートを除去する。
 *
 * Node.js の組み込み機能だけで完結させ、依存追加を避ける。
 */
import { readFileSync } from 'fs';
import { join } from 'path';

/** プロジェクトルートの `.env` を読み込みパース結果を返す。 */
export function loadEnv(envPath = join(process.cwd(), '.env')): Record<string, string> {
  const raw = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/\s+#.*$/, '')
      .replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

export interface MicroCmsEnv {
  /** microCMS のサービスドメイン（`xxx.microcms.io` の `xxx`） */
  domain: string;
  /** Content/Management API キー */
  apiKey: string;
}

/**
 * MICROCMS_SERVICE_DOMAIN / MICROCMS_API_KEY を読み込む。
 * 未設定の場合は標準エラーに出力して `process.exit(1)` する。
 */
export function requireMicroCmsEnv(): MicroCmsEnv {
  const env = loadEnv();
  const domain = env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = env.MICROCMS_API_KEY;
  if (!domain || !apiKey) {
    console.error('❌ MICROCMS_SERVICE_DOMAIN または MICROCMS_API_KEY が未設定');
    process.exit(1);
  }
  return { domain, apiKey };
}
