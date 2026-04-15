/**
 * 移行スクリプトで頻出する小ユーティリティ。
 */
import { readdirSync } from 'fs';
import { join } from 'path';

/** Promise ベースの sleep。 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** ISO タイムスタンプ付きで標準出力にログを書く。 */
export function tsLog(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/** ディレクトリ配下のファイルを再帰的に列挙する（絶対パス）。 */
export function scanFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}
