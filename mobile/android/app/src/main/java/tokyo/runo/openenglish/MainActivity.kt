package tokyo.runo.openenglish

import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Button
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
 * **2026-08-11追記: `aruaru-llm`(AI応答エンジン)も同梱**。同じ
 * `ProcessBuilder`方式で`libaruarullm.so`を`127.0.0.1:4600`限定
 * (`ARUARU_LLM_BIND`環境変数)で起動する。**正直な開示(重要)**:
 * 実際の推論に必要なモデル重み(GPT-2系〈数百MB〉・multilingual-e5-
 * small埋め込みモデル〈約470MB〉)はAPKには同梱していない(著作権・
 * サイズの都合上、既存のPC版と同じくユーザー自身が別途ダウンロードする
 * 前提)——モデルが無い場合、`aruaru-llm`は既存の設計通りbag-of-words
 * フォールバックや`503`で正直にその旨を返す(黙って動くふりをしない)。
 * つまり本バージョンでは「サーバー自体が端末内で起動すること」までを
 * 実証しており、「実用的な応答品質のAI会話」はモデル重みの別途配置が
 * 前提のまま。
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
    private lateinit var downloadModelBtn: Button
    private lateinit var downloadModelStatus: TextView
    private lateinit var modelStoragePathView: TextView
    private lateinit var backupModelsBtn: Button
    private lateinit var restoreModelsBtn: Button
    private lateinit var backupModelsStatus: TextView

    private var serverProcess: Process? = null
    private var aruaruLlmProcess: Process? = null
    private val serverPort = 24601
    private val aruaruLlmPort = 4600

    companion object {
        private const val PREFS_NAME = "open_english_prefs"
        private const val GITHUB_LATEST_RELEASE_API =
            "https://api.github.com/repos/aon-co-jp/open-english/releases/latest"
        private const val GITHUB_RELEASES_PAGE =
            "https://github.com/aon-co-jp/open-english/releases"
        private const val NATIVE_BINARY_NAME = "libopenenglishserver.so"
        private const val ARUARU_LLM_BINARY_NAME = "libaruarullm.so"
        private const val WEBROOT_ASSET_DIR = "webroot"

        // 2026-08-17追加: モデル重みのダウンロード元(aruaru-llm本体が
        // 期待するのと同じ3ファイル構成〈distilgpt2〉・6ファイル構成
        // 〈multilingual-e5-small〉、既存のModelCatalog/セットアップ手順
        // で使われているのと同じHugging Faceリポジトリ)。
        private const val DISTILGPT2_BASE = "https://huggingface.co/distilbert/distilgpt2/resolve/main"
        private val DISTILGPT2_FILES = listOf("config.json", "model.safetensors", "tokenizer.json")
        private const val EMBED_MODEL_BASE = "https://huggingface.co/intfloat/multilingual-e5-small/resolve/main"
        private val EMBED_MODEL_FILES = listOf(
            "config.json", "model.safetensors", "sentencepiece.bpe.model",
            "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json",
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        webView = findViewById(R.id.web_view)
        setupPanel = findViewById(R.id.setup_panel)
        setupHelp = findViewById(R.id.setup_help)
        updateNotice = findViewById(R.id.update_notice)
        downloadModelBtn = findViewById(R.id.download_model_btn)
        downloadModelStatus = findViewById(R.id.download_model_status)
        modelStoragePathView = findViewById(R.id.model_storage_path)
        backupModelsBtn = findViewById(R.id.backup_models_btn)
        restoreModelsBtn = findViewById(R.id.restore_models_btn)
        backupModelsStatus = findViewById(R.id.backup_models_status)

        webView.settings.javaScriptEnabled = true
        webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE
        webView.settings.domStorageEnabled = true

        downloadModelBtn.setOnClickListener { downloadModelsAndRestartAruaruLlm() }
        refreshDownloadModelButtonVisibility()
        refreshModelStoragePathDisplay()
        backupModelsBtn.setOnClickListener { backupModelsToExternalStorage() }
        restoreModelsBtn.setOnClickListener { restoreModelsFromExternalStorage() }

        checkForAppUpdate()
        startEmbeddedServerAndLoad()
    }

    /**
     * 2026-08-17追加(ユーザー指示「AIモデルの重みは別途端末内ストレージへ
     * 配置する必要がある…改善して使いやすくして」への対応)。モデルが
     * 既にダウンロード済み(前回起動時にこのボタンで取得済み、または
     * ユーザーが手動配置済み)ならボタン自体を隠し、未ダウンロードの
     * 場合のみ表示する——「サーバーは端末内で起動するが実用的な応答には
     * 別途手動でのモデル配置が必要」という残っていたギャップを、
     * 手動操作(PCでダウンロードしてadb push等)ではなくアプリ内の
     * ワンタップ操作だけで解消できるようにする。
     */
    private fun refreshDownloadModelButtonVisibility() {
        val modelsRoot = File(filesDir, "aruaru-llm-models")
        val distilgpt2Ready = DISTILGPT2_FILES.all { File(modelsRoot, "distilgpt2/$it").exists() }
        val embedReady = EMBED_MODEL_FILES.all { File(modelsRoot, "multilingual-e5-small/$it").exists() }
        downloadModelBtn.visibility = if (distilgpt2Ready && embedReady) View.GONE else View.VISIBLE
    }

    private fun downloadModelsAndRestartAruaruLlm() {
        downloadModelBtn.isEnabled = false
        downloadModelStatus.visibility = View.VISIBLE
        CoroutineScope(Dispatchers.Main).launch {
            val modelsRoot = File(filesDir, "aruaru-llm-models")
            val ok = withContext(Dispatchers.IO) {
                try {
                    downloadModelFiles(DISTILGPT2_BASE, DISTILGPT2_FILES, File(modelsRoot, "distilgpt2")) { msg ->
                        runOnUiThread { downloadModelStatus.text = msg }
                    }
                    downloadModelFiles(EMBED_MODEL_BASE, EMBED_MODEL_FILES, File(modelsRoot, "multilingual-e5-small")) { msg ->
                        runOnUiThread { downloadModelStatus.text = msg }
                    }
                    true
                } catch (e: Exception) {
                    runOnUiThread {
                        downloadModelStatus.text = "ダウンロード失敗: ${e.message} / Download failed: ${e.message}"
                    }
                    false
                }
            }
            if (ok) {
                downloadModelStatus.text =
                    "ダウンロード完了。aruaru-llmを再起動しています… / Download complete. Restarting aruaru-llm…"
                // 端末内蔵のserverは変更しないため再起動不要——aruaru-llmだけを
                // 再起動し、今ダウンロードしたモデルで再ロードさせる。
                aruaruLlmProcess?.destroy()
                aruaruLlmProcess = null
                withContext(Dispatchers.IO) { launchAruaruLlmProcess() }
                downloadModelStatus.text =
                    "モデルのダウンロードとaruaru-llmの再起動が完了しました。チャットをお試しください。 / " +
                    "Model download and aruaru-llm restart complete. Try chatting now."
                refreshDownloadModelButtonVisibility()
            } else {
                downloadModelBtn.isEnabled = true
            }
        }
    }

    /**
     * 2026-08-19追加(ユーザー指示「モデル重みの保存先と同期バックアップ
     * 機能を、日英併記UIで実装して」への対応)。モデル重みの内部ストレージ
     * 保存先パス(`filesDir/aruaru-llm-models`)を常時画面へ表示する
     * ——これまでダウンロード中のステータス表示にしか現れなかった
     * パスを、常設のバイリンガル表示にする。
     */
    private fun refreshModelStoragePathDisplay() {
        val modelsRoot = File(filesDir, "aruaru-llm-models")
        modelStoragePathView.text =
            "モデル保存先(内部ストレージ): ${modelsRoot.absolutePath} / " +
            "Model storage location (internal storage): ${modelsRoot.absolutePath}"
    }

    /**
     * 2026-08-19追加。「同期バックアップ」の解釈: このアプリ自体は
     * クラウドAPIキー等を持たないため、クラウドへ直接アップロードする
     * 機能は実装しない(正直な開示)。代わりに、アプリ専用の外部ストレージ
     * 領域(`getExternalFilesDir`、権限不要でファイルマネージャからも
     * 参照可能)へモデル一式をコピーする——利用者はそこから任意の
     * クラウドストレージアプリ(Google Drive等)・USB経由で別途バックアップ
     * できる。PC版の`/v1/db/rsync-backup`(2026-08-18実装)とは異なる
     * 簡易版だが、Android単体でOS標準API(権限プロンプト無し)のみで
     * 完結する設計を優先した。
     */
    private fun backupModelsToExternalStorage() {
        val modelsRoot = File(filesDir, "aruaru-llm-models")
        if (!modelsRoot.exists()) {
            backupModelsStatus.visibility = View.VISIBLE
            backupModelsStatus.text =
                "バックアップ対象のモデルがまだありません。先にモデルをダウンロードしてください。 / " +
                "No model to back up yet. Please download the model first."
            return
        }
        val destRoot = File(getExternalFilesDir(null), "aruaru-llm-models-backup")
        backupModelsBtn.isEnabled = false
        backupModelsStatus.visibility = View.VISIBLE
        backupModelsStatus.text = "バックアップ中… / Backing up…"
        CoroutineScope(Dispatchers.Main).launch {
            val ok = withContext(Dispatchers.IO) {
                try {
                    copyDirRecursive(modelsRoot, destRoot)
                    true
                } catch (e: Exception) {
                    backupModelsStatus.text = "バックアップ失敗: ${e.message} / Backup failed: ${e.message}"
                    false
                }
            }
            if (ok) {
                backupModelsStatus.text =
                    "バックアップ完了: ${destRoot.absolutePath} (ファイルマネージャや他のアプリからコピー可能な" +
                    "アプリ専用領域です。クラウド保存はご自身でGoogleドライブ等のアプリからこのフォルダを" +
                    "アップロードしてください) / Backup complete: ${destRoot.absolutePath} " +
                    "(app-private external storage, visible to file managers; to save to the cloud, " +
                    "upload this folder yourself via Google Drive or a similar app)."
            }
            backupModelsBtn.isEnabled = true
        }
    }

    /** バックアップ先(上記)から`aruaru-llm-models`へ復元する(既存ファイルは上書き)。 */
    private fun restoreModelsFromExternalStorage() {
        val srcRoot = File(getExternalFilesDir(null), "aruaru-llm-models-backup")
        if (!srcRoot.exists()) {
            backupModelsStatus.visibility = View.VISIBLE
            backupModelsStatus.text =
                "復元元のバックアップが見つかりません(先に「バックアップ」を実行してください)。 / " +
                "No backup found to restore from (please run \"Back up\" first)."
            return
        }
        val modelsRoot = File(filesDir, "aruaru-llm-models")
        restoreModelsBtn.isEnabled = false
        backupModelsStatus.visibility = View.VISIBLE
        backupModelsStatus.text = "復元中… / Restoring…"
        CoroutineScope(Dispatchers.Main).launch {
            val ok = withContext(Dispatchers.IO) {
                try {
                    copyDirRecursive(srcRoot, modelsRoot)
                    true
                } catch (e: Exception) {
                    backupModelsStatus.text = "復元失敗: ${e.message} / Restore failed: ${e.message}"
                    false
                }
            }
            if (ok) {
                backupModelsStatus.text =
                    "復元完了。aruaru-llmを再起動しています… / Restore complete. Restarting aruaru-llm…"
                aruaruLlmProcess?.destroy()
                aruaruLlmProcess = null
                withContext(Dispatchers.IO) { launchAruaruLlmProcess() }
                refreshDownloadModelButtonVisibility()
                backupModelsStatus.text =
                    "復元とaruaru-llmの再起動が完了しました。 / Restore and aruaru-llm restart complete."
            }
            restoreModelsBtn.isEnabled = true
        }
    }

    /** ディレクトリを再帰的にコピーする(既存ファイルは上書き)。 */
    private fun copyDirRecursive(src: File, dest: File) {
        if (src.isDirectory) {
            dest.mkdirs()
            src.listFiles()?.forEach { child -> copyDirRecursive(child, File(dest, child.name)) }
        } else {
            src.inputStream().use { input -> FileOutputStream(dest).use { output -> input.copyTo(output) } }
        }
    }

    /** 指定ファイル一式を`baseUrl/<file>`から`destDir/<file>`へダウンロードする(既存ファイルはスキップ、冪等)。 */
    private fun downloadModelFiles(baseUrl: String, files: List<String>, destDir: File, onProgress: (String) -> Unit) {
        destDir.mkdirs()
        for ((index, name) in files.withIndex()) {
            val dest = File(destDir, name)
            if (dest.exists() && dest.length() > 0) continue
            onProgress("${destDir.name}: ${index + 1}/${files.size} ($name)…")
            val conn = URL("$baseUrl/$name").openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.instanceFollowRedirects = true
            if (conn.responseCode != 200) {
                conn.disconnect()
                throw java.io.IOException("HTTP ${conn.responseCode} for $name")
            }
            val tmp = File(destDir, "$name.part")
            conn.inputStream.use { input -> FileOutputStream(tmp).use { output -> input.copyTo(output) } }
            conn.disconnect()
            tmp.renameTo(dest)
        }
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
                    launchAruaruLlmProcess()
                    waitForServerReady()
                } catch (e: Exception) {
                    false
                }
            }
            if (ok) {
                webView.loadUrl("http://127.0.0.1:$serverPort/")
                webView.visibility = View.VISIBLE
                setupHelp.visibility = View.GONE
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

    private fun launchAruaruLlmProcess() {
        if (aruaruLlmProcess?.isAlive == true) return
        val binaryPath = File(applicationInfo.nativeLibraryDir, ARUARU_LLM_BINARY_NAME)
        if (!binaryPath.exists()) return // 同梱されていないビルドでも本体サーバーは動かす。
        val pb = ProcessBuilder(binaryPath.absolutePath)
        // 2026-08-17変更: libaruarullm.soを`--features real-vulkan`で
        // クロスコンパイルし直した(ユーザー指摘「スマホのGPUはPCの
        // 安くて古いGPUより高速な可能性がある」への対応——open-cuda側
        // 2026-08-15実測で、実機Adreno 619がデスクトップGT730より512×512
        // GEMMで5.99倍高速という結果が既に出ていたため)。デバイス選択
        // ロジック(aruaru-llm側main.rs)はVulkanDevice構築に失敗すれば
        // 自動でCPUへフォールバックするため、Vulkan非対応/低性能な端末
        // でも安全に動作する。環境変数での追加設定は不要(コンパイル時
        // featureのため)。
        pb.environment()["ARUARU_LLM_BIND"] = "127.0.0.1:$aruaruLlmPort"
        // モデル重み(GPT-2系・埋め込みモデル)はAPKに同梱していないため
        // (冒頭のクラスdoc参照)、実際にダウンロード済みのモデルを配置
        // する場合はこのパスへ置く想定(内部ストレージ、ユーザー自身の
        // 操作が前提——将来的な自動ダウンロード機能は未実装)。
        val modelsRoot = File(filesDir, "aruaru-llm-models")
        pb.environment()["ARUARU_LLM_MODELS_ROOT"] = modelsRoot.absolutePath
        pb.environment()["ARUARU_LLM_GPT2_DIR"] = File(modelsRoot, "distilgpt2").absolutePath
        pb.environment()["ARUARU_LLM_EMBED_MODEL_DIR"] = File(modelsRoot, "multilingual-e5-small").absolutePath
        pb.redirectErrorStream(true)
        aruaruLlmProcess = pb.start()
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
        aruaruLlmProcess?.destroy()
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
    /**
     * 2026-08-17拡張(ユーザー指示「Android自動アップデートを進めて」):
     * 従来はGitHub Releasesページへのリンク表示のみだったが、リリース
     * アセットの中からAndroid APK(ファイル名に"android"を含み".apk"で
     * 終わるもの、`open-english-android-vX.Y.Z-debug.apk`のような命名)を
     * 見つけた場合は、タップでそのAPKを自動ダウンロードし、Androidの
     * パッケージインストーラー画面を自動的に起動するところまで行う。
     * **正直な開示**: Play Store配布ではないため、OS上の制約により
     * 完全にサイレントな(ユーザー操作ゼロの)自動インストールは不可能
     * ——「不明なアプリのインストール」許可とインストーラー画面での
     * 最終確認は、Android自身のセキュリティ機構としてユーザーが行う
     * 必要がある。APKアセットが見つからない場合は、従来通りGitHub
     * Releasesページを開くだけのフォールバックに留める。
     */
    private fun checkForAppUpdate() {
        CoroutineScope(Dispatchers.Main).launch {
            val release = withContext(Dispatchers.IO) { fetchLatestRelease() } ?: return@launch
            val installed = packageManager.getPackageInfo(packageName, 0).versionName ?: return@launch
            val latestVersion = release.tag.removePrefix("v")
            if (latestVersion == installed) return@launch

            val apkUrl = release.apkAssetUrl
            if (apkUrl == null) {
                updateNotice.text =
                    "新しいバージョン ${release.tag} があります(現在: $installed)。タップして開く / " +
                        "A newer version ${release.tag} is available (current: $installed). Tap to open."
                updateNotice.visibility = View.VISIBLE
                updateNotice.setOnClickListener {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(GITHUB_RELEASES_PAGE)))
                }
                return@launch
            }

            updateNotice.text =
                "新しいバージョン ${release.tag} があります(現在: $installed)。タップして" +
                    "ダウンロード・インストール / A newer version ${release.tag} is available " +
                    "(current: $installed). Tap to download & install."
            updateNotice.visibility = View.VISIBLE
            updateNotice.setOnClickListener {
                downloadAndInstallApk(apkUrl, release.tag)
            }
        }
    }

    private fun downloadAndInstallApk(apkUrl: String, tag: String) {
        updateNotice.text = "ダウンロード中… / Downloading…"
        updateNotice.setOnClickListener(null)
        CoroutineScope(Dispatchers.Main).launch {
            val apkFile = withContext(Dispatchers.IO) { downloadApk(apkUrl, tag) }
            if (apkFile == null) {
                updateNotice.text =
                    "ダウンロードに失敗しました。タップしてリリースページを開く / " +
                        "Download failed. Tap to open the releases page."
                updateNotice.setOnClickListener {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(GITHUB_RELEASES_PAGE)))
                }
                return@launch
            }
            val apkUri = androidx.core.content.FileProvider.getUriForFile(
                this@MainActivity, "$packageName.fileprovider", apkFile,
            )
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(installIntent)
            updateNotice.visibility = View.GONE
        }
    }

    private fun downloadApk(apkUrl: String, tag: String): File? {
        return try {
            val conn = URL(apkUrl).openConnection() as HttpURLConnection
            conn.connectTimeout = 10000
            conn.readTimeout = 30000
            conn.instanceFollowRedirects = true
            if (conn.responseCode != 200) return null
            val dest = File(getExternalFilesDir(null), "open-english-$tag.apk")
            conn.inputStream.use { input ->
                FileOutputStream(dest).use { output -> input.copyTo(output) }
            }
            dest
        } catch (err: Exception) {
            null
        }
    }

    private data class LatestRelease(val tag: String, val apkAssetUrl: String?)

    private fun fetchLatestRelease(): LatestRelease? {
        return try {
            val conn = URL(GITHUB_LATEST_RELEASE_API).openConnection() as HttpURLConnection
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.requestMethod = "GET"
            if (conn.responseCode != 200) return null
            val body = conn.inputStream.bufferedReader().readText()
            val json = JSONObject(body)
            val tag = json.optString("tag_name").takeIf { it.isNotEmpty() } ?: return null
            val assets = json.optJSONArray("assets")
            var apkUrl: String? = null
            if (assets != null) {
                for (i in 0 until assets.length()) {
                    val asset = assets.getJSONObject(i)
                    val name = asset.optString("name").lowercase()
                    if (name.contains("android") && name.endsWith(".apk")) {
                        apkUrl = asset.optString("browser_download_url").takeIf { it.isNotEmpty() }
                        break
                    }
                }
            }
            LatestRelease(tag, apkUrl)
        } catch (err: Exception) {
            null
        }
    }
}
