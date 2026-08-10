package tokyo.runo.openenglish

import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * open-englishの静的フロントエンド(index.html等)をWebViewで表示する
 * 薄いクライアント。ネイティブバイナリ(aruaru-llm/server)は同梱しない
 * ——PC上で起動済みの`server/`(既定4601番ポート)へ同一Wi-Fi経由で
 * 接続する構成(`aruaru-llm/android`と同じ設計思想)。
 *
 * ユーザー指示「aruaru-llmなど関連もコマンドでインストールは大変です、
 * 特にスマホでは、なんとかして」への対応: スマホ側はPCのIPアドレスを
 * 一度入力するだけでよく、コマンド操作は一切不要(PC側の1回だけの
 * インストーラー実行で完結する)。
 */
class MainActivity : AppCompatActivity() {
    private lateinit var prefs: SharedPreferences
    private lateinit var urlInput: EditText
    private lateinit var webView: WebView
    private lateinit var setupPanel: View
    private lateinit var updateNotice: TextView

    companion object {
        private const val PREFS_NAME = "open_english_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val GITHUB_LATEST_RELEASE_API =
            "https://api.github.com/repos/aon-co-jp/open-english/releases/latest"
        private const val GITHUB_RELEASES_PAGE =
            "https://github.com/aon-co-jp/open-english/releases"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        urlInput = findViewById(R.id.server_url_input)
        webView = findViewById(R.id.web_view)
        setupPanel = findViewById(R.id.setup_panel)
        updateNotice = findViewById(R.id.update_notice)

        prefs.getString(KEY_SERVER_URL, null)?.let { urlInput.setText(it) }

        webView.settings.javaScriptEnabled = true
        webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE
        webView.settings.domStorageEnabled = true

        findViewById<Button>(R.id.connect_button).setOnClickListener {
            connect()
        }

        checkForAppUpdate()
    }

    private fun connect() {
        var url = urlInput.text.toString().trim()
        if (url.isEmpty()) return
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://$url"
        }
        prefs.edit().putString(KEY_SERVER_URL, url).apply()
        webView.loadUrl(url)
        webView.visibility = View.VISIBLE
        setupPanel.visibility = View.GONE
    }

    override fun onBackPressed() {
        // WebView表示中は、ページ内の戻り履歴を先に消費する(接続設定画面へ
        // 突然戻って混乱させないための配慮)。
        if (webView.visibility == View.VISIBLE && webView.canGoBack()) {
            webView.goBack()
        } else if (webView.visibility == View.VISIBLE) {
            webView.visibility = View.GONE
            setupPanel.visibility = View.VISIBLE
        } else {
            super.onBackPressed()
        }
    }

    /**
     * バージョン管理機能(ユーザー指示「バージョン管理機能も付けて」)。
     * このアプリ自体はストア配布ではないため自動更新できない——正直な
     * 開示として、GitHub Releasesの最新タグと現在のversionNameを比較し、
     * 新しいバージョンがあればリンク付きで通知するのみに留める
     * (アンインストール自体はAndroid OS標準の機能〈設定→アプリ→
     * アンインストール〉が既に提供しており、本アプリ側での再実装は
     * 不要と判断)。
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
            // オフライン・GitHub API到達不能等——更新チェックは失敗しても
            // アプリ本体の動作(WebView接続)には影響させない。
            null
        }
    }
}
