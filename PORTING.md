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
- [x] **Phase 2b**（2026-09-10）: 本体 `open-english` を submodule `client/`
      （= このリポジトリ）参照へ切替
      - `.gitmodules`: `client` → `open-english-pc`（shallow）
      - `server/src/main.rs`: 起動時に `client/web/` を配信ルートへミラーする
        `sync_client_from_submodule()` を追加。インストール済みコピーでは no-op
      - ルート直下のクライアントファイルを untrack + `.gitignore`
      - `.github/workflows/release.yml`: `submodules: recursive` ＋
        `client/web/` から同梱
      - `installer/windows/open-english.iss`: `Source` を `..\..\client\web\` へ
        （従来同梱漏れの `sw.js` / `*.html` / `world-language-*.json` も追加）
      - **バージョンの正本は `web/version.json`**（現在 0.8.1）。リリース時は
        ここを bump → コミット → 本体で `git add client` → 本体で `vX.Y.Z` タグ
      - 検証: 本体 `cargo build --release` OK、開発機＋VPS(:8104/:8107)で
        `client sync: mirrored 15 entries` ＋ 主要静的パス 200 を E2E 確認
      - 未検証: Windows Inno Setup ビルド（開発機で不可、パス変更は機械的）
- [x] **Phase 3**（2026-09-10、open-english `060378b`、v0.8.1 で配布）:
      定期ループを2フェーズ化。(1) 起動直後のメンテナンス表示中は **30 秒間隔**で
      `self_update` ＋ `component_update::check_and_apply_all()`（本体＋
      aruaru-llm＋aruaru-db）、最大 `OPEN_ENGLISH_MAINTENANCE_FAST_TICKS` 回
      （既定 6＝約3分、0 で無効）。(2) 以降 30 分間隔。VPS で起動＋30 秒後の
      `maintenance-window update check (1/6, every 30s)` ログ発火を E2E 確認
- [~] pc / tablet / mobile それぞれのビルド・インストーラー構成（進行中）
      - [x] 共通ビルド基盤の設計 `BUILD.md`（web/ と web/version.json を単一の正本、
            差分はパッケージングのみ、リリースは open-english の vX.Y.Z タグ1系統）
      - [x] Android: 単一 Gradle プロジェクトを product flavor `phone` / `tablet` に分割
            （tablet は applicationId `.tablet` サフィックス）、versionName を
            web/version.json から自動取得
      - [x] `open-english/.github/workflows/release.yml` に `build-android` ジョブ
            （`assemblePhoneDebug` / `assembleTabletDebug` → Release へ APK 添付）。
            workflow_dispatch で実走・success、phone/tablet 2 APK 生成を確認（2026-09-11）
      - [ ] Android リリース署名鍵（`ANDROID_KEYSTORE_*` シークレット）→ `assemble*Release`
      - [ ] `tablet` flavor のレイアウト最適化（`layout-sw600dp` 等）
      - [ ] `pc/` のデスクトップ固有補助（必要になれば）
