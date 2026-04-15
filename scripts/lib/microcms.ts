/**
 * 移行スクリプト用 microCMS ヘルパー（fetch ベース）。
 *
 * 公開 Content API（read / PATCH / POST）と Management API（media upload）の
 * 両方を扱うため、`microcms-js-sdk` ではなく直接 fetch を使う。
 */
import { readFileSync } from 'fs';
import type { MicroCmsEnv } from './env.js';

/** ファイル名から Content-Type を推定する。未知の拡張子は `application/octet-stream`。 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    bmp: 'image/bmp',
  };
  return map[ext] ?? 'application/octet-stream';
}

export interface MicroCmsClient {
  /** Content API: 全件取得（offset/limit 自動ページング） */
  fetchAll<T>(endpoint: string, fields?: string): Promise<T[]>;
  /** Content API: 単一コンテンツ取得 */
  getOne<T>(endpoint: string, id: string, fields?: string): Promise<T>;
  /** Content API: PATCH。`{ ok, status, msg }` を返す（例外を投げない） */
  patch(
    endpoint: string,
    id: string,
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; status: number; msg?: string }>;
  /** Content API: POST してリソース ID を返す（失敗時は throw） */
  create(endpoint: string, body: Record<string, unknown>): Promise<string>;
  /**
   * Management API: メディアをアップロードして CDN URL を返す。
   * 429（レートリミット）の場合は `'rate-limit'` を、その他失敗は `null` を返す。
   */
  uploadMedia(
    file: { filePath: string } | { buffer: Buffer; filename: string; mime?: string }
  ): Promise<string | null | 'rate-limit'>;
}

/**
 * microCMS の各種 API を呼ぶ薄いクライアントを生成する。
 *
 * @param env `requireMicroCmsEnv()` で取得した値を渡す
 * @param opts.uploadTimeoutMs メディアアップロード（既定 60s）
 * @param opts.requestTimeoutMs その他リクエスト（既定 30s）
 */
export function createMicroCmsClient(
  env: MicroCmsEnv,
  opts: { uploadTimeoutMs?: number; requestTimeoutMs?: number } = {}
): MicroCmsClient {
  const { domain, apiKey } = env;
  const uploadTimeoutMs = opts.uploadTimeoutMs ?? 60000;
  const requestTimeoutMs = opts.requestTimeoutMs ?? 30000;

  const contentBase = `https://${domain}.microcms.io/api/v1`;
  const mgmtBase = `https://${domain}.microcms-management.io/api/v1`;
  const headers = { 'X-MICROCMS-API-KEY': apiKey } as const;

  return {
    async fetchAll<T>(endpoint: string, fields?: string): Promise<T[]> {
      const limit = 100;
      let offset = 0;
      const all: T[] = [];
      while (true) {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (fields) params.set('fields', fields);
        const res = await fetch(`${contentBase}/${endpoint}?${params}`, { headers });
        const data = (await res.json()) as { contents: T[]; totalCount: number };
        all.push(...data.contents);
        if (all.length >= data.totalCount) break;
        offset += limit;
      }
      return all;
    },

    async getOne<T>(endpoint: string, id: string, fields?: string): Promise<T> {
      const params = fields ? `?fields=${encodeURIComponent(fields)}` : '';
      const res = await fetch(`${contentBase}/${endpoint}/${id}${params}`, { headers });
      if (!res.ok) {
        throw new Error(`GET ${endpoint}/${id} failed: ${res.status}`);
      }
      return (await res.json()) as T;
    },

    async patch(endpoint, id, body) {
      try {
        const res = await fetch(`${contentBase}/${endpoint}/${id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        if (res.ok) return { ok: true, status: res.status };
        return {
          ok: false,
          status: res.status,
          msg: (await res.text()).slice(0, 150),
        };
      } catch (e) {
        return { ok: false, status: 0, msg: String(e).slice(0, 100) };
      }
    },

    async create(endpoint, body) {
      const res = await fetch(`${contentBase}/${endpoint}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${endpoint} failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as { id: string };
      return data.id;
    },

    async uploadMedia(file) {
      try {
        let buffer: Buffer;
        let filename: string;
        let mime: string;

        if ('filePath' in file) {
          filename = file.filePath.split(/[/\\]/).pop()!;
          mime = getMimeType(filename);
          buffer = readFileSync(file.filePath);
        } else {
          filename = file.filename;
          mime = file.mime ?? getMimeType(filename);
          buffer = file.buffer;
        }

        const form = new FormData();
        form.append('file', new Blob([buffer], { type: mime }), filename);

        const res = await fetch(`${mgmtBase}/media`, {
          method: 'POST',
          headers,
          body: form,
          signal: AbortSignal.timeout(uploadTimeoutMs),
        });

        if (res.status === 429) return 'rate-limit';
        if (!res.ok) return null;
        const data = (await res.json()) as { url?: string };
        return data.url ?? null;
      } catch {
        return null;
      }
    },
  };
}
