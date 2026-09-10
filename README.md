# open-english-pc

[`open-english`](https://github.com/aon-co-jp/open-english) の**クライアント**を
本体（デモ／配信サーバー）から分離して置くモノレポ。

| ディレクトリ | 対象 | 状態 |
|---|---|---|
| [`pc/`](pc/) | デスクトップ版（Windows / Linux / macOS） | 移設作業中 |
| [`tablet/`](tablet/) | タブレット版 | 移設作業中 |
| [`mobile/`](mobile/) | モバイル版 | 移設作業中 |

## 位置づけ

- `open-english` 本体リポジトリは、共有デモ環境（`easy-web.tokyo/open-english.tokyo/demo`、
  Google 等 API KEY 設定・メンテナンス用）と配信サーバー（`open-english-server`）を持つ。
- `/demo` からダウンロードしてインストールすると、ローカル PC 上で動く
  `easy-web.tokyo/open-english-pc` 相当のアプリになる。その**クライアント実装**を
  このリポジトリへ集約する。
- 自動アップデート（起動時＋定期チェック、GitHub Releases を参照して
  「旧版アンインストール→新版インストール」／実行中バイナリのインプレース置換、
  関連リポジトリの一括バージョンチェック）は `open-english` 本体の
  `server/src/self_update.rs` ／ `server/src/component_update.rs` の仕組みを拡張して
  pc / tablet / mobile へ展開する。

## 開発方針

開発方針・開発環境ルールの正本は
[`open-raid-z/CLAUDE.md`](https://github.com/aon-co-jp/open-raid-z)。
本リポジトリ固有の事項は [`CLAUDE.md`](CLAUDE.md) を参照。

## 最新リリース

https://github.com/aon-co-jp/open-english-pc/releases/latest

---

*English*: Monorepo that holds the **client** side of
[`open-english`](https://github.com/aon-co-jp/open-english) (desktop for
Windows/Linux/macOS under `pc/`, plus `tablet/` and `mobile/`), split out of the
main repo which keeps the shared demo and the distribution server. Auto-update
(startup + periodic check against GitHub Releases, uninstall-old→install-new /
in-place binary replace, bulk version check of related repos) reuses and extends
`open-english`'s `server/src/self_update.rs` and `server/src/component_update.rs`.
Migration in progress.
