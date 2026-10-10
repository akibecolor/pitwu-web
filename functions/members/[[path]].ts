// functions/members/[[path]].ts — Cloudflare Pages Function（/members/ 以下すべて）。
//
// メンバー向けページ（会報「みてぴとぅ」など）は 2026-10 にこのサイトから外し、pitwu-app に移した。
// ところが削除前に配信された HTML が Cloudflare のエッジに残り、一部の拠点や pages.dev から
// 古いページが返り続けた。静的ファイルの配信より手前で動く Function で必ず 404 を返し、
// エッジに残った古い応答が使われないようにする。
//
// ※ wrangler/esbuild がバンドルする。tsconfig からは除外（astro check / biome の対象外）。

interface Env {
  ASSETS: { fetch: (input: Request | string) => Promise<Response> };
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  // サイト共通の 404 ページを、404 のまま返す
  const notFound = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url).toString());
  return new Response(notFound.body, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
