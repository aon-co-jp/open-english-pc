# open-english-pc / pc

デスクトップ版クライアント（Windows / Linux / macOS）。

- 起動時＋定期チェック（GitHub Releases 参照）で自動アップデート。
  メンテナンス表示中は 30 秒間隔で、関連リポジトリ全てのバージョンチェックと
  自動アップグレードを行う（`open-english/server/src/self_update.rs` ＋
  `component_update.rs` の拡張、Phase 3）。
- Windows: 新インストーラー実行で旧版を自動アンインストール。
- Linux / macOS: 実行中バイナリのインプレース置換。

移設作業中（`open-english` 本体から移動予定の資産: `index.html` / `app.js` /
`style.css` / `manifest.json` / `auto-update.js` / `version.json`）。
