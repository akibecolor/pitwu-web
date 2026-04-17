# 作品ページ（Discography）仕様・運用ルール

## データの場所

| 役割 | ファイル |
|------|---------|
| 実データ（全曲） | `src/data/wp-pages.json` → `songs[]` 配列 |
| ページテンプレート | `src/pages/discography/[slug].astro` |
| 一覧ページ | `src/pages/discography/index.astro` |

ビルド時に `getStaticPaths` が `songs` を読み、`slug` ごとに静的ページを生成する。  
**曲を追加・編集する = `wp-pages.json` を編集する。**

---

## song オブジェクトのフィールド

```jsonc
{
  "slug": "soleil",           // URL: /discography/soleil/
  "title": "Soleil",          // 表示タイトル
  "year": 2024,               // 年度（数値 or "2020-2022" のような文字列も可）
  "romaji": "Soleil",         // ヘッダーのサブタイトルに使用
  "content": "<p>...</p>",    // WordPress 移行コンテンツ（レガシー用。保持するが使わない）

  // ── 動画 ──
  "youtubeId": "XXXXXXX",         // 動画1本のとき
  "youtubeIds": ["AAA", "BBB"],   // 動画2本以上のとき（youtubeId と排他）

  // ── 構造化コンテンツ ──
  "lyrics": "<p>...<br>...</p>",  // 歌詞 HTML
  "costumeIllustrationHtml": "<img ...>", // 衣装イラスト HTML（衣装セクションのサブ）
  "costumeHtml": "<img ...>",     // 衣装写真 HTML
  "yataiHtml": "<img ...>",       // 地方車写真 HTML
  "awardsHtml": "<ul class=\"home-list\"><li>...</li></ul>", // 受賞歴 HTML（なければ null）

  // ── クレジット ──
  "credits": {
    "choreographer":  "振付担当者",
    "costumeDesignBy":"衣装デザイン担当者",
    "lyricist":       "作詞者",
    "composer":       "楽曲担当者",
    "guitarist":      "ギター担当者",
    "shamisen":       "三味線担当者",
    "vocalist":       "歌担当者",
    "chorus":         "コーラス担当者",
    "ryukyuAori":     "琉球煽り担当者",
    "costumeBy":      "衣装制作担当者",
    "narukoBy":       "鳴子制作担当者",
    "floatBy":        "地方車製作担当者"
  }
}
```

`credits` フィールドが **存在すれば** 構造化レイアウト（2019年以降の形式）で描画される。  
`credits` が **ない** と WordPress の `content` HTML をそのまま描画するレガシーモードになる。  
不明な値は `null` にする（`*` は使わない）。

---

## 構造化ページのセクション順（表示順）

1. **メイン動画**（`youtubeIds` が2本以上のとき、1本目をページ最上部に見出しなしで表示）
2. **歌詞 / Lyrics**
3. **衣装 / Costume**
4. **地方車 / Jikatasha**
5. **作品情報 / Credits**
6. **受賞歴 / Awards**（`awardsHtml` がある場合のみ表示）
7. **作品動画 / Video**（`youtubeIds` が2本以上なら2本目以降、1本なら1本）

---

## 各フィールドの書式ルール

### 歌詞（`lyrics`）
- `<p>` タグ = 1ブロック（ひとまとまりのフレーズ）
- ブロック内の改行 = `<br>`
- 空行（ブロック区切り）= 別の `<p>` タグ

```html
<p>花は夏の夜に咲く 夢とともに<br>空を映す　堀の揺らぎが 滲んで　赤く燃ゆる</p>
<p>高知の城下へ来てみんや<br>じんまもばんばもようおどる</p>
```

### 受賞歴（`awardsHtml`）
- `<ul class="home-list">` を使う
- 1件 = `<li>祭り名：賞名</li>`
- 受賞がない年は `null`

```html
<ul class="home-list">
  <li>よさこい大阪大会：大賞</li>
  <li>能登よさこい祭り：能登和っちゃ賞</li>
</ul>
```

### 衣装・地方車（`costumeHtml` / `yataiHtml`）
- WordPress から移行した `<img>` タグをそのまま格納
- 複数枚あってもよい（CSS で自動的に `1rem` ギャップが入る）
- 写真がなければ `null`（Coming Soon が表示される）

### 衣装イラスト（`costumeIllustrationHtml`）
- 衣装セクションのサブカテゴリ「Illustration / 衣装イラスト」として表示
- 画像は `public/images/works/<slug>/` に配置し、`<img src="/images/works/<slug>/xxx.jpg" ...>` の形で記述
- `costumeHtml`（写真）と併存する場合、両方にサブ見出しが付与される
- `costumeIllustrationHtml` のみの場合、サブ見出しなしでイラストだけが表示される
- イラストがなければ `null` またはフィールド省略

### 動画（`youtubeId` / `youtubeIds`）
- 1本 → `"youtubeId": "VIDEO_ID"`
- 2本以上 → `"youtubeIds": ["ID_1", "ID_2"]`（1本目がページ最上部のメイン動画になる）
- どちらか一方のみ使う（両方書かない）

---

## 曲を新規追加するときの手順

1. `wp-pages.json` の `songs` 配列に新しいオブジェクトを追加
2. `credits` フィールドを必ず入れる（構造化レイアウトで表示するため）
3. `youtubeId` または `youtubeIds` を設定
4. `lyrics` / `costumeHtml` / `yataiHtml` / `awardsHtml` は準備できたものから入れ、未設定は `null`

---

## 年度一覧（2026年4月時点）

| slug | タイトル | 年度 |
|------|---------|------|
| kaze | 風 | 2002 |
| kazenomichi | 風の道 | 2003 |
| omoinohanabi | 思いの花火 | 2004 |
| daichinomegumi | 大地の恵み | 2005 |
| kanade | 夢奏人 | 2006 |
| hananoniji | 花の虹 | 2007 |
| hibiki | 響 | 2008 |
| sorakakeru | 空かける雲路 | 2009 |
| enishi | 笑志(えにし) | 2010 |
| yumemina | 夢美那 | 2011 |
| kazaguruma | かざぐるま | 2012 |
| hitotsunagi | ひとつなぎ | 2013 |
| natsuyume | 夏色に心踊りて夢ひらく | 2014 |
| mangekyo | 万華鏡 | 2015 |
| osakan | 大阪人 | 2016 |
| harebare | ハレ、晴れ | 2017 |
| kokorosakunatsu | ここさく夏 | 2018 |
| sato | 郷 -Sato- | 2019 |
| marumanten | まるまんてん | 2020–2022 |
| monokuro | モノクロな朝にこの歌を | 2023 |
| soleil | Soleil | 2024 |
| tattobu | TATTOBU!!!!! | 2025 |
| gunjohyururi | 群青ひゅるり | 2026 |
