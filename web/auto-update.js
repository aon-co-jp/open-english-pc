// 自動更新チェック(ユーザー指示、2026-08-10「ここも自動UPDATEされる
// 機能を搭載して」)。
//
// 正直な開示: この機能は `version.json` を定期的に fetch() して、
// 開いた時点の値と食い違ったら自動でページを再読み込みする、という
// 単純なポーリング方式。コード変更を検知したら、このリポジトリの
// `version.json` の `buildId` を手動で更新すること(自動ビルド
// パイプラインは無いため、更新を反映させる側の責任で値を書き換える
// 運用)。
//
// **既知の制限**: `file://` で直接HTMLファイルを開いた場合、Chrome等の
// 一部ブラウザはローカルファイルへの `fetch()` をセキュリティ上の理由
// (CORS相当の制約)でブロックすることがある——その場合はこの機能は
// 単に何もしない(エラーを握りつぶして黙って無効化される、ページの
// 動作自体は妨げない)。確実に動かすには、`python3 -m http.server` 等の
// 簡易ローカルサーバー経由で `http://localhost:8090/` のように開くこと
// (`launchers/mobile/README.md` に同じ手順を記載済み)。
(function () {
  const CHECK_INTERVAL_MS = 5000;
  let initialBuildId = null;

  async function fetchBuildId() {
    const res = await fetch("version.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`version.json returned HTTP ${res.status}`);
    const data = await res.json();
    return data.buildId;
  }

  async function checkForUpdate() {
    try {
      const buildId = await fetchBuildId();
      if (initialBuildId === null) {
        initialBuildId = buildId;
        return;
      }
      if (buildId !== initialBuildId) {
        location.reload();
      }
    } catch (err) {
      // file://での制限等でfetchが失敗する場合は、静かに機能を無効化する
      // (ページの他の機能に影響を与えない)。
    }
  }

  checkForUpdate();
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
})();
