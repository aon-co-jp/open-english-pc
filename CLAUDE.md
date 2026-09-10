# 開発方針＆開発環境ルール（open-english-pc）

開発方針・開発環境ルールの**正本**は
[`open-raid-z`](https://github.com/aon-co-jp/open-raid-z) の `CLAUDE.md`
（確認不要の自動継続／リミット解除後の自動再開・白画面バグ等を見逃さない
検証徹底・参照資料一覧など、全リポジトリ共通ルールはそちらを参照）。

## このリポジトリの役割

[`open-english`](https://github.com/aon-co-jp/open-english) の**クライアント**
（デスクトップ／タブレット／モバイル）を、本体（共有デモ環境＋配信サーバー
`open-english-server`）から分離して集約するモノレポ。

- `pc/` … Windows / Linux / macOS デスクトップ版
- `tablet/` … タブレット版
- `mobile/` … モバイル版

## 移設状況（HANDOFF）

- **2026-09-10 リポジトリ新設**: `aon-co-jp/open-english-pc` を作成（public、
  デフォルトブランチ `main`）。モノレポ骨組み（`pc/` `tablet/` `mobile/` +
  各 README）を配置。
  - **Phase 2（未）**: `open-english` から `index.html` / `app.js` / `style.css` /
    `manifest.json` / `auto-update.js` / `version.json` / `android/` 等の
    クライアント資産を、`pc/` `tablet/` `mobile/` へ `git` 履歴を保って移設。
    移設後、`open-english` 本体はデモ／サーバー配信用のコピーをどう保つか
    （このリポジトリを submodule 参照 or CI で取得）を決める。
  - **Phase 3（未）**: 「起動してメンテナンス表示中は 30 秒間隔」で
    `self_update` ＋ `component_update`（**関連リポジトリ全て**のバージョン
    チェックと自動アップグレード）を回す拡張。正本ロジックは
    `open-english/server/src/self_update.rs` ／ `component_update.rs`。
    通常時の定期チェックは 30 分（`open-english` 側で 2026-09-09 に 6h→30m 済み）。

## GitHub organization

https://github.com/aon-co-jp
