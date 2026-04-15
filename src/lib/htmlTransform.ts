/**
 * 記事本文 HTML を表示用に整形するピュア関数群。
 *
 * microCMS のリッチエディタは保存時に <iframe>/<script>/<video> 等を
 * 除去してしまうため、表示時に WordPress 由来のリンクなどから復元する。
 *
 * 正規表現ベースの変換は実データ（約2,000記事）で検証済み。
 * 変更時は既存記事の見え方が壊れないか注意すること。
 */

/**
 * `.mp4` / `.webm` ファイルへのリンクだけが入った `<p>` を `<video>` に展開する。
 * microCMS は `<video>` を保存時に削除するため、表示時に変換する。
 */
export function expandVideoEmbeds(html: string): string {
  return html.replace(
    /<p>\s*(?:[^<]{0,8})?<a [^>]*href="([^"]+\.(?:mp4|webm))"[^>]*>([^<]*)<\/a>\s*(?:[^<]{0,8})?<\/p>/g,
    (_, src) =>
      `<figure class="video-embed"><video controls preload="metadata" playsinline src="${src}">動画を再生できません: <a href="${src}">${src}</a></video></figure>`
  );
}

/**
 * X / Twitter の status リンクだけが入った `<p>` を公式 blockquote 埋め込みに展開する。
 * `widgets.js` は href が `twitter.com` 形式を要求するため `x.com` を正規化する。
 */
export function expandTweetEmbeds(html: string): string {
  return html.replace(
    /<p>\s*(?:[^<]{0,8})?<a [^>]*href="https?:\/\/(?:x|twitter)\.com\/([^/"]+)\/status\/(\d+)[^"]*"[^>]*>([^<]*)<\/a>\s*(?:[^<]{0,8})?<\/p>/g,
    (_, handle, id, text) => {
      const canonical = `https://twitter.com/${handle}/status/${id}`;
      return `<blockquote class="twitter-tweet" data-lang="ja"><a href="${canonical}">${
        text || `@${handle}の投稿`
      }</a></blockquote>`;
    }
  );
}

/** 変換後 HTML に Twitter 埋め込みがあるか（widgets.js 読み込み判定用）。 */
export function hasTweetEmbed(html: string): boolean {
  return html.includes('twitter-tweet');
}

/**
 * WordPress 移行 HTML 内の「<h3>歌詞</h3>」ブロックを `.wp-lyrics` でラップする。
 * discography の旧形式ページで、歌詞専用スタイルを当てるため。
 */
export function wrapLyricsSection(html: string): string {
  const re = /(<h3[^>]*>\s*歌詞\s*<\/h3>)([\s\S]*?)(?=<h3\b|$)/i;
  return html.replace(re, '<div class="wp-lyrics">$1$2</div>');
}

/**
 * 記事本文から meta description 用の抜粋を組み立てる。
 * 固定リードに続けて本文の先頭を、最大長を超えないよう省略して付与する。
 */
export function buildArticleMetaDescription(
  title: string,
  html: string,
  maxLen = 155
): string {
  const lead = `夢源風人の活動記事「${title}」。`;
  if (lead.length >= maxLen) {
    return `${lead.slice(0, maxLen - 1)}…`;
  }
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const room = maxLen - lead.length;
  if (!plain || room < 5) return lead;
  const body = plain.length > room ? `${plain.slice(0, room - 1)}…` : plain;
  return `${lead}${body}`;
}
