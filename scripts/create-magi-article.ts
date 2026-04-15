/**
 * X記事「MAGI-PITWU」をmicroCMS記事として作成
 * https://x.com/mugenkajipitwu/status/2039118090462744601
 */

import { requireMicroCmsEnv } from './lib/env.js';
import { tsLog as log } from './lib/util.js';

const { domain: D, apiKey: K } = requireMicroCmsEnv();

async function uploadImage(url: string, name: string): Promise<string | null> {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) { log(`DL fail: ${r.status} ${url}`); return null; }
  const buf = Buffer.from(await r.arrayBuffer());
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'image/jpeg' }), name);
  const u = await fetch(`https://${D}.microcms-management.io/api/v1/media`, {
    method: 'POST', headers: { 'X-MICROCMS-API-KEY': K }, body: form,
  });
  if (!u.ok) { log(`Upload fail: ${u.status}`); return null; }
  const d = await u.json() as { url?: string };
  return d.url ?? null;
}

log('画像アップロード中...');
const coverCdn = await uploadImage('https://pbs.twimg.com/media/HEtwmpjasAAfNEW.jpg', 'magi-pitwu-cover.jpg');
const archCdn  = await uploadImage('https://pbs.twimg.com/media/HEuB1eJacAAls_K.png', 'magi-pitwu-architecture.png');
log(`cover: ${coverCdn}`);
log(`arch:  ${archCdn}`);

const html = `
<p><img src="${coverCdn}" alt="MAGI-PITWU"></p>
<p>「（前略）そうだ、MAGIを作ろう！」</p>
<p>🌐 MAGI-PITWU: <a href="https://magi.pitwu.com/" target="_blank" rel="noopener">https://magi.pitwu.com/</a></p>
<p>「もしもMAGIの3つの人格が、すべて高知の尖った関係者だったら？」というエイプリルフール企画でした！お遊びかつ裏側はゴリゴリの最新モダンフロントエンド環境で構築しています。今回はこの無駄に（？）ガチな技術スタックと実装の裏側を解説します！</p>

<h2>🛠️ コア技術スタック</h2>
<ul>
  <li><strong>Framework:</strong> Next.js (App Router) + TypeScript</li>
  <li><strong>AI Engine:</strong> Google Gemini API (@google/generative-ai)</li>
  <li><strong>Styling:</strong> 100% Vanilla CSS（Tailwind不使用）</li>
  <li><strong>Infra:</strong> Vercel (Serverless Functions)</li>
</ul>
<p>図にするとこんな感じです。</p>
<p><img src="${archCdn}" alt="MAGI-PITWU アーキテクチャ図"></p>

<h2>1️⃣ AIの完全非同期・独立並行処理（Promise.all）</h2>
<p>本家MAGIの「3つのスーパーコンピュータによる多数決制」を完全再現するために、Gemini APIに対して3つの異なるプロンプト（システム指示）を同時に並列リクエストしています。</p>
<ul>
  <li><strong>MELCHIOR-1：</strong>踊り子・情熱の人格</li>
  <li><strong>BALTHASAR-2：</strong>酒豪・宴の人格</li>
  <li><strong>CASPER-3：</strong>カツオ・土佐の誇りの人格</li>
</ul>
<p>APIのレスポンス完了時間はバラバラなため、UI側でステータス管理を行い、すべての回答が出揃った瞬間にUI上で「<strong>可決（APPROVE）</strong>」か「<strong>否決（DENY）</strong>」の最終ジャッジを下す仕組みです。</p>

<h2>2️⃣ Vanilla CSSと「cqi」による完全レスポンシブの鳴子型UI</h2>
<p>画面中央の特徴的なMAGIパネルは、画像ではなく <code>clip-path: polygon(...)</code> で描画した幾何学図形です。今回は通常の六角形ではなく、上下の長さを調整して「鳴子」の形を模しています。</p>
<p>スマホの縦長画面でもこの幾何学レイアウトを1ミリも崩さないため、コンテナクエリ（<code>cqi</code> 単位）をフル活用しました。デバイス幅に関わらず、文字サイズからパネルの余白まで比率を保ったままシームレスに縮小される変態的（？）なレスポンシブ設計を実現しています。</p>

<h2>3️⃣ 温度（Temperature）操作と隠し「完全暴走モード」</h2>
<p>設定（SYS_CONFIG）から、AIの生成温度（Temperature）を調整可能にしました。生成AIにおける「Temperature」は回答のランダム性を指しますが、今回はこれを「AIの感情の昂り・暴走レベル」として再定義しています。</p>
<p>スライダーを極限（2.0）に設定すると、UIが赤い警戒色（CODE 777）に染まり、MAGI達の制限リミッターが強制解除。理性を失い、全編「超・熱い土佐弁」で激情的な回答を叩きつけてくる裏ギミックを仕込んでいます笑</p>

<h2>4️⃣ ターミナル風演出とXシェア連携</h2>
<p>ただテキストを表示するだけでなく、画面全体のブラウン管（CRT）スキャンライン効果や、処理中のターミナル風プログレスバー <code>PROCESSING: [██████░░░]</code> をCSS AnimationsとReactのuseEffectタイマーで実装し、サイバーパンクな没入感を高めました。</p>
<p>結果が出た後は、専用のOGPルーティングを通じて、自分だけの裁定結果と文字数制限ギリギリのサマリーを瞬時にXの意図（intent）URLへ投げるシェア機能も完備しています。</p>

<p>最新のNext.jsとGemini APIを組み合わせると、こうしたリアルタイムな対話型エージェントシステムが爆速でデプロイできて最高で。「よさこいにまつわる疑問」や「今日のお昼ご飯の裁定」まで、MAGI-PITWUに何でも相談してみてください！</p>

<p><em>ただし、今日の12時を過ぎると・・・？</em></p>

<p>👉 <a href="https://magi.pitwu.com/" target="_blank" rel="noopener">MAGI-PITWU を試してみる</a></p>
<p>📺 <a href="https://x.com/mugenkajipitwu/status/2039118090462744601" target="_blank" rel="noopener">元のX投稿（暴走モードのデモ動画あり）</a></p>
`.trim();

const body = {
  title: 'エヴァの「MAGIシステム」を模した、よさこいAI合議システム「MAGI-PITWU」を開発の流れ',
  slug: 'magi-pitwu',
  content: html,
  category: 'ig-12u_wy4', // BLOG
  wpDate: '2026-04-01T12:00:00.000+09:00',
  eyecatch: coverCdn,
};

log('記事作成中...');
const c = await fetch(`https://${D}.microcms.io/api/v1/articles`, {
  method: 'POST',
  headers: { 'X-MICROCMS-API-KEY': K, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
log(`Create: ${c.status}`);
if (!c.ok) {
  log(await c.text());
  process.exit(1);
}
const created = await c.json() as { id: string };
log(`✓ 記事作成完了: id=${created.id}`);
log(`URL予想: /2026/04/magi-pitwu/`);
