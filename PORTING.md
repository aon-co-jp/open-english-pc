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
      - Windows Inno Setup ビルドも検証済み（2026-09-11、v0.8.2）: CI success、
        `open-english-installer.exe` を開発機でサイレントインストール →
        `client/web/` 由来の全 14 ファイル（従来 .iss 同梱漏れの sw.js /
        *.html / world-language-*.json 含む）＋ icons/ が配置、自動起動した
        サーバーが :4601 で全静的パス 200・version.json 0.8.2 を確認
- [x] **Phase 3**（2026-09-10、open-english `060378b`、v0.8.1 で配布）:
      定期ループを2フェーズ化。(1) 起動直後のメンテナンス表示中は **30 秒間隔**で
      `self_update` ＋ `component_update::check_and_apply_all()`（本体＋
      aruaru-llm＋aruaru-db）、最大 `OPEN_ENGLISH_MAINTENANCE_FAST_TICKS` 回
      （既定 6＝約3分、0 で無効）。(2) 以降 30 分間隔。VPS で起動＋30 秒後の
      `maintenance-window update check (1/6, every 30s)` ログ発火を E2E 確認
- [x] pc / tablet / mobile それぞれのビルド・インストーラー構成（完了 2026-09-11）
      - [x] 共通ビルド基盤の設計 `BUILD.md`（web/ と web/version.json を単一の正本、
            差分はパッケージングのみ、リリースは open-english の vX.Y.Z タグ1系統）
      - [x] Android: 単一 Gradle プロジェクトを product flavor `phone` / `tablet` に分割
            （tablet は applicationId `.tablet` サフィックス）、versionName を
            web/version.json から自動取得
      - [x] `open-english/.github/workflows/release.yml` に `build-android` ジョブ
            （Release 署名鍵があれば `assemblePhoneRelease`/`assembleTabletRelease`、
            無ければ `assemblePhoneDebug`/`assembleTabletDebug` にフォールバック）
      - [x] **Android リリース署名鍵**を生成し `aon-co-jp/open-english` の Actions
            シークレット（`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` /
            `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`）に登録。alias
            `open-english-release`、RSA 4096、有効期限 30 年（2056-09 まで）。
            `.jks` 本体とパスワードはユーザーへ送付済み（CI 側はファイルを保持しない）。
            `workflow_dispatch` で `assemble*Release` 実走・success、生成 APK に
            APK Signing Block v2/v3 が存在することをバイナリ解析で確認
      - [x] **`tablet` flavor のレイアウト最適化**: `app/src/tablet/res/layout/
            activity_main.xml` を新設。操作パネルを中央寄せ 600dp 幅カラムへ
            （600dp 未満では実質全幅）。ID・要素は phone 版と完全一致、
            `MainActivity.kt`（`findViewById` のみに依存）はそのまま両 flavor で共用
      - [x] **`pc/` のデスクトップ固有補助**: 検討の結果、追加の構成は不要と判断。
            デスクトップの実体は `open-english` 本体の `open-english-server` ＋
            `client/web/`（Phase 2b で完了済み）であり、`open-english-pc/pc/` 側に
            重複したビルド設定を持たせる理由がない（`BUILD.md` の pc/ 節に明記）。
            具体的な要件が出た時点で追加する
