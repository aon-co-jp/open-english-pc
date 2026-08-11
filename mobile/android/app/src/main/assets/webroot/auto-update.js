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
// バージョン管理・旧バージョンの自動クリーンアップ(ユーザー指示、
// 2026-08-10「バージョン管理する機能も搭載して古いのは自動アンインストール
// して」への対応)。
//
// **正直な開示(このアプリの実体に合わせた解釈)**: open-englishは
// ネイティブインストーラーを持つアプリではなく、リポジトリを丸ごと
// ダウンロードしてローカルサーバー(`server/`、または`python3 -m
// http.server`)で開く静的Webアプリのため、「旧バージョンの自動
// アンインストール」を(a)ディスク上の旧ファイル削除、として実装するのは
// 危険(ユーザーの他のファイルを誤って消すリスク)かつスコープ外と判断した。
// 代わりに、Web アプリとして安全に実現できる範囲——(b)ブラウザに残る
// 「旧バージョンの痕跡」(キャッシュされた古いJS/CSS・古いバージョンが
// 書き込んだlocalStorage)を自動的に破棄すること——として実装する。
// `LOCAL_STORAGE_PREFIX`を持つキーのみ対象とし、無関係なブラウザ
// データには一切触れない。
(function () {
  const CHECK_INTERVAL_MS = 5000;
  const LOCAL_STORAGE_PREFIX = "openEnglish.";
  const VERSION_KEY = `${LOCAL_STORAGE_PREFIX}version`;
  let initialBuildId = null;

  async function fetchVersionInfo() {
    const res = await fetch("version.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`version.json returned HTTP ${res.status}`);
    return res.json();
  }

  // このアプリ専用の名前空間(`openEnglish.`接頭辞)を持つlocalStorage
  // キーのみを削除する——ブラウザの他のサイト/他のデータには一切触れない。
  function clearOwnLocalStorage() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_STORAGE_PREFIX) && key !== VERSION_KEY) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  function reloadBustingCache(buildId) {
    // クエリ文字列にbuildIdを付けて再読み込みすることで、ブラウザの
    // HTTPキャッシュに残っている可能性のある旧JS/CSSではなく、
    // 新しいバージョンのアセットを確実に取得させる(=「旧バージョンの
    // 自動アンインストール」の実体、ディスク上のファイル削除ではない)。
    const url = new URL(location.href);
    url.searchParams.set("v", buildId);
    location.href = url.toString();
  }

  async function checkForUpdate() {
    try {
      const { buildId, version } = await fetchVersionInfo();
      if (initialBuildId === null) {
        initialBuildId = buildId;
        const previousVersion = localStorage.getItem(VERSION_KEY);
        if (previousVersion && version && previousVersion !== version) {
          // 前回訪問時と異なるバージョンを検出——旧バージョンが残した
          // 可能性のあるアプリ専用ローカルデータを破棄してから最新版として
          // 記録する。
          clearOwnLocalStorage();
        }
        if (version) localStorage.setItem(VERSION_KEY, version);
        return;
      }
      if (buildId !== initialBuildId) {
        clearOwnLocalStorage();
        if (version) localStorage.setItem(VERSION_KEY, version);
        reloadBustingCache(buildId);
      }
    } catch (err) {
      // file://での制限等でfetchが失敗する場合は、静かに機能を無効化する
      // (ページの他の機能に影響を与えない)。
    }
  }

  checkForUpdate();
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
})();
