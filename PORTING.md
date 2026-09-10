# PORTING — open-english-pc

## 由来

[`open-english`](https://github.com/aon-co-jp/open-english) のクライアント
（デスクトップ／タブレット／モバイル）を本体から分離するために新設
（2026-09-10）。本体はデモ環境（`easy-web.tokyo/open-english.tokyo/demo`）と
配信サーバー `open-english-server` を持ち続ける。

## 移設チェックリスト

- [x] リポジトリ新設・モノレポ骨組み（`pc/` `tablet/` `mobile/`）
- [x] `open-english/README.md` から本リポジトリ（および releases/latest）への静的リンク
- [x] **Phase 2**: クライアント資産を `git filter-repo` で履歴付き移設（2026-09-10）
      - `web/` ← `index.html` `style.css` `app.js` `auto-update.js` `version.json`
        `manifest.json` `exam-prep-questions.json` `sw.js` `facebook.html`
        `qr-confirm.html` `vault.html` `icons/`
      - `mobile/android/` ← 本体 `android/`
      - `--allow-unrelated-histories` で骨組みへマージ、203 コミット
- [ ] **Phase 2b**: 本体 `open-english` 側を `web/` 参照へ切替
      - `.github/workflows/release.yml` の Package/cp 群
      - `installer/windows/open-english.iss` の Source パス
      - `server/src/main.rs` の静的 root 解決
      - `android/` 参照
      - 取得方法（submodule / CI clone）を決定 → 本体からコピー削除
- [ ] **Phase 3**: 「起動してメンテナンス表示中は 30 秒間隔」で `self_update` ＋
      `component_update`（関連リポジトリ全てのバージョンチェック＆自動UP）を回す拡張
      （正本ロジック: `open-english/server/src/{self_update,component_update}.rs`、
       通常時は 30 分間隔）
- [ ] pc / tablet / mobile それぞれのビルド・インストーラー構成
