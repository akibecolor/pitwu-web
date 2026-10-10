# pitwu-web — 作業ルール

よさこいチーム「夢源風人」の公式サイト（https://pitwu.com）。Astro（SSG）+ microCMS + Cloudflare Pages。
始め方は `docs/setup.md`、環境の全体像は `docs/environments.md`。

## 構成図・環境ドキュメントを実態に合わせ続ける

`docs/environments.md`（システム構成図・設定値の置き場所・既知の問題）は、チームが環境を理解する唯一の資料。
次のどれかに当たる変更では、**同じ PR で** `docs/environments.md` の図と表を直し、冒頭の「最終確認日」を更新する。

- `.github/workflows/`（デプロイの流れ・トリガー・ブランチ）
- `functions/`（Pages Functions の追加・削除、外部サービスとのつながり）
- `workers/`（Worker の追加・削除、secret の追加）
- 環境変数・secret の追加／削除／置き場所の変更（`.env.example` も合わせて直す）
- 外部サービスの追加・切替（microCMS、Google、Apps Script など）
- Cloudflare / GitHub の設定変更（ドメイン、Access、ルールセットなど。コード外の変更でも docs は直す）

図中の `#番号` は対応待ちの issue。issue を閉じるときは図からも外す。

## このリポジトリは公開されている

- シークレット値、Worker の URL、個人のメールアドレスを docs・issue・コミットに書かない
- メンバー向けの内容（会報など）はこのサイトに置かない（pitwu-app の管轄）

## ブランチ

- `main` = 本番、`staging` = ステージング。`main` はルールセットで保護（PR + 承認1件）
- 普段は `feature/*` → `staging` → `main`。`staging` → `main` は merge commit でマージする（squash だと履歴がずれる）
- push 前に `npm run check && npm run lint && npm test`
