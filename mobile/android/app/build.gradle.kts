plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "tokyo.runo.openenglish"
    compileSdk = 35

    defaultConfig {
        applicationId = "tokyo.runo.openenglish"
        minSdk = 24
        targetSdk = 35
        // versionCode/versionNameは`../../version.json`の`version`と
        // 手動で同期させること(自動ビルドパイプラインは無い、
        // `CLAUDE.md`のバージョン管理節参照)。
        versionCode = 11
        versionName = "0.6.8"
        // 2026-08-11追加: 単体動作版(PC/Linux WEBサーバー不要)への対応。
        // 実機のスマホ/タブレットはarm64-v8aが主流、x86_64はエミュレータ
        // 検証用(open-web-server/dream-osの既存パターンと同じ)。
        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    // ネイティブライブラリ(open-english-server)をProcessBuilderで実
    // ファイルパスとして起動する必要があるため、旧来通りインストール時に
    // nativeLibraryDir配下へ展開される動作を明示的に強制する
    // (open-web-server/dream-os Android版と同じ既知の対処)。
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // 2026-08-19追加(ユーザー指示「NNAPI経由でNPU/GPUへ軽量な数値計算を
    // オフロードする最小実装を試みる」への対応、`PhoneAccelWorker.kt`
    // 参照)。TensorFlow Lite + NNAPI Delegateのみを追加(フルの
    // TensorFlow本体は含まない、モデルは同梱していない——ベクトル内積/
    // コサイン類似度程度の軽量計算をNNAPI経由で試すための最小依存)。
    // ビルドが通らない・実機でNNAPIが使えない場合は、コード側が
    // 自動的にCPU(Kotlin標準FloatArray計算)へフォールバックする設計
    // (`PhoneAccelWorker.kt`のコメント参照、NPU活用を偽らない)。
    implementation("org.tensorflow:tensorflow-lite:2.16.1")
    // NnApiDelegateクラス自体は`tensorflow-lite`本体に含まれるため
    // `tensorflow-lite-support`は不要(重複namespace警告を避けるため
    // 追加しなかった)。
}
