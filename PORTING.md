# PORTING — open-english-pc

## 由来

[`open-english`](https://github.com/aon-co-jp/open-english) のクライアント
（デスクトップ／タブレット／モバイル）を本体から分離するために新設
（2026-09-10）。本体はデモ環境（`easy-web.tokyo/open-english.tokyo/demo`）と
配信サーバー `open-english-server` を持ち続ける。

## 移設チェックリスト

- [x] リポジトリ新設・モノレポ骨組み（`pc/` `tablet/` `mobile/`）
- [x] `open-english/README.md` から本リポジトリ（および releases/latest）への静的リンク
- [ ] Phase 2: クライアント資産を `git` 履歴付きで移設
      （`index.html` `app.js` `style.css` `manifest.json` `auto-update.js`
       `version.json` `android/`）
- [ ] Phase 2: 移設後の本体側デモ配信の取得方法を決定（submodule / CI 取得）
- [ ] Phase 3: 「メンテナンス表示中は 30 秒間隔」で `self_update` ＋
      `component_update`（関連リポジトリ全てのバージョンチェック＆自動UP）を回す拡張
- [ ] pc / tablet / mobile それぞれのビルド・インストーラー構成
