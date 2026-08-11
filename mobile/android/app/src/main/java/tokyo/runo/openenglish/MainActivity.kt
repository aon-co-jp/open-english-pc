package tokyo.runo.openenglish

import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * open-englishのAndroid単体動作版(2026-08-11、ユーザー指示「PCやLinux
 * のWEBサーバーを必要としない設計で単体で動作する設計」への対応)。
 *
 * 従来版(2026-08-11以前)はPC上で起動済みの`server/`へ同一Wi-Fi経由で
 * 接続する薄いクライアントだった。本バージョンでは、クロスコンパイル済み
 * の`open-english-server`ネイティブ実行ファイル(`jniLibs/<abi>/
 * libopenenglishserver.so`として同梱、`open-web-server`Android版と同じ
 * Termux方式)を`ProcessBuilder`で端末上に直接起動し、静的アセット
 * (`assets/webroot/`に同梱)をアプリの内部ストレージへ展開してから
 * `OPEN_ENGLISH_SERVER_ROOT`環境変数でそのパスを渡す。WebViewは
 * `http://127.0.0.1:<port>/`(端末内で完結、外部ネットワーク不要)を
 * 読み込む。
 *
 * **正直な開示**: 内蔵サーバー自体の自動アップデート(`self_update.rs`)は
 * Windows専用のインストーラー差し替え方式のままであり、Android上では
 * (Windows向けアセットが無いため)何もしない設計のまま——アプリ自体の
 * 更新はAndroid標準のAPK配布(下記`checkForAppUpdate`、GitHub Releases
 * ページへのリンク表示のみ、Play Store配布ではないためサイレント
 * 自動更新はできない)に委ねる。
 */
class MainActivity : AppCompatActivity() {
    private lateinit var prefs: SharedPreferences
    private lateinit var webView: WebView
    private lateinit var setupPanel: View
    private lateinit var setupHelp: TextView
    private lateinit var updateNotice: TextView

    private var serverProcess: Process? = null
    private val serverPort = 24601

    companion object {
        private const val PREFS_NAME = "open_english_prefs"
        private const val GITHUB_LATEST_RELEASE_API =
            "https://api.github.com/repos/aon-co-jp/open-english/releases/latest"
        private const val GITHUB_RELEASES_PAGE =
            "https://github.com/aon-co-jp/open-english/releases"
        private const val NATIVE_BINARY_NAME = "libopenenglishserver.so"
        private const val WEBROOT_ASSET_DIR = "webroot"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        webView = findViewById(R.id.web_view)
        setupPanel = findViewById(R.id.setup_panel)
        setupHelp = findViewById(R.id.setup_help)
        updateNotice = findViewById(R.id.update_notice)

        webView.settings.javaScriptEnabled = true
        webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE
        webView.settings.domStorageEnabled = true

        checkForAppUpdate()
        startEmbeddedServerAndLoad()
    }

    /**
     * 静的アセットを内部ストレージへ展開(初回・バージョン変更時のみ)
     * → 内蔵サーバーを起動 → `/healthz`相当(トップページ)への到達を
     * 確認できたらWebViewへ切り替える、という一連の流れ。
     */
    private fun startEmbeddedServerAndLoad() {
        CoroutineScope(Dispatchers.Main).launch {
            setupHelp.text = getString(R.string.starting_server)
            val ok = withContext(Dispatchers.IO) {
                try {
                    extractWebrootAssets()
                    launchServerProcess()
                    waitForServerReady()
                } catch (e: Exception) {
                    false
                }
            }
            if (ok) {
                webView.loadUrl("http://127.0.0.1:$serverPort/")
                webView.visibility = View.VISIBLE
                setupPanel.visibility = View.GONE
            } else {
                setupHelp.text = getString(R.string.server_start_failed)
            }
        }
    }

    private fun extractWebrootAssets() {
        val webroot = File(filesDir, WEBROOT_ASSET_DIR)
        webroot.mkdirs()
        copyAssetDir(WEBROOT_ASSET_DIR, webroot)
    }

    private fun copyAssetDir(assetPath: String, destDir: File) {
        val entries = assets.list(assetPath) ?: return
        if (entries.isEmpty()) {
            // ディレクトリではなくファイルそのもの。
            assets.open(assetPath).use { input ->
                FileOutputStream(File(destDir.parentFile, destDir.name)).use { output ->
                    input.copyTo(output)
                }
            }
            return
        }
        destDir.mkdirs()
        for (entry in entries) {
            val childAssetPath = "$assetPath/$entry"
            val childEntries = assets.list(childAssetPath)
            if (childEntries != null && childEntries.isNotEmpty()) {
                copyAssetDir(childAssetPath, File(destDir, entry))
            } else {
                assets.open(childAssetPath).use { input ->
                    FileOutputStream(File(destDir, entry)).use { output ->
                        input.copyTo(output)
                    }
                }
            }
        }
    }

    private fun launchServerProcess() {
        if (serverProcess?.isAlive == true) return
        val binaryPath = File(applicationInfo.nativeLibraryDir, NATIVE_BINARY_NAME).absolutePath
        val webroot = File(filesDir, WEBROOT_ASSET_DIR).absolutePath
        val pb = ProcessBuilder(binaryPath)
        pb.environment()["OPEN_ENGLISH_SERVER_BIND"] = "127.0.0.1:$serverPort"
        pb.environment()["OPEN_ENGLISH_SERVER_ROOT"] = webroot
        pb.redirectErrorStream(true)
        serverProcess = pb.start()
    }

    private suspend fun waitForServerReady(): Boolean {
        repeat(30) {
            try {
                val conn = URL("http://127.0.0.1:$serverPort/").openConnection() as HttpURLConnection
                conn.connectTimeout = 500
                conn.readTimeout = 500
                if (conn.responseCode == 200) return true
            } catch (e: Exception) {
                // まだ起動中——リトライする。
            }
            delay(300)
        }
        return false
    }

    override fun onDestroy() {
        super.onDestroy()
        serverProcess?.destroy()
    }

    override fun onBackPressed() {
        if (webView.visibility == View.VISIBLE && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    /**
     * バージョン管理機能。このアプリ自体はストア配布ではないため
     * 自動更新できない——正直な開示として、GitHub Releasesの最新タグと
     * 現在のversionNameを比較し、新しいバージョンがあればリンク付きで
     * 通知するのみに留める。
     */
    private fun checkForAppUpdate() {
        CoroutineScope(Dispatchers.Main).launch {
            val latestTag = withContext(Dispatchers.IO) { fetchLatestReleaseTag() } ?: return@launch
            val installed = packageManager.getPackageInfo(packageName, 0).versionName ?: return@launch
            val latestVersion = latestTag.removePrefix("v")
            if (latestVersion != installed) {
                updateNotice.text =
                    "新しいバージョン $latestTag があります(現在: $installed)。タップして開く / " +
                        "A newer version $latestTag is available (current: $installed). Tap to open."
                updateNotice.visibility = View.VISIBLE
                updateNotice.setOnClickListener {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(GITHUB_RELEASES_PAGE)))
                }
            }
        }
    }

    private fun fetchLatestReleaseTag(): String? {
        return try {
            val conn = URL(GITHUB_LATEST_RELEASE_API).openConnection() as HttpURLConnection
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.requestMethod = "GET"
            if (conn.responseCode != 200) return null
            val body = conn.inputStream.bufferedReader().readText()
            JSONObject(body).optString("tag_name").takeIf { it.isNotEmpty() }
        } catch (err: Exception) {
            null
        }
    }
}
