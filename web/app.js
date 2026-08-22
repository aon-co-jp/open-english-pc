// open-english フロントエンド(Phase 0)。
//
// 正直な開示: `aruaru-llm`の`/v1/generate`は対話特化のファインチューニング
// を受けていない素のGPT-2であり、応答品質・レベル遵守は保証されない。
// このスクリプトはそれを誠実に開示した上で、実際にaruaru-llmへ接続する。

const levelInstructions = {
  "super-beginner": "Use only very simple words and short sentences.",
  beginner: "Use simple vocabulary and short sentences.",
  intermediate: "Use natural, everyday English.",
  native: "Use rich vocabulary, idioms, and native-level sentence structures.",
};

// 年齢層別の言葉づかい調整(ユーザー指示「保育園児、幼稚園児、小学生、
// 中学生、高校生、大学生などのどれか一つ選択」への対応)。学習内容自体を
// 差し替えるのではなく、プロンプトへの指示文で語彙・話題の難度を調整する
// 簡易的な仕組み(GPT-2系は指示追従が保証されないため、確実な遵守を主張
// しない、既存の`levelInstructions`と同じ「正直な開示」方針)。
const ageGroupInstructions = {
  infant: "The student is an infant/toddler (under nursery age). Use extremely short, gentle, sing-song words and lots of repetition, as if talking to a very young child.",
  nursery: "The student is a nursery-age child (around 2-3 years old). Use extremely simple, friendly, playful words.",
  kindergarten: "The student is a kindergarten-age child (around 4-6 years old). Use simple, friendly, playful words.",
  elementary: "The student is an elementary school student. Use simple, clear words and short sentences.",
  "junior-high": "The student is a junior high school student. Use clear, everyday words.",
  "high-school": "The student is a high school student. Use natural, everyday English.",
  university: "The student is a university student or adult. Natural, everyday English is fine.",
  "working-adult": "The student is a working adult. Use natural, professional, everyday English.",
  senior: "The student is a senior adult. Use clear, natural English at a comfortable, unhurried pace.",
};

// ビジネス英会話の追加選択(ユーザー指示「もう一つ複数選択でビジネス
// 英会話も追加選択可能」への対応、他の年齢層/レベル選択とは独立した
// チェックボックスとして併用できる)。
const BUSINESS_ENGLISH_INSTRUCTION =
  "Also weave in some polite business English phrases (greetings, meetings, email requests) suitable for a workplace context.";

const langInstructions = {
  en: "Reply only in English.",
  ja: "日本語のみで返答してください(Reply only in Japanese).",
  hybrid: "Reply with a short mix of English and Japanese in the same message (e.g. give the English sentence, then a brief Japanese translation or note), to help the student learn both.",
};

// 学びたい言語の方向(ユーザー指示「英会話か日本語会話か学びたい言語を
// 選べるようにして」への対応)。従来は常に「英語トレーナー」固定だった
// プロンプトの役割部分を、選択に応じて入れ替える。`reply-lang`
// (応答言語の混在方針)とは独立した軸——こちらは「主に何を教える
// トレーナーか」を決める。
const trainerRoleByTarget = {
  english: "You are a friendly English conversation trainer at a maid cafe.",
  japanese: "You are a friendly Japanese conversation trainer at a maid cafe, helping the student practice speaking Japanese.",
};
const learnTargetEl = document.getElementById("learn-target");

// バージョン表示(ユーザー指示「バージョン管理する機能も搭載して」)。
// `version.json`の`version`(セマンティックバージョン)をフッターへ表示する。
(async function showAppVersion() {
  const label = document.getElementById("app-version-label");
  if (!label) return;
  try {
    const res = await fetch("version.json", { cache: "no-store" });
    const data = await res.json();
    label.textContent = data.version ? `v${data.version}` : "";
  } catch (err) {
    label.textContent = "";
  }
})();

// メンテナンス中バナー(ユーザー指示「open-englishを起動中に2分間、
// ただいまメンテナンス中です。2分ほどお待ち下さいと日本語と英語で
// 表示して」、後日「メンテナンスは毎回一分にしよう」の指示で1分に短縮)。
// バックエンド(aruaru-db)側の地理・観光データseed投入・ウォームアップ
// 処理と時間的に対応させる目的の簡易実装——実際のseed完了通知を待つ
// のではなく、固定60秒のカウントダウン表示に留める(正直な開示:
// バックエンド側の実処理時間と厳密には連動しない)。ページを開く/
// 再読み込みするたびに毎回表示される仕様(ユーザー指示通り)。
(function showMaintenanceBanner() {
  const banner = document.getElementById("maintenance-banner");
  const countdownEl = document.getElementById("maintenance-countdown");
  if (!banner || !countdownEl) return;
  banner.classList.remove("hidden");
  // メンテナンス中の待ち時間を使い、サーバー接続国のニュースを収集
  // しておく(ユーザー指示、2026-08-17「メンテナンス時にその人のIPアドレス
  // からその国のインターネットニュースを読んで情報収集、分析してDATABASE化
  // して、話題についていけるように努力して」への対応、`aruaru-llm`側
  // `POST /v1/news/refresh`、詳細はnews_geo.rs参照)。失敗しても
  // メンテナンスバナー自体やチャット機能には影響しない(既存の
  // referralsSuffix等と同じ「サービスを止めない」設計)。
  // `apiBaseEl`はこのIIFEより後の行で定義されるため(スクリプト先頭付近に
  // 移すとファイル全体の構成が崩れる)、`setTimeout`で次のマクロタスクへ
  // 遅らせて初期化完了後に呼び出す(実ブラウザで発覚した`ReferenceError:
  // Cannot access 'apiBaseEl' before initialization`の修正)。
  setTimeout(() => {
    fetch(`${apiBaseEl.value.trim()}/v1/news/refresh`, { method: "POST" }).catch(() => {});
  }, 0);
  let remaining = 60;
  const timer = setInterval(() => {
    remaining -= 1;
    countdownEl.textContent = String(Math.max(remaining, 0));
    if (remaining <= 0) {
      clearInterval(timer);
      banner.classList.add("hidden");
    }
  }, 1000);
})();

// AI/検索プロバイダの無料枠情報バナー(ユーザー指示「それらの無料枠に
// ついては、メンテナンス時に情報を得て、open-englishの上の方に表示して」
// への対応)。各社の無料枠は変更されやすく、機械可読なAPIで正確な残り
// 回数を常時取得する仕組みは一般に存在しないため、ここでは「開発者が
// 定期メンテナンス時に手動で確認・更新する」`provider-free-tiers.json`を
// 読み込んで表示するのみに留める(正直な開示、誇張しない)。
(async function showProviderFreeTiers() {
  const banner = document.getElementById("free-tier-banner");
  const toggle = document.getElementById("free-tier-toggle");
  const body = document.getElementById("free-tier-body");
  const list = document.getElementById("free-tier-list");
  const updatedEl = document.getElementById("free-tier-last-updated");
  if (!banner || !toggle || !body || !list || !updatedEl) return;
  try {
    const res = await fetch("provider-free-tiers.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const providers = Array.isArray(data.providers) ? data.providers : [];
    if (providers.length === 0) return;
    list.innerHTML = "";
    for (const p of providers) {
      const li = document.createElement("li");
      const nameEn = p.name_en || p.id || "";
      const nameJa = p.name_ja || "";
      const tierEn = p.free_tier_en || "(no data / 情報なし)";
      const tierJa = p.free_tier_ja || "(情報なし)";
      // 外部/JSON由来のテキストのためtextContentのみで組み立てる(XSS回避)。
      const strong = document.createElement("strong");
      strong.textContent = `${nameEn} / ${nameJa}: `;
      li.appendChild(strong);
      const span = document.createElement("span");
      span.textContent = `${tierEn} / ${tierJa}`;
      li.appendChild(span);
      list.appendChild(li);
    }
    updatedEl.textContent = data.last_updated || "?";
    banner.classList.remove("hidden");
    toggle.addEventListener("click", () => {
      body.classList.toggle("hidden");
    });
  } catch (err) {
    // 読み込めなくても他の機能には影響させない(既存の可用性優先方針)。
  }
})();

// 1日の利用回数制限(ユーザー指示「検索や質問などで1日の利用回数制限を
// 超えた場合に、有料版切替の案内+他プロバイダの無料枠案内を日英併記で
// 表示して」への対応)。既存コード内を調査したが、サーバー側
// (`server/src/main.rs`・`db.rs`)にもクライアント側にも自前の「1日
// 100回まで」カウンタは実装されていなかった(index.html内の「1日100件
// まで無料」という記述はGoogle Custom Search JSON API自体の無料枠に
// ついての説明であり、open-english自身の利用回数制限ではない)。その
// ため、ここで`localStorage`ベースの簡易日次カウンタを新規実装する。
// 正直な開示: これはクライアント側(ブラウザ)のみのカウンタであり、
// `localStorage`を消去する・別ブラウザ/別端末を使う等で回避できてしまう
// (サーバー側での強制ではない)。あくまで「無料枠を使い切ったことを
// 利用者へ知らせる」目的の簡易的な仕組みであり、悪用防止機構ではない。
const DAILY_USAGE_LIMIT_KEY = "openEnglish.dailyUsage";
const DAILY_USAGE_LIMIT = 100;

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readDailyUsage() {
  try {
    const raw = localStorage.getItem(DAILY_USAGE_LIMIT_KEY);
    if (!raw) return { date: todayDateString(), count: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.date !== todayDateString()) {
      return { date: todayDateString(), count: 0 };
    }
    return { date: parsed.date, count: Number(parsed.count) || 0 };
  } catch (err) {
    return { date: todayDateString(), count: 0 };
  }
}

function writeDailyUsage(usage) {
  try {
    localStorage.setItem(DAILY_USAGE_LIMIT_KEY, JSON.stringify(usage));
  } catch (err) {
    // localStorageが使えない環境でも他機能には影響させない(既存の
    // 可用性優先方針)。
  }
}

// テスト用に上限を一時的に下げられるようにする(ユーザー指示の実機検証
// 手順に対応、通常運用では`DAILY_USAGE_LIMIT`をそのまま使う)。
window.OPEN_ENGLISH_DAILY_LIMIT_OVERRIDE = null;

function effectiveDailyLimit() {
  const override = window.OPEN_ENGLISH_DAILY_LIMIT_OVERRIDE;
  return typeof override === "number" && override > 0 ? override : DAILY_USAGE_LIMIT;
}

function isDailyLimitExceeded() {
  return readDailyUsage().count >= effectiveDailyLimit();
}

function recordDailyUsage() {
  const usage = readDailyUsage();
  usage.count += 1;
  writeDailyUsage(usage);
  return usage.count;
}

// 上限到達時のメッセージ(日英併記)。要望1(有料版切替の案内)+
// 要望2(他プロバイダの無料枠案内、`provider-free-tiers.json`を動的に
// 参照——ハードコードしない、既存の無料枠バナーとの一貫性を保つ)。
async function dailyLimitExceededMessage() {
  let text =
    "🚫 本日の無料利用枠を超えました。有料版に切り替えますか？\n" +
    "You've exceeded today's free usage limit. Would you like to switch to a paid plan?\n" +
    "(この案内は表示のみです。実際の決済・アップグレード処理はこの" +
    "アプリには実装されていません。 / This is a notice only — no " +
    "payment or upgrade flow is implemented in this app.)";

  try {
    const res = await fetch("provider-free-tiers.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const providers = Array.isArray(data.providers) ? data.providers : [];
      if (providers.length > 0) {
        text +=
          "\n\n💡 他のAIサービスの無料枠も、一日の制限内で毎日ご利用いただけます。\n" +
          "Other AI services' free tiers are also available for you to use daily, within their own daily limits.";
        for (const p of providers) {
          const nameEn = p.name_en || p.id || "";
          const nameJa = p.name_ja || "";
          const tierEn = p.free_tier_en || "(no data)";
          const tierJa = p.free_tier_ja || "(情報なし)";
          text += `\n・${nameEn} / ${nameJa}: ${tierEn} / ${tierJa}`;
        }
      }
    }
  } catch (err) {
    // 読み込めなくても上限到達メッセージ本体は表示する(既存の
    // 可用性優先方針)。
  }
  return text;
}

// 日本語文字(ひらがな・カタカナ・漢字)を含むかどうかの簡易判定。
// 正規表現の\p{Script=...}(Unicodeプロパティエスケープ)はモダンブラウザ
// (Chrome/Firefox/Safari最新版)で対応済みのため追加ライブラリ不要。
function containsJapanese(text) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text);
}

// 正直な開示: GPT-2/DistilGPT-2は英語中心の語彙(BPE)で事前学習されており、
// 日本語の生成能力が本質的に弱い。ハイブリッドモード(英日併記)を選んで
// いても、モデルが英語だけで応答してしまうことがある——ユーザー報告
// 「日本語でしゃべっても英語と日本語で返事して」への対応として、
// (1)ユーザーの発話が日本語の場合はその原文をプロンプトへ明示的に
// 埋め込みモデルに気づかせる、(2)それでもモデルの返答に日本語が
// 一切含まれなければ、フロントエンド側で必ず日本語の一言を補い、
// 「ハイブリッド(英日併記)」という構造だけは常に保証する
// (機械翻訳の質を偽って主張しない、あくまで定型の一言を添えるのみ)。
function ensureHybridReply(completion, userText) {
  if (replyLangEl.value !== "hybrid") return completion;
  if (containsJapanese(completion)) return completion;
  const note = containsJapanese(userText)
    ? "(This small AI model can't reliably write Japanese yet — please keep speaking Japanese, I'll answer in English! / このAIはまだ日本語の生成が苦手です。日本語で話しかけ続けてくださいね、英語でお答えします!)"
    : "(Here is a short Japanese note so you can compare both languages. / 英語と日本語を見比べられるよう、日本語のメモを添えました。)";
  return `${completion}\n\n${note}`;
}

const logEl = document.getElementById("log");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const apiBaseEl = document.getElementById("api-base");
// LAN経由アクセス(スマホ等)対応: このページ自体が`localhost`以外の
// ホスト名(PCのIPアドレス)で開かれている場合、`aruaru-llm`の既定接続先も
// 同じホスト名を使うよう自動調整する(ユーザー報告: スマホのWebViewから
// PC上のopen-english-serverへ接続できても、そのままだと`aruaru-llm`
// 接続先が`localhost`=スマホ自身を指してしまい、接続に失敗していた)。
if (apiBaseEl && location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  apiBaseEl.value = `http://${location.hostname}:4600`;
}
const statusEl = document.getElementById("status");
const trainerEl = document.getElementById("trainer");
const bubbleEl = document.getElementById("speech-bubble");
const levelEl = document.getElementById("level");
const ageGroupEl = document.getElementById("age-group");
const businessEnglishEl = document.getElementById("business-english-toggle");
const replyLangEl = document.getElementById("reply-lang");
const webSearchToggleEl = document.getElementById("web-search-toggle");
const micBtn = document.getElementById("mic-btn");
const voiceOutEl = document.getElementById("voice-out");

// 風天のトラさんキャラクターへの切替時に流れる短いジングル(ユーザー
// 指示、2026-08-10「男はつらいよの映画のメインテーマのBGMのパロディが
// 短く流れるように」)。
// 正直な開示: 実在する楽曲のメロディ・録音を一切使用しない完全新規の
// オリジナル作曲(音階・雰囲気のみを「祭り囃子・旅回りの下町演歌」風に
// 参考にしたに留まる)。Web Audio APIのオシレーターで手書き合成する
// (追加ライブラリ・音源ファイル不使用)。
function playToraSanJingle() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    // 下町演歌調を意識した、五音音階(ヨナ抜き)の短い上昇→着地フレーズ。
    const notes = [
      { freq: 392.0, start: 0.0, dur: 0.16 }, // G4
      { freq: 440.0, start: 0.16, dur: 0.16 }, // A4
      { freq: 523.25, start: 0.32, dur: 0.22 }, // C5
      { freq: 587.33, start: 0.56, dur: 0.16 }, // D5
      { freq: 659.25, start: 0.74, dur: 0.42 }, // E5(着地音、少し長め)
    ];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle"; // 尺八・篠笛風の柔らかい音色に近づける
      osc.frequency.value = note.freq;
      const t0 = now + note.start;
      const t1 = t0 + note.dur;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
    const totalMs = (notes[notes.length - 1].start + notes[notes.length - 1].dur + 0.1) * 1000;
    setTimeout(() => ctx.close(), totalMs);
  } catch (err) {
    // 音声合成APIが使えない環境ではジングル無しで継続する(致命的にしない)。
  }
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  div.dataset.role = role;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  return div;
}

function replaceLastMessage(role, text) {
  const nodes = logEl.querySelectorAll(`.msg.${role}`);
  const last = nodes[nodes.length - 1];
  if (last) {
    last.textContent = text;
    logEl.scrollTop = logEl.scrollHeight;
    return true;
  }
  return false;
}

function setStatus(ok, text) {
  statusEl.textContent = text;
  statusEl.className = `status ${ok ? "ok" : "error"}`;
}

// キャビンアテンダント+メイドカフェ風の声質(ユーザー指示、2026-08-10)。
// 正直な開示: Web Speech APIはブラウザ・OS標準の音声合成エンジンを使う
// ため、声質そのものを自作することはできない——できるのは(1)利用可能な
// 声の中から明るく丁寧な印象の女性声を優先的に選ぶ、(2)ピッチを気持ち
// 高め・話速を気持りゆっくりにして「案内・接客」らしい丁寧さと、
// メイドカフェらしい明るさを両立させる、という範囲までに留まる。
let cachedVoices = [];
const femaleNameHints = ["female", "woman", "kyoko", "haruka", "ayumi", "samantha", "zira", "susan", "google 日本語", "google us english"];
// トラさん風の声(ユーザー指示、2026-08-10「トラさんに切り替えるとトラ
// さん風の声にして」)を選ぶための男性声ヒント。正直な開示: 実在の
// 声優・キャラクターの声を再現するものではなく、ブラウザ標準の男性声を
// 選び、低めのピッチ・やや速い話速で「気さくな中年男性」の印象に
// 近づけるだけの範囲(Web Speech APIの制約、前述の声質に関する開示と同じ)。
const maleNameHints = ["male", "man", "ichiro", "otoya", "daniel", "david", "mark", "google 日本語 male"];

function pickVoice(lang, preferMale) {
  if (!cachedVoices.length && "speechSynthesis" in window) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  const candidates = cachedVoices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  const hints = preferMale ? maleNameHints : femaleNameHints;
  const preferred = candidates.find((v) => hints.some((hint) => v.name.toLowerCase().includes(hint)));
  // 正直な開示・バグ修正(ユーザー報告「17歳を英語の部分でジュウナナ
  // イヤーズと発音していた」): 以前はここで`candidates`(要求言語に
  // マッチする声)が1件も無い場合、無関係な言語(例: 日本語)の声へ
  // フォールバックしていた(`cachedVoices[0]`)。多くのブラウザは
  // `utterance.voice`が設定されるとその声自身の言語の発音規則
  // (数字の読み方等)を`utterance.lang`より優先するため、英語の
  // "17 years old"が日本語の声で読まれ「ジュウナナ」のように誤発音
  // される実バグがあった。要求言語に合う声が1件も無い場合は`voice`を
  // 設定せず`null`を返すことで、ブラウザ既定の`utterance.lang`側の
  // 発音規則(セブンティーン)にそのまま委ねる。
  return preferred || candidates[0] || null;
}
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

// 各行が"English sentence / 日本語訳"形式(このアプリ全体で使われている
// 規約)になっている発話テキストから、実際に読み上げる言語の部分だけを
// 抽出する(ユーザー指摘、2026-08-10「メイドの喋りが途切れ途切れ」への
// 対応)。**根本原因**: 発話全体を単一の`utter.lang`(en-US または
// ja-JP)で読ませていたが、テキスト自体は英語・日本語が"/"区切りで
// 混在していたため、ブラウザのTTSエンジンが片方の言語の発音規則で
// もう片方の言語の文字列を無理に読もうとし、不自然な途切れ・詰まりが
// 発生していた。行ごとに"/"で分割し、`lang`に一致する側だけを選んで
// 読点でつなぐことで、単一言語の滑らかな文章として読み上げさせる。
function extractSpeechText(text, lang) {
  const wantJapanese = lang.startsWith("ja");
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const picked = lines.map((line) => {
    const parts = line.split(" / ");
    if (parts.length < 2) return line.trim();
    return wantJapanese ? parts[1].trim() : parts[0].trim();
  });
  return picked.join(wantJapanese ? "。" : ". ");
}

// メイドカフェ研修モード専用: 英語のワンフレーズを話したら、続けて
// 対応する日本語も話す(ユーザー指示「英語で一言ワンフレーズしゃべったら
// 対応する日本語でもしゃべってを繰り返して」への対応)。通常モードの
// `speak()`は`replyLangEl`の設定に応じて英語または日本語の一方だけを
// 話すが、この関数は常に両方を順番に話す(音声合成キューに2つの
// utteranceを積むだけで、`cancel()`を挟まなければブラウザが順番に
// 再生してくれる)。
function speakBilingual(text) {
  bubbleEl.textContent = text;
  if (!(voiceOutEl.checked && "speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const isHelper = typeof activeCharacter !== "undefined" && activeCharacter === "helper";
    const enText = extractSpeechText(text, "en-US");
    const jaText = extractSpeechText(text, "ja-JP");
    [
      { text: enText, lang: "en-US" },
      { text: jaText, lang: "ja-JP" },
    ].forEach(({ text: part, lang }) => {
      if (!part) return;
      const utter = new SpeechSynthesisUtterance(part);
      utter.lang = lang;
      const voice = pickVoice(lang, isHelper);
      if (voice) utter.voice = voice;
      if (isHelper) {
        utter.pitch = 0.75;
        utter.rate = 1.05;
      } else {
        utter.pitch = 1.1;
        utter.rate = 0.82;
      }
      window.speechSynthesis.speak(utter);
    });
    trainerEl.classList.add("speaking");
    const spokenMs = Math.min(6000, (enText.length + jaText.length) * 60);
    clearTimeout(speak._timer);
    speak._timer = setTimeout(() => trainerEl.classList.remove("speaking"), spokenMs);
  } catch (err) {
    // フォールバック: 音声合成に失敗したら口パクのみで継続する。
  }
}

function speak(text) {
  bubbleEl.textContent = text;

  // 音声出力(ユーザー指示、2026-08-10「声でも文字でも」への対応)。
  // ブラウザ標準のWeb Speech API(SpeechSynthesis)を使う——サーバー側の
  // TTSは未実装なので、対応ブラウザでのみ実際に声が出る(正直な開示)。
  let spokenMs = Math.min(4000, text.length * 60);
  if (voiceOutEl.checked && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      const lang = replyLangEl.value === "ja" ? "ja-JP" : "en-US";
      const utter = new SpeechSynthesisUtterance(extractSpeechText(text, lang));
      utter.lang = lang;
      const isHelper = typeof activeCharacter !== "undefined" && activeCharacter === "helper";
      const voice = pickVoice(lang, isHelper);
      if (voice) utter.voice = voice;
      if (isHelper) {
        // トラさん風の声(気さくな中年男性、低めのピッチ+やや速めの話速)。
        utter.pitch = 0.75;
        utter.rate = 1.05;
      } else {
        // デフォルトの声質(ユーザー指示、2026-08-10「ジャンボジェットの
        // スチュワーデスの声+メイドカフェの様な声をデフォルトに」):
        // 大型機の機内アナウンスを思わせる丁寧でゆったりした話速+
        // メイドカフェらしい明るいピッチ、を両立させる調整値。
        // 2026-08-10追記: 「もう少しゆっくり喋って」との指示により
        // さらに話速を落とした(0.92→0.82)。
        utter.pitch = 1.1;
        utter.rate = 0.82;
      }
      trainerEl.classList.add("speaking");
      utter.onend = () => trainerEl.classList.remove("speaking");
      window.speechSynthesis.speak(utter);
      return;
    } catch (err) {
      // フォールバック: 音声合成に失敗したら口パクのみで継続する。
    }
  }
  trainerEl.classList.add("speaking");
  clearTimeout(speak._timer);
  speak._timer = setTimeout(() => trainerEl.classList.remove("speaking"), spokenMs);
}

// メイドカフェ英会話研修モード(ユーザー指示、2026-08-10)。
//
// 正直な開示: これは`aruaru-llm`のAI生成ではなく、固定の会話フロー
// (有限状態機械)によるスクリプト進行である。GPT-2ベースの`/v1/generate`
// では指定された自己紹介の順序・内容(名前→年齢ジョーク→出身国→
// 国別の共通話題→アニメ→食べ物→文化)を確実に守らせることはできない
// ため、確実性を優先してこのモードのみ決定的なスクリプトとした。
// 各国について「合っていればどれを答えてもよい」個別の話題候補
// (ユーザー指示「アイフロムチャイナなら、アイラブ北京ダッグや餃子、
// アイラブパンダや万里の長城なども回答としてあっていればランダムで
// 答えて」——固定の1文ではなく、正しい候補の中からランダムに選ぶ)。
// 下記`findCountryFunFact`が、これらとDB(`/v1/geo/lookup`)由来の
// ランドマーク・名物料理を1つの候補プールへ合算し、その中から
// ランダムに1つ選んで返す。
const countryExtraFunFacts = {
  australia: ["I love kangaroos! / 私はカンガルーが大好きです!", "I love koalas! / 私はコアラが大好きです!"],
  usa: ["I love baseball! / 私は野球が大好きです!", "I love Hollywood movies! / 私はハリウッド映画が大好きです!"],
  america: ["I love baseball! / 私は野球が大好きです!", "I love Hollywood movies! / 私はハリウッド映画が大好きです!"],
  uk: ["I love tea time! / 私はお茶の時間が大好きです!", "I love football! / 私はサッカーが大好きです!"],
  england: ["I love tea time! / 私はお茶の時間が大好きです!", "I love football! / 私はサッカーが大好きです!"],
  canada: ["I love maple syrup! / 私はメープルシロップが大好きです!", "I love hockey! / 私はホッケーが大好きです!"],
  france: ["I love croissants! / 私はクロワッサンが大好きです!", "I love the Eiffel Tower! / 私はエッフェル塔が大好きです!"],
  china: [
    "I love pandas! / 私はパンダが大好きです!",
    "I love dumplings! / 私は餃子が大好きです!",
    "I love the Great Wall! / 私は万里の長城が大好きです!",
    "I love Peking duck! / 私は北京ダックが大好きです!",
  ],
  korea: ["I love K-pop! / 私はK-POPが大好きです!", "I love kimchi! / 私はキムチが大好きです!"],
};

function pickRandomFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// 地理・観光DB(2026-08-11追加、`aruaru-llm`の`POST /v1/geo/lookup`)の
// ランドマーク・名物料理と、上記`countryExtraFunFacts`(該当国のみ)を
// 1つの候補プールへ合算し、その中からランダムに1つ選んで返す
// (2026-08-12、固定の組み合わせではなく「正しければどれでもよい」
// 候補群からランダムに選ぶ方式へ変更)。DB未接続・該当候補が無い場合は
// 汎用の一言へフォールバックする(サービスを止めない既存方針を踏襲)。
async function findCountryFunFact(text) {
  const lower = text.toLowerCase();
  let factPool = [];
  for (const [key, facts] of Object.entries(countryExtraFunFacts)) {
    if (lower.includes(key)) {
      factPool = factPool.concat(facts);
      break;
    }
  }
  let dbCapital = null;
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetch(`${base}/v1/geo/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country: text.trim() }),
    });
    const data = await res.json();
    if (data.found && data.capital) {
      dbCapital = data.capital;
      factPool.push(`I love ${dbCapital.landmark_en}! / 私は${dbCapital.landmark_ja}が大好きです!`);
      factPool.push(`I love ${dbCapital.food_en}! / 私は${dbCapital.food_ja}が大好きです!`);
    }
  } catch (err) {
    // DB未接続時は静かにフォールバックする(既存の可用性優先方針)。
  }

  if (factPool.length > 0) {
    let reply = pickRandomFrom(factPool);
    if (dbCapital) {
      const c = dbCapital;
      reply += `\nA popular souvenir there is ${c.souvenir_en}. / そこの人気のお土産は${c.souvenir_ja}です。`;
      // 富士山の話題が出た場合は、安全上の注意+登山バス/タクシー予約先+
      // 山小屋一覧+登山用品店を必ず日英併記で案内する(ユーザー指示
      // 「富士山が好きとか富士山の紹介をするなら…富士山の話題が出たら
      // 日本語と英語で紹介して」+「スキーウェアとヘルメットと登山靴
      // などを安く販売しているお店なども…紹介する機能を持たせて」)。
      if (c.landmark_en.includes("Fuji") || c.landmark_ja.includes("富士山")) {
        reply += `\n\n${await fujiInfoText()}`;
      }
      // 日本・世界どちらの国が話題になっても、観光ツアーの紹介と
      // オンライン予約先をその都度検索して案内する(ユーザー指示
      // 「日本も世界も観光で訪れるなら、観光ツアーの紹介とオンライン
      // 予約をその都度検索して、Google検索結果とYoutube検索結果を
      // 日本語と英語で表示して」)。
      reply += `\n\n${await tourSearchText(c.country_en)}`;
    }
    return reply;
  }
  return "That's wonderful! I'd love to learn more about your country someday! / それは素晴らしいですね!いつかあなたの国についてもっと知りたいです!";
}

// 富士山の安全上の注意+山小屋・登山バス/タクシー・登山用品店の一覧
// (`aruaru-llm`の`GET /v1/geo/fuji`、2026-08-11新設)を日英併記の
// 短いテキストへ整形する。取得失敗時は静かに空文字を返す(既存の
// 可用性優先方針)。
async function fujiInfoText() {
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetch(`${base}/v1/geo/fuji`);
    const info = await res.json();
    const hut = info.mountain_huts && info.mountain_huts[0];
    const transport = info.transport_reservations && info.transport_reservations[0];
    const gear = info.gear_shops && info.gear_shops[0];
    let text = `⚠️ ${info.safety_en}\n⚠️ ${info.safety_ja}`;
    if (hut) {
      text += `\n\n🏠 Example hut you can reserve: ${hut.name_en} (${hut.station_en}, ${hut.phone}) / 予約できる山小屋の例: ${hut.name_ja}(${hut.station_ja}、${hut.phone})`;
    }
    if (transport) {
      text += `\n🚌 Bus/permit booking: ${transport.name_en} / バス・通行予約: ${transport.name_ja}`;
    }
    if (gear) {
      text += `\n🎽 Gear rental: ${gear.name_en} (ski wear, helmet, boots) / 登山用品レンタル: ${gear.name_ja}(スキーウェア・ヘルメット・登山靴)`;
    }
    return text;
  } catch (err) {
    return "";
  }
}

// 話題に出た国・地域の観光ツアー紹介+オンライン予約先をその都度検索
// して案内する(`aruaru-llm`の`POST /v1/geo/tours`、2026-08-11新設)。
// aruaru-llm側にGoogle Search APIキーが設定されていない場合は、その旨を
// 正直に伝えるだけに留める(黙って結果を偽装しない)。
async function tourSearchText(place) {
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetch(`${base}/v1/geo/tours`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ place }),
    });
    const data = await res.json();
    let text = `🧳 Tours & booking for ${place} / ${place}の観光ツアー・予約情報`;
    if (data.configured && data.web_results && data.web_results.length) {
      data.web_results.slice(0, 3).forEach((r) => {
        text += `\n・${r.title}`;
      });
    } else {
      text += `\n(${data.disclosure_en} / ${data.disclosure_ja})`;
    }
    if (data.youtube_search_url) {
      text += `\n🎥 YouTube search / YouTube検索: ${data.youtube_search_url}`;
    }
    return text;
  } catch (err) {
    return "";
  }
}

// 「今度オーストラリアに旅行/出張の予定がある」のような発話の検出
// (ユーザー指示「今度どこどこの国に観光やお仕事で行く予定があるんだ
// けど、の様なフレーズにもDBで対応して」)。厳密な自然言語理解ではなく、
// countryFunFactsのキー(国名)が発話に含まれているかの簡易検出——
// GPT-2系に意図分類を確実にやらせることはできないため、確実性を優先
// した単純な文字列一致とする(正直な開示、既存のtrainingStepsと同じ方針)。
async function replyToTravelPlanMention(text) {
  const fact = await findCountryFunFact(text);
  return (
    "Oh, a trip coming up? How exciting! / 今度旅行があるんですね!素敵です!\n" +
    `${fact}`
  );
}

function trainingIntroLine() {
  const isHelper = typeof activeCharacter !== "undefined" && activeCharacter === "helper";
  if (isHelper) {
    return (
      "Let's begin the Maid Cafe English Training! / メイドカフェ英会話研修を始めましょう!\n" +
      "Hello, I am Tora, your butler trainer! / こんにちは、私は執事の先生、トラです!\n" +
      "Now — what is YOUR name? / さて、あなたのお名前は?"
    );
  }
  return (
    "Welcome home, master! / おかえりなさい、ご主人様!\n" +
    "Let's begin the Maid Cafe English Training! / メイドカフェ英会話研修を始めましょう!\n" +
    "Hello, I am Sakura, your maid trainer! / こんにちは、私はメイドの先生、さくらです!\n" +
    "How old am I, you ask? / 私が何歳か気になりますか?\n" +
    "A maid is eternally 17 years old! ✨ / メイドは永遠の17歳です!✨\n" +
    "Now — what is YOUR name? / さて、あなたのお名前は?"
  );
}

const trainingSteps = [
  {
    get trainerSays() {
      return trainingIntroLine();
    },
    onUserReply: (text) =>
      `Nice to meet you, ${text}! / はじめまして、${text}さん!\n` + "Where are you from? / どこの国からいらっしゃいましたか?",
  },
  {
    onUserReply: async (text) =>
      `${await findCountryFunFact(text)}\n` + "Do you know Japanese animation? / 日本のアニメーションを知っていますか?",
  },
  {
    onUserReply: () =>
      "I love UFO Robot Grendizer! / 私はUFOロボ グレンダイザーが大好きです!\n" +
      "I love Totoro too! / トトロも大好きです!\n" +
      "Do you know Japanese food? / 日本の食べ物を知っていますか?",
  },
  {
    onUserReply: () =>
      "I love katsu curry and kaki-fry curry rice! / 私はカツカレーとカキフライカレーライスが大好きです!\n" +
      "I love ramen too! / ラーメンも大好きです!\n" +
      "Do you know Japanese culture? / 日本の文化を知っていますか?",
  },
  {
    onUserReply: () =>
      "I love the Japanese language! / 私は日本語が大好きです!\n" +
      "I love aikido, judo, shodo (calligraphy), and sado (tea ceremony)! / 合気道、柔道、書道、茶道が大好きです!\n" +
      "I love temples, shrines, and Shinto too! / お寺や神社、神道も大好きです!\n" +
      "Did you know Japan is having a huge boom overseas right now? / 今、日本は海外で大ブームなんですよ!",
  },
  {
    // 日英でGoogle検索して調査した内容(ユーザー指示、2026-08-10)に基づく、
    // 海外で人気の日本文化トピックの紹介ステップ。誇張しないよう、
    // 検索で確認できた範囲の事実(概数・傾向)のみを取り上げる。
    onUserReply: () =>
      "Manga and anime like Demon Slayer and Attack on Titan are loved worldwide! / 「鬼滅の刃」や「進撃の巨人」のような漫画・アニメは世界中で愛されています!\n" +
      "Anime songs (anisong) even have huge live concerts like Animelo Summer Live! / アニソンには「Animelo Summer Live」のような大きなライブもあります!\n" +
      "Japanese video games are booming overseas too! / 日本のゲームも海外で大ブームです!\n" +
      "About 3.79 million people study Japanese around the world! / 世界中で約379万人が日本語を学んでいます!\n" +
      "Foreign tourists love collecting goshuin (temple & shrine stamps)! / 外国人観光客は御朱印集めも大好きです!\n" +
      "Onsen ryokan (hot spring inns) and shrine/temple tours are a huge tourism boom! / 温泉旅館や神社・お寺巡りも観光ブームです!\n" +
      "And Japanese food — sushi, ramen — is loved everywhere! / そして日本食(寿司・ラーメン等)も世界中で大好かれています!\n" +
      "Now let's learn a real maid cafe trick! / 実際のメイドカフェの技を学びましょう!",
  },
  {
    // 実際の秋葉原のメイドカフェ接客の工夫に着想を得た「単語軸」の会話練習
    // (ユーザー提供の参考記事: 訪日客向けの英会話は流暢な文法より、単語+
    // 表情・ジェスチャーで会話を成立させる、という実践的な技法)。記事の
    // 文章を丸ごと転載せず、技法自体を短い引用・要約に留めて練習に翻案。
    onUserReply: () =>
      "A real maid cafe secret: you don't need perfect grammar — just key words + a big smile! / メイドカフェの秘密: 完璧な文法は不要、キーワード+満面の笑顔で会話は成立します!\n" +
      'Real example: "Where are you from?" -> guest: "Australia!" -> maid: "Kangaroo!! 🦘" / 実例: 「どこから来たの?」→「オーストラリア!」→「カンガルー!!」\n' +
      "Let's try it! Say one word about your country (an animal, food, or famous thing). / 練習しましょう!あなたの国について一言(動物・食べ物・有名なもの)を教えてください。",
  },
  {
    onUserReply: (text) =>
      `${text}! That's a great word! 🎉 / ${text}!素敵な言葉ですね!🎉\n` +
      "Great job — you finished the self-introduction training! / お疲れ様でした!自己紹介研修は終了です!",
  },
];
let trainingStepIndex = 0;
// `trainingStepIndex`は最終ステップ到達後もその値のまま固定される
// (`advanceTrainingMode`の`Math.min`によるクランプ)ため、それだけを
// 「最終ステップかどうか」の判定に使うと、研修完了後にユーザーが
// さらにメッセージを送るたびに毎回`wasLastStep`が真になり、トラさんへの
// 引き継ぎ処理(`switchCharacter()`のトグル)が繰り返し発火してしまう
// バグがあった(ユーザー報告「トラさんに切り替えるとすぐにもとの
// メイドさんに自動で切り替わるBUG」の実際の原因)。1回だけ発火させる
// ためのフラグを別途持つ。
let trainingHandoffTriggered = false;

function startTrainingMode() {
  trainingStepIndex = 0;
  trainingHandoffTriggered = false;
  appendMessage("trainer", trainingSteps[0].trainerSays);
  speakBilingual(trainingSteps[0].trainerSays);
}

// メイドの研修が一通り終わったら、トラさんのジングル(BGM代わり)を
// 鳴らしてキャラを引き継ぎ、トラさんが話し始める(ユーザー指示
// 「メイドが一通りしゃべったら、次はトラさんのテーマのBGMが流れて、
// 今度はトラさんがしゃべって」への対応)。
function toraHandoffLine() {
  return (
    "Training complete! Great job! / 研修完了です!お疲れ様でした!\n" +
    "Now let's keep practicing together — I'm Tora, your next trainer! / さあ、続けて練習しましょう!次の先生はトラだよ!"
  );
}

async function advanceTrainingMode(userText) {
  const step = trainingSteps[trainingStepIndex];
  const wasLastStep = trainingStepIndex === trainingSteps.length - 1;
  let reply = await step.onUserReply(userText);
  reply += await referralsSuffix(userText);
  reply += consumptionTaxSuffix(userText);
  reply += incomeWallSuffix(userText);
  reply += vendingMachineSuffix(userText);
  reply += internetAccessSuffix(userText);
  reply += govConsultingSuffix(userText);
  reply += fairTradeSuffix(userText);
  reply += await newsSuffix(userText);
  reply += troubledSuffix(userText);
  reply += nuclearDeterrenceSuffix(userText);
  appendMessage("trainer", reply);
  speakBilingual(reply);
  trainingStepIndex = Math.min(trainingStepIndex + 1, trainingSteps.length - 1);

  if (wasLastStep && activeCharacter === "maid") {
    const delayMs = Math.min(6000, reply.length * 60) + 800;
    setTimeout(() => {
      // ユーザーがこの待ち時間中に手動でキャラを切り替えていた場合、
      // ここで無条件に`switchCharacter()`(トグル)を呼ぶと元に戻って
      // しまうバグがあった(ユーザー報告「トラさんに切り替えると
      // すぐにもとのメイドさんに自動で切り替わる」)。実行時点の
      // 状態を再確認し、まだメイドのままの場合のみ切り替える。
      if (activeCharacter !== "maid") return;
      switchCharacter(); // トラさんのジングルはここで再生される
      const line = toraHandoffLine();
      appendMessage("trainer", line);
      speakBilingual(line);
    }, delayMs);
  }
}

// 直前の接続状態(ユーザー指示、2026-08-10「インストール後は自動認識で
// インストール済みを英日で自動表示して」への対応——未接続→接続に変わった
// 瞬間だけ、英日ハイブリッドのお知らせを1回表示する)。
let wasConnected = false;

async function checkHealth() {
  const base = apiBaseEl.value.trim();
  try {
    const res = await fetch(`${base}/healthz`);
    if (res.ok) {
      setStatus(true, "aruaru-llm: connected");
      if (!wasConnected) {
        const msg = "aruaru-llm installed and connected! / aruaru-llmがインストールされ接続されました!";
        appendMessage("system", msg);
        speak(msg);
      }
      wasConnected = true;
    } else {
      setStatus(false, `aruaru-llm: HTTP ${res.status}`);
      wasConnected = false;
    }
  } catch (err) {
    setStatus(false, "aruaru-llm: unreachable (CORS or server not running?)");
    wasConnected = false;
  }
}

// 定期的に自動で接続確認する(ユーザー指示: インストール後の自動認識)。
// 5秒ごとにポーリングし、上記の初回接続検知ロジックで通知する。
setInterval(checkHealth, 5000);

// キャラクター切替(ユーザー指示、2026-08-10「メイドカフェ魔法少女と
// 風天のトラさんをいつでも変更できるように」への対応)。
let activeCharacter = "maid";
const charMaidEl = document.getElementById("char-maid");
const charHelperEl = document.getElementById("char-helper");
const characterSwitchBtn = document.getElementById("character-switch-btn");

function switchCharacter() {
  activeCharacter = activeCharacter === "maid" ? "helper" : "maid";
  if (activeCharacter === "maid") {
    charMaidEl.style.display = "";
    charHelperEl.style.display = "none";
    bubbleEl.textContent = "I'm back! I'm your maid-cafe trainer again! / 戻ってきました!メイドカフェの先生に戻りました!";
  } else {
    charMaidEl.style.display = "none";
    charHelperEl.style.display = "";
    bubbleEl.textContent =
      "Yo! It's me, Torasan-style helper — always carrying my Miku-style figure! / よう!風天のトラさんだ、いつも初音ミク風のフィギュアを持ってるぜ!";
    playToraSanJingle();
  }
  // 研修モードの自己紹介(まだユーザーが名前等に返答していない最初の
  // ステップ)を表示した後にキャラを切り替えた場合、表示済みの挨拶
  // メッセージがそのまま古いキャラのままになってしまう問題への対応
  // (ユーザー指摘、2026-08-10「トラさんに切り替えたのにまだ…さくらと
  // 名乗ってますね」)——研修モードでまだ最初のステップにいる間だけ、
  // 直前の挨拶メッセージを新しいキャラの台詞へ差し替える。
  if (levelEl.value === "maid-cafe-training" && trainingStepIndex === 0) {
    const newIntro = trainingIntroLine();
    replaceLastMessage("trainer", newIntro);
    speakBilingual(newIntro);
  }
}

characterSwitchBtn.addEventListener("click", switchCharacter);

async function askTrainer(userText) {
  const base = apiBaseEl.value.trim();
  const level = levelEl.value;
  let levelInstruction = levelInstructions[level] || "";
  const ageInstruction = ageGroupEl ? ageGroupInstructions[ageGroupEl.value] || "" : "";
  if (ageInstruction) levelInstruction = `${ageInstruction} ${levelInstruction}`;
  if (businessEnglishEl && businessEnglishEl.checked) {
    levelInstruction = `${levelInstruction} ${BUSINESS_ENGLISH_INSTRUCTION}`;
  }
  let langInstruction = langInstructions[replyLangEl.value] || "";
  // ユーザーの発話が日本語の場合、その事実をプロンプトへ明示する
  // (ユーザー報告「日本語でしゃべっても英語と日本語で返事して」への
  // 対応、第一段階)。GPT-2は英語中心の語彙のため、これだけでは
  // 日本語生成が保証されない——保証はensureHybridReply()側で行う。
  if (replyLangEl.value === "hybrid" && containsJapanese(userText)) {
    langInstruction += " The student just wrote in Japanese, so make sure your reply includes a Japanese part too.";
  }
  // 正直な開示: プロンプトへの指示文付加のみでレベル・言語を守らせようと
  // しているだけで、GPT-2側が実際にそれを守る保証は無い。
  // 学びたい言語がユーザー自身で追加した「世界の言語」(`world:<code>`)の
  // 場合は、その言語名を差し込んだトレーナー役をその場で組み立てる
  // (2026-08-22追加)。**正直な開示**: これはプロンプトへ言語名を書くだけで、
  // GPT-2側がその言語で自然に応答する保証は無い(既存の制約と同じ)。
  const learnTargetValue = learnTargetEl ? learnTargetEl.value : "english";
  let trainerRole;
  if (learnTargetValue.startsWith("world:")) {
    const langInfo = typeof worldLanguageByCode === "function" ? worldLanguageByCode(learnTargetValue.slice(6)) : null;
    const langName = langInfo ? langInfo.en : learnTargetValue.slice(6);
    trainerRole = `You are a friendly ${langName} conversation trainer at a maid cafe, helping the student practice ${langName}. Explain in English when helpful.`;
  } else {
    trainerRole = trainerRoleByTarget[learnTargetValue] || trainerRoleByTarget.english;
  }
  const prompt = `${trainerRole} ${levelInstruction} ${langInstruction}\nStudent: ${userText}\nTrainer:`;

  // Google検索補強(ユーザー指示「発話・入力の都度Google検索する」への
  // 対応、ブリッジ式)。トグルON時は`/v1/generate-with-search`を叩く
  // ——`aruaru-llm`側でAPIキー未設定なら自動的に検索無しへフォールバック
  // する(`used_search:false`、正直な開示としてUIにも表示する)。
  const useWebSearch = webSearchToggleEl && webSearchToggleEl.checked;
  const endpoint = useWebSearch ? "/v1/generate-with-search" : "/v1/generate";

  const res = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 正直な開示: max_new_tokensを48から24へ縮小した(ユーザー指摘
    // 「反応も遅すぎ」への対応)。GPT-2(CPU貪欲デコード)は1トークンごとに
    // ほぼ一定時間かかるため、トークン数を減らすことがそのまま応答時間の
    // 短縮になる——ファインチューニング無しの素のモデルであるという
    // 制約自体は変わらない。
    body: JSON.stringify({ prompt, max_new_tokens: 24 }),
  });
  if (!res.ok) {
    throw new Error(`aruaru-llm returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const completion = data.completion ?? "(no completion field in response)";
  let reply = ensureHybridReply(trimDegenerateRepetition(completion), userText);

  if (useWebSearch) {
    if (data.used_search && Array.isArray(data.search_results) && data.search_results.length > 0) {
      // 正直な開示・セキュリティ配慮: 検索結果のtitleは外部(Google経由の
      // Webサイト)由来のテキストのため、`innerHTML`へそのまま挿入せず
      // (XSSリスク回避)、`appendMessage`が使うプレーンテキスト
      // (`textContent`)としてURLをそのまま列挙する。
      const links = data.search_results.map((r) => `${r.title} (${r.link})`).join(" / ");
      reply += `\n\n🔎 Google search used / Google検索を使用しました: ${links}`;
    } else {
      reply +=
        "\n\n🔎 Google search was not used (API key not configured on the server) / " +
        "Google検索は使用されませんでした(サーバー側でAPIキーが未設定)。";
    }
  }
  reply += await referralsSuffix(userText);
  reply += consumptionTaxSuffix(userText);
  reply += incomeWallSuffix(userText);
  reply += vendingMachineSuffix(userText);
  reply += internetAccessSuffix(userText);
  reply += govConsultingSuffix(userText);
  reply += fairTradeSuffix(userText);
  reply += await newsSuffix(userText);
  reply += troubledSuffix(userText);
  reply += nuclearDeterrenceSuffix(userText);
  return reply;
}

// 就職・転職や観光の話題が出た際、aruaru.tokyo/nasa.tokyo/
// audiocafe.tokyo(aruaru・aruaru-lady)を日英併記で案内する
// (`aruaru-llm`の`POST /v1/referrals/check`、2026-08-11新設、ユーザー
// 指示「英語と日本語と観光と就職転職情報の話題が出たらaruaru.tokyo内の
// AI駆動開発CLAUDE CODE DESKTOP、audiocafe.tokyo/aruaru・aruaru-ladyの
// SET、aruaru.tokyo と nasa.tokyo 両方とも紹介して」への対応)。
async function referralsSuffix(userText) {
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetch(`${base}/v1/referrals/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: userText }),
    });
    const data = await res.json();
    if (!data.matched || !data.referrals) return "";
    const r = data.referrals;
    let text = `\n\n💼 ${r.intro_en} / ${r.intro_ja}`;
    r.links.forEach((l) => {
      text += `\n・${l.label_en} — ${l.url}`;
    });
    return text;
  } catch (err) {
    return "";
  }
}

// 消費税問題の解決策を尋ねる日本語入力を検出したら、開発者(ユーザー)の
// 具体的な政策提案を日英併記で案内する(ユーザー指示、2026-08-17)。
// `referralsSuffix`と同じ「話題検出→定型文を末尾に追記」の設計だが、
// こちらはサーバー往復不要のクライアント側キーワード判定のみで完結する
// (この提案文自体はopen-englishが生成するAI応答ではなく、開発者が
// 用意した固定テキストであることを明示する——GPT-2の生成物ではない)。
const CONSUMPTION_TAX_TOPIC_KEYWORDS = ["消費税"];
const CONSUMPTION_TAX_QUESTION_KEYWORDS = [
  "解決策", "解決", "どうすれば", "どうしたら", "どうすればいい",
  "なくす", "無くす", "撤廃", "下げる", "上げる", "廃止", "改革",
  "どう思う", "教えて",
];

function isConsumptionTaxSolutionQuestion(userText) {
  if (!containsJapanese(userText)) return false;
  const hasTopic = CONSUMPTION_TAX_TOPIC_KEYWORDS.some((k) => userText.includes(k));
  if (!hasTopic) return false;
  return CONSUMPTION_TAX_QUESTION_KEYWORDS.some((k) => userText.includes(k));
}

function consumptionTaxProposalText() {
  const ja =
    "【消費税問題への提案(開発者からの一意見)】\n" +
    "消費税は、法人税が約40%だった頃に、将来的に約20%へ引き下げる前提で" +
    "導入された経緯があります(2026年8月時点の法人税は約20%)。その前提に" +
    "立てば、消費税を撤廃する、あるいは法人税を元の40%程度へ引き上げ、" +
    "それでも足りなければ45〜50%程度まで引き上げるという選択肢が現実的です。" +
    "それでも財源が不足する場合は、行政のWEBサイト・LINEアプリ化を進める" +
    "eガバメント・デジタルガバメント化により、市区町村・都道府県庁の統廃合、" +
    "中央省庁・国会のオンライン化(在宅勤務・オンライン国会)を進めて公務員を" +
    "大幅にリストラし、財源を確保します。その財源で、少子高齢化対策予算、" +
    "基礎年金+厚生年金の皆保険化(全員加入型)による年金受給額の増額、" +
    "後期高齢者医療制度における低所得層・中間所得層の無償化が実現可能です。";
  const en =
    "[A proposal on the consumption-tax problem (the developer's own opinion)]\n" +
    "Japan's consumption tax was originally introduced on the premise that the " +
    "corporate tax rate, then around 40%, would eventually be lowered to around " +
    "20% (as of August 2026 it is indeed around 20%). Given that history, a " +
    "realistic option is to abolish the consumption tax — or raise the " +
    "corporate tax rate back toward 40%, and to 45-50% if still not enough. " +
    "If revenue is still short, advancing e-government/digital-government " +
    "(moving administrative websites and services onto LINE-style apps), " +
    "consolidating/abolishing municipal and prefectural government offices, " +
    "and moving central-government ministries and the Diet online (remote work, " +
    "online parliamentary sessions) would allow a major reduction in the civil " +
    "service headcount, freeing up funds. Those funds could then go toward the " +
    "declining-birthrate/aging-society budget, raising pension payouts by making " +
    "the basic pension plus employees' pension universal (mandatory enrollment " +
    "for all), and making the late-stage elderly medical system free for " +
    "low-income and middle-income households.";
  return `\n\n💰 ${en}\n\n${ja}`;
}

// 高級家電(スマホ・タブレット・PC・グラフィックボード・プリンター等)の
// 自動販売機・e-SIM/MNP対応についての話題を検出したら、開発者(ユーザー)の
// 提案を日英併記で案内する(ユーザー指示、2026-08-17)。消費税提案と同じ
// 設計方針の固定テキスト。
const VENDING_MACHINE_TOPIC_KEYWORDS = ["自動販売機", "自販機"];

function mentionsVendingMachineTopic(userText) {
  if (!containsJapanese(userText)) return false;
  return VENDING_MACHINE_TOPIC_KEYWORDS.some((k) => userText.includes(k));
}

function vendingMachineProposalText() {
  const ja =
    "【電子機器自動販売機・e-SIM/MNPへの提案(開発者からの一意見)】\n" +
    "1円からでも購入できる高級スマホ・タブレット・PC・グラフィック" +
    "ボード・プリンターなどの自動販売機を、特にコンビニ・病院・大きな" +
    "会社に設置するべきです。e-SIMの普及も進めるべきです。スマホの" +
    "自動販売機では、フィルム(保護フィルム)を自動で貼ってくれる機能も" +
    "搭載し、ドコモ・au・SoftBank・楽天モバイルなどの新規契約や、" +
    "MNP(以前の電話番号の引き継ぎ)もその場で行えるようにするべきです。";
  const en =
    "[A proposal on electronics vending machines and e-SIM/MNP (the " +
    "developer's own opinion)]\n" +
    "Vending machines selling premium smartphones, tablets, PCs, graphics " +
    "cards, printers, and similar items — purchasable for as little as 1 " +
    "yen — should be installed especially in convenience stores, " +
    "hospitals, and large companies. The spread of e-SIM should also be " +
    "promoted. Smartphone vending machines should also automatically apply " +
    "a screen-protector film, and let people sign up for new contracts " +
    "with carriers such as NTT Docomo, au, SoftBank, and Rakuten Mobile, " +
    "and also complete MNP (porting their existing phone number) on the " +
    "spot.";
  return `\n\n📱 ${en}\n\n${ja}`;
}

function vendingMachineSuffix(userText) {
  if (!mentionsVendingMachineTopic(userText)) return "";
  return vendingMachineProposalText();
}

// インターネットプロバイダー・WiFiルーター・端末の低所得層/失業者向け
// 無償化についての話題を検出したら、開発者(ユーザー)の提案を日英併記で
// 案内する(ユーザー指示、2026-08-17)。他の提案機能と同じ設計方針の
// 固定テキスト。
const INTERNET_ACCESS_TOPIC_KEYWORDS = ["プロバイダー", "wifiルーター", "wi-fiルーター", "無料 インターネット"];

function mentionsInternetAccessTopic(userText) {
  if (!containsJapanese(userText)) return false;
  const lower = userText.toLowerCase();
  return INTERNET_ACCESS_TOPIC_KEYWORDS.some((k) => lower.includes(k.toLowerCase())) || userText.includes("プロバイダ");
}

function internetAccessProposalText() {
  const ja =
    "【インターネット無償化への提案(開発者からの一意見)】\n" +
    "アメリカのGoogle等の取り組みのように、世界中で低所得層へは" +
    "インターネットプロバイダー料金を格安にし、WiFiルーターは無料で" +
    "提供するべきです。さらに、失業時や無職・無収入の人には、" +
    "インターネットプロバイダー・WiFiルーターに加え、スマホ・タブレット・" +
    "PC・プリンターも無料で提供するべきです。";
  const en =
    "[A proposal on making internet access free (the developer's own " +
    "opinion)]\n" +
    "As with initiatives like Google's in the United States, low-income " +
    "households worldwide should be offered heavily discounted internet " +
    "provider rates, with a free WiFi router included. Furthermore, people " +
    "who are unemployed or have no income should be provided, free of " +
    "charge, with an internet provider connection and WiFi router as well " +
    "as a smartphone, tablet, PC, and printer.";
  return `\n\n🌐 ${en}\n\n${ja}`;
}

function internetAccessSuffix(userText) {
  if (!mentionsInternetAccessTopic(userText)) return "";
  return internetAccessProposalText();
}

// 中央省庁・国会議員を民間コンサルティング人材へ入れ替える構想についての
// 話題を検出したら、開発者(ユーザー)の提案を日英併記で案内する
// (ユーザー指示、2026-08-17)。他の提案機能と同じ設計方針の固定テキスト。
const GOV_CONSULTING_TOPIC_KEYWORDS = ["中央省庁", "国会議員", "官僚", "お役所仕事"];

function mentionsGovConsultingTopic(userText) {
  if (!containsJapanese(userText)) return false;
  return GOV_CONSULTING_TOPIC_KEYWORDS.some((k) => userText.includes(k));
}

function govConsultingProposalText() {
  const ja =
    "【行政人材の入れ替えへの提案(開発者からの一意見)】\n" +
    "素人・ド素人の中央省庁職員や国会議員よりも、民間から最先端の専門" +
    "コンサルティングスタッフへ全員入れ替えるべきです。民間コンサル" +
    "ティングはお役所と違い、数年・一年と言わず、ケースバイケースで、" +
    "時には数ヶ月単位でスタッフを入れ替えることもあります。AIに世界中の" +
    "問題とその解決策を集めて政策立案などを提案してもらいながら、" +
    "最終的には最先端の専門コンサルティングスタッフなどの人間が判断した" +
    "方が遥かに優れていると思われます。";
  const en =
    "[A proposal on replacing government staff (the developer's own " +
    "opinion)]\n" +
    "Rather than amateur central-government bureaucrats and lawmakers, " +
    "these roles should be entirely replaced with top-tier professional " +
    "consulting staff from the private sector. Unlike government offices, " +
    "private consulting firms can rotate staff on a case-by-case basis — " +
    "sometimes even every few months — rather than being locked into one- " +
    "or multi-year terms. Having AI gather problems and solutions from " +
    "around the world to help draft policy proposals, with the final " +
    "judgment made by human experts such as top-tier professional " +
    "consultants, would likely produce far better outcomes.";
  return `\n\n🏛️ ${en}\n\n${ja}`;
}

function govConsultingSuffix(userText) {
  if (!mentionsGovConsultingTopic(userText)) return "";
  return govConsultingProposalText();
}

// eガバメント/デジタルガバメントのマルチプラットフォーム化や、国際的な
// 公正貿易・出品手数料引き下げについての話題を検出したら、開発者
// (ユーザー)の提案を日英併記で案内する(ユーザー指示、2026-08-17)。
// 他の提案機能と同じ設計方針の固定テキスト。
const FAIR_TRADE_TOPIC_KEYWORDS = ["eガバメント", "デジタルガバメント", "デジタル・ガバメント", "出品手数料", "公正貿易", "自由貿易"];

function mentionsFairTradeTopic(userText) {
  if (!containsJapanese(userText)) return false;
  return FAIR_TRADE_TOPIC_KEYWORDS.some((k) => userText.includes(k));
}

function fairTradeProposalText() {
  const ja =
    "【eガバメントのマルチプラットフォーム化・国際公正貿易への提案" +
    "(開発者からの一意見)】\n" +
    "eガバメント・デジタルガバメントは、LINEアプリ版・PC版・タブレット版" +
    "があるべきです。追加機能として、オンライン貿易・通販において、" +
    "個人出品者でも総合貿易商社でも、Amazonやメルカリよりも出品手数料を" +
    "下げることに世界中の政府が協力するべきです。戦争よりも公平な貿易の" +
    "方が、公益であり国益であると思われます。";
  const en =
    "[A proposal on multi-platform e-government and fair international " +
    "trade (the developer's own opinion)]\n" +
    "E-government / digital-government services should be available as a " +
    "LINE app, a PC app, and a tablet app. As an additional feature, " +
    "governments around the world should cooperate to lower online-trade " +
    "and e-commerce listing fees — for individual sellers and large " +
    "general trading companies alike — below what Amazon or Mercari " +
    "charge. Fair trade, rather than war, seems like the greater public " +
    "and national benefit.";
  return `\n\n🌏 ${en}\n\n${ja}`;
}

function fairTradeSuffix(userText) {
  if (!mentionsFairTradeTopic(userText)) return "";
  return fairTradeProposalText();
}

function consumptionTaxSuffix(userText) {
  if (!isConsumptionTaxSolutionQuestion(userText)) return "";
  return consumptionTaxProposalText();
}

// 「年収の壁」(103万円/106万円/130万円の壁)の解決策を尋ねる日本語入力を
// 検出したら、開発者(ユーザー)の具体的な政策提案を日英併記で案内する
// (ユーザー指示、2026-08-17)。消費税提案と同じ設計方針の固定テキスト。
const INCOME_WALL_TOPIC_KEYWORDS = ["年収の壁", "103万円の壁", "106万円の壁", "130万円の壁", "百万円の壁", "百数万円の壁"];

function isIncomeWallSolutionQuestion(userText) {
  if (!containsJapanese(userText)) return false;
  const hasTopic = INCOME_WALL_TOPIC_KEYWORDS.some((k) => userText.includes(k));
  if (!hasTopic) return false;
  return CONSUMPTION_TAX_QUESTION_KEYWORDS.some((k) => userText.includes(k));
}

function incomeWallProposalText() {
  const ja =
    "【年収の壁問題への提案(開発者からの一意見)】\n" +
    "年収が百数万円程度の低所得層であっても、累進所得税率のカーブの負担率" +
    "自体は下げつつ、少しずつでも税金を負担して頂くべきです。逆に、裕福層" +
    "(いわゆるお金持ち)の所得への累進課税率のカーブは上げるべきです。" +
    "高額医療費への補助については、収入が無い人へは請求しないようにする" +
    "べきです。社会保険料・所得税・国民健康保険税など全ての税金は、収入が" +
    "ある時に、収入に応じた負担を公平にして頂くべきです。国民健康保険も" +
    "社会保険も、実際に病院に掛かった時の自己負担割合(窓口での何割負担か)" +
    "を、所得に応じて変える(定率ではなく所得連動)べきです。デジタル" +
    "ガバメント化で公務員を大幅にリストラして確保した財源で、失業時には" +
    "住宅ローン・自動車ローン・その他のローンの返済を国が肩代わりして" +
    "代行して支払うべきです。あわせて、半公務員のような雇用の受け皿や、" +
    "ベーシックインカムの導入も検討すべきです。";
  const en =
    "[A proposal on the \"income wall\" problem (the developer's own opinion)]\n" +
    "Even for low-income earners around 1-2 million yen a year, the burden " +
    "rate on the progressive income-tax curve should be lowered, but people " +
    "should still contribute a little tax, gradually. Conversely, the " +
    "progressive tax curve on the wealthy should be raised. High-cost " +
    "medical-expense subsidies should not be billed to people with no " +
    "income. All taxes — social insurance premiums, income tax, national " +
    "health insurance tax — should be fairly proportional to income, only " +
    "charged when there is income. For national health insurance and " +
    "social insurance, the out-of-pocket co-pay ratio actually paid at the " +
    "hospital counter should also scale with income, rather than being a " +
    "flat percentage for everyone. With funds freed up by a major reduction " +
    "in civil-service headcount through digital-government reform, the " +
    "government should take over and pay housing-loan, auto-loan, and other " +
    "loan repayments on behalf of people during unemployment. It should " +
    "also consider a \"semi-civil-servant\" employment safety net and " +
    "introducing a basic income.";
  return `\n\n💰 ${en}\n\n${ja}`;
}

function incomeWallSuffix(userText) {
  if (!isIncomeWallSolutionQuestion(userText)) return "";
  return incomeWallProposalText();
}

// ニュース・時事の話題が出たら、メンテナンス中に収集済みのニュース
// (`aruaru-llm`の`GET /v1/news/latest`、`news_geo.rs`参照)を日英併記で
// 会話に織り込み、「話題についていけるように」する(ユーザー指示、
// 2026-08-17)。`referralsSuffix`と同じ「話題検出→サーバーへ問い合わせ→
// 末尾に追記」の設計。
const NEWS_TOPIC_KEYWORDS_JA = ["ニュース", "時事", "最近の出来事", "今日の話題"];
const NEWS_TOPIC_KEYWORDS_EN = ["news", "current events", "what's happening", "headlines"];

function mentionsNewsTopic(userText) {
  const lower = userText.toLowerCase();
  return NEWS_TOPIC_KEYWORDS_JA.some((k) => userText.includes(k)) || NEWS_TOPIC_KEYWORDS_EN.some((k) => lower.includes(k));
}

async function newsSuffix(userText) {
  if (!mentionsNewsTopic(userText)) return "";
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetch(`${base}/v1/news/latest`);
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      const reason = data.last_error ? ` (${data.last_error})` : "";
      return `\n\n📰 No news collected yet${reason} / まだニュースが収集されていません${reason ? "(" + data.last_error + ")" : ""}。`;
    }
    const country = data.country ? data.country.country : "your area / お住まいの地域";
    const headlines = data.items.slice(0, 3).map((i) => `・${i.title}`).join("\n");
    return `\n\n📰 Recent news from ${country} / ${country}の最近のニュース:\n${headlines}`;
  } catch (err) {
    return "";
  }
}

// 質問者が悩んでいたり悔しがっている様子を検出したら、仮説的・建設的な
// 問いかけの型で解決策提案を促す一言を日英併記で添える(ユーザー指示、
// 2026-08-17)。この提案文自体はopen-englishが用意した固定テキストで
// あり、GPT-2の生成物ではない(消費税提案と同じ設計方針)。
const TROUBLED_KEYWORDS_JA = ["困って", "悔しい", "悩んで", "どうしよう", "分からない", "わからない", "辛い", "しんどい", "うまくいかない"];
const TROUBLED_KEYWORDS_EN = ["i'm stuck", "i am stuck", "frustrated", "i don't know what to do", "it's not working", "i'm struggling", "i am struggling"];

function soundsTroubledOrFrustrated(userText) {
  const lower = userText.toLowerCase();
  return TROUBLED_KEYWORDS_JA.some((k) => userText.includes(k)) || TROUBLED_KEYWORDS_EN.some((k) => lower.includes(k));
}

function troubledEncouragementText() {
  const ja =
    "もし仮に、と仮説的に考えてみましょう。建設的な問いかけとして——" +
    "この問題についての問題点はここが明白で明確で、私はこの様に思うの" +
    "ですが、皆様、解決策をご提案下さい。もしくは、ご意見をお述べ" +
    "下さい。大胆かつ繊細が成功しやすく、小心者はおどおどして失敗" +
    "しやすいものです。";
  const en =
    "Let's try thinking hypothetically — \"suppose that...\" — and ask a " +
    "constructive question. The core issue here seems clear, and here is " +
    "what I think: everyone, please suggest a solution, or share your " +
    "thoughts. Being bold yet " +
    "careful tends to lead to success, while being overly timid tends to " +
    "lead to failure.";
  return `\n\n💡 ${en}\n\n${ja}`;
}

function troubledSuffix(userText) {
  if (!soundsTroubledOrFrustrated(userText)) return "";
  return troubledEncouragementText();
}

// 核抑止・同盟関係についての議論トピック例(ユーザー指示、2026-08-20)。
// `consumptionTaxSuffix`・`troubledSuffix`と同じ「話題検出→固定文を
// 末尾に追記」の設計だが、この提案文は**賛否両論のある政治的テーマに
// ついてのユーザー個人の見解**であり、客観的事実として提示するもの
// ではないことを、日英併記で本文の最初に明示している(政治的に係争の
// ある内容を客観的事実として断定的に提示しないための配慮、CLAUDE.mdの
// HANDOFF参照)。会話練習・議論トピック用の例文としての位置づけ。
const NUCLEAR_DETERRENCE_TOPIC_KEYWORDS_JA = [
  "非核三原則", "核武装", "核抑止", "核攻撃", "核保有", "核の傘", "核兵器",
];
const NUCLEAR_DETERRENCE_TOPIC_KEYWORDS_EN = [
  "nuclear deterrence", "nuclear-armed", "nuclear weapon", "nuclear umbrella",
  "three non-nuclear principles", "non-nuclear principles",
];

function mentionsNuclearDeterrenceTopic(userText) {
  const lower = userText.toLowerCase();
  return (
    NUCLEAR_DETERRENCE_TOPIC_KEYWORDS_JA.some((k) => userText.includes(k)) ||
    NUCLEAR_DETERRENCE_TOPIC_KEYWORDS_EN.some((k) => lower.includes(k))
  );
}

function nuclearDeterrenceOpinionText() {
  const noteJa =
    "※これは賛否両論があるテーマについての、ユーザー様個人の見解です。" +
    "客観的な事実として提示するものではありません。";
  const noteEn =
    "Note: This is one user's personal opinion on a topic with differing " +
    "views, not presented as objective fact.";
  const ja =
    "【議論トピック例(ユーザー様の一意見)】\n" +
    "日本には非核三原則がありますが、国際的には「核武装した国に対しては、" +
    "報復を恐れて核攻撃をしない」という考え方が一般的になっている、という" +
    "見方があります。一国が戦争目的で攻撃を受けた場合、周辺国も一斉に" +
    "報復攻撃をするという意味での同盟関係が世界的に増える兆しがある、" +
    "という見解です。";
  const en =
    "[Discussion topic example (one user's opinion)]\n" +
    "Japan holds the Three Non-Nuclear Principles, but internationally, " +
    "the idea that \"a country will not launch a nuclear attack against " +
    "another nuclear-armed country, for fear of retaliation\" has become " +
    "a common view. There is a perspective that alliances are increasingly " +
    "forming worldwide in the sense that, if one country is attacked for " +
    "purposes of war, its neighboring countries would retaliate together.";
  return `\n\n🗣️ ${noteEn}\n${en}\n\n${noteJa}\n${ja}`;
}

function nuclearDeterrenceSuffix(userText) {
  if (!mentionsNuclearDeterrenceTopic(userText)) return "";
  return nuclearDeterrenceOpinionText();
}

// 正直な開示: 対話ファインチューニングを受けていない素のGPT-2(貪欲
// デコード)は、しばしば同じ文字列("Student: Hello"等)を繰り返す
// 劣化ループに陥る(ユーザー報告「しつこく繰り返すバグ」)。モデル自体を
// 差し替えず、フロントエンド側で「プロンプト構造を再現し始めた箇所
// (次の"Student:"や改行の連続)」を検出して、そこより前だけを表示する
// 応急処置。根本解決(繰り返しペナルティ・専用対話モデルへの差し替え)は
// aruaru-llm側の別対応が必要。
function trimDegenerateRepetition(text) {
  const cutMarkers = ["\nStudent:", "Student:", "\n\n\n"];
  let cutAt = text.length;
  for (const marker of cutMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1 && idx < cutAt) cutAt = idx;
  }
  let trimmed = text.slice(0, cutAt).trim();
  if (!trimmed) trimmed = "(Trainer had nothing more to add — try rephrasing! / 何も返ってきませんでした、言い換えてみてください!)";
  return trimmed;
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  appendMessage("user", text);

  if (isDailyLimitExceeded()) {
    appendMessage("system", await dailyLimitExceededMessage());
    return;
  }

  if (levelEl.value === "maid-cafe-training") {
    recordDailyUsage();
    await advanceTrainingMode(text);
    return;
  }

  try {
    recordDailyUsage();
    const reply = await askTrainer(text);
    appendMessage("trainer", reply);
    speak(reply);
    setStatus(true, "aruaru-llm: connected");
  } catch (err) {
    appendMessage("system", `Error talking to aruaru-llm: ${err.message}`);
    setStatus(false, "aruaru-llm: request failed");
  }
});

levelEl.addEventListener("change", () => {
  if (levelEl.value === "maid-cafe-training") {
    startTrainingMode();
  }
});

apiBaseEl.addEventListener("change", checkHealth);

// 音声入力(ユーザー指示、2026-08-10「声でも文字でも」への対応)。
// ブラウザ標準のWeb Speech API(SpeechRecognition)を使う——対応ブラウザ
// (Chrome系等)でのみ動作する、Firefox等では非対応(正直な開示)。
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognitionImpl) {
  const recognition = new SpeechRecognitionImpl();
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micBtn.addEventListener("click", () => {
    recognition.lang = replyLangEl.value === "ja" ? "ja-JP" : "en-US";
    micBtn.classList.add("listening");
    micBtn.textContent = "🎙 Listening...";
    try {
      recognition.start();
    } catch (err) {
      // 既に開始中の場合など。
    }
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    inputEl.value = transcript;
    formEl.requestSubmit();
  });

  const resetMicButton = () => {
    micBtn.classList.remove("listening");
    micBtn.textContent = "🎙 Speak";
  };
  recognition.addEventListener("end", resetMicButton);
  recognition.addEventListener("error", resetMicButton);
} else {
  micBtn.disabled = true;
  micBtn.title = "Voice input not supported in this browser / このブラウザは音声入力に対応していません";
  micBtn.textContent = "🎙 N/A";
}

checkHealth();
speak("Hi! I'm your English trainer. Choose your level above, then type or press the mic to start! / レベルを選んで、話すか入力してね!");

// aruaru-llmの簡単セットアップ手順モーダル(ユーザー指示、2026-08-10
// 「aruaru-llmのインストールを簡単にして」への対応)。正直な開示:
// このPhase 0段階ではワンクリック・インストーラーではなく、Git+Rust
// ツールチェーンを前提としたコピペ用スクリプトの提示に留まる。
const setupBtn = document.getElementById("setup-btn");
const setupModal = document.getElementById("setup-modal");
const setupClose = document.getElementById("setup-close");
const setupRecheck = document.getElementById("setup-recheck");

setupBtn.addEventListener("click", () => setupModal.classList.remove("hidden"));
setupClose.addEventListener("click", () => setupModal.classList.add("hidden"));
setupModal.addEventListener("click", (e) => {
  if (e.target === setupModal) setupModal.classList.add("hidden");
});
setupRecheck.addEventListener("click", checkHealth);

// aruaru-db & PostgreSQLセットアップ案内(ユーザー指示「open-easy-web
// とPostgreSQLとaruaru-dbをSETUPして頂きますと、将来大量の情報をより
// 高速で処理する事も可能になる予定です」+「SETUPは、なるべく簡単に
// して」への対応)。既存の`aruaru-db`の`install.sh`/`install.ps1`
// (すでに用意されているインストーラースクリプト)を案内するのみ——
// このアプリ自体がPostgreSQLやaruaru-dbを操作・インストールすることは
// ない(正直な開示、`.setup-honest`内に明記済み)。
const aruaruDbSetupBtn = document.getElementById("aruaru-db-setup-btn");
const aruaruDbSetupModal = document.getElementById("aruaru-db-setup-modal");
const aruaruDbSetupClose = document.getElementById("aruaru-db-setup-close");
if (aruaruDbSetupBtn && aruaruDbSetupModal) {
  aruaruDbSetupBtn.addEventListener("click", () => aruaruDbSetupModal.classList.remove("hidden"));
  aruaruDbSetupClose.addEventListener("click", () => aruaruDbSetupModal.classList.add("hidden"));
  aruaruDbSetupModal.addEventListener("click", (e) => {
    if (e.target === aruaruDbSetupModal) aruaruDbSetupModal.classList.add("hidden");
  });
}

// データ・モデル保存先パネル(ユーザー指示「モデル重みの保存先と同期
// バックアップ機能を実装、日英併記UIで」への対応、2026-08-19新設)。
// バックエンドの`/v1/db/info`・`/v1/db/storage-path`・`/v1/db/rsync-backup`・
// `/v1/db/install-rsync`(2026-08-18に実装済み)へ初めて接続するUI。
// 正直な開示: ここでバックアップ・移動できるのは会話履歴・設定の
// SQLite DBのみ——`aruaru-llm`本体のモデル重み(GPT-2系・埋め込み
// モデル)は別リポジトリ`aruaru-llm`自身の`/v1/models/*`APIで管理されて
// おり、このパネルの対象外(パネル内の`.setup-honest`にも明記)。
const dataStorageBtn = document.getElementById("data-storage-btn");
const dataStorageModal = document.getElementById("data-storage-modal");
const dataStorageClose = document.getElementById("data-storage-close");
const dataStorageInfoEl = document.getElementById("data-storage-info");
const dataStorageRefreshBtn = document.getElementById("data-storage-refresh");
const dataStorageNewPathEl = document.getElementById("data-storage-new-path");
const dataStorageRelocateBtn = document.getElementById("data-storage-relocate-btn");
const dataStorageRelocateStatusEl = document.getElementById("data-storage-relocate-status");
const dataStorageRsyncDestEl = document.getElementById("data-storage-rsync-dest");
const dataStorageBackupBtn = document.getElementById("data-storage-backup-btn");
const dataStorageInstallRsyncBtn = document.getElementById("data-storage-install-rsync-btn");
const dataStorageBackupStatusEl = document.getElementById("data-storage-backup-status");

function formatBytes(n) {
  if (typeof n !== "number") return "? / 不明";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function refreshDataStorageInfo() {
  if (!dataStorageInfoEl) return;
  dataStorageInfoEl.textContent = "Loading… / 読み込み中…";
  try {
    const res = await fetch("/v1/db/info");
    const info = await res.json();
    dataStorageInfoEl.textContent =
      `Conversation/settings DB path: ${info.db_path} (${formatBytes(info.db_file_size_bytes)}) ` +
      `| Cloud DB mirror (aruaru-db): ${info.postgres_mirror_configured ? "enabled" : "disabled"} ` +
      `/ 会話・設定DBの保存先: ${info.db_path}(${formatBytes(info.db_file_size_bytes)}) ` +
      `| クラウドDBミラー(aruaru-db): ${info.postgres_mirror_configured ? "有効" : "無効"}`;
  } catch (e) {
    dataStorageInfoEl.textContent = `Failed to load storage info: ${e.message} / 保存先情報の取得に失敗しました: ${e.message}`;
  }
}

if (dataStorageBtn && dataStorageModal) {
  dataStorageBtn.addEventListener("click", () => {
    dataStorageModal.classList.remove("hidden");
    refreshDataStorageInfo();
  });
  dataStorageClose.addEventListener("click", () => dataStorageModal.classList.add("hidden"));
  dataStorageModal.addEventListener("click", (e) => {
    if (e.target === dataStorageModal) dataStorageModal.classList.add("hidden");
  });
}
if (dataStorageRefreshBtn) dataStorageRefreshBtn.addEventListener("click", refreshDataStorageInfo);

if (dataStorageRelocateBtn) {
  dataStorageRelocateBtn.addEventListener("click", async () => {
    const newPath = (dataStorageNewPathEl?.value || "").trim();
    if (!newPath) {
      dataStorageRelocateStatusEl.textContent = "Please enter a destination path. / 移動先のパスを入力してください。";
      return;
    }
    dataStorageRelocateStatusEl.textContent = "Moving… / 移動中…";
    try {
      const res = await fetch("/v1/db/storage-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_path: newPath }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        dataStorageRelocateStatusEl.textContent = `Moved. New path: ${body.new_path} / 移動しました。新しい保存先: ${body.new_path}`;
        refreshDataStorageInfo();
      } else {
        dataStorageRelocateStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
      }
    } catch (e) {
      dataStorageRelocateStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

async function runRsyncBackup() {
  const destination = (dataStorageRsyncDestEl?.value || "").trim();
  if (!destination) {
    dataStorageBackupStatusEl.textContent = "Please enter a backup destination. / バックアップ先を入力してください。";
    return null;
  }
  const res = await fetch("/v1/db/rsync-backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination }),
  });
  return res.json();
}

if (dataStorageBackupBtn) {
  dataStorageBackupBtn.addEventListener("click", async () => {
    dataStorageBackupStatusEl.textContent = "Backing up… / バックアップ中…";
    dataStorageInstallRsyncBtn.classList.add("hidden");
    try {
      const body = await runRsyncBackup();
      if (!body) return;
      if (body.ok) {
        dataStorageBackupStatusEl.textContent = `Backup complete: ${body.detail} / バックアップ完了: ${body.detail}`;
      } else if (body.rsync_missing) {
        dataStorageBackupStatusEl.textContent = `${body.message_en} / ${body.message_ja}`;
        dataStorageInstallRsyncBtn.classList.remove("hidden");
      } else {
        dataStorageBackupStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
      }
    } catch (e) {
      dataStorageBackupStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

if (dataStorageInstallRsyncBtn) {
  dataStorageInstallRsyncBtn.addEventListener("click", async () => {
    dataStorageBackupStatusEl.textContent = "Installing RSync… / RSyncをインストール中…";
    const destination = (dataStorageRsyncDestEl?.value || "").trim();
    try {
      const res = await fetch("/v1/db/install-rsync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(destination ? { retry_destination: destination } : {}),
      });
      const body = await res.json();
      if (body.ok) {
        let msg = `${body.detail}`;
        if (body.backup_ran) msg += ` | Backup also ran: ${body.backup_detail} / バックアップも実行しました: ${body.backup_detail}`;
        dataStorageBackupStatusEl.textContent = msg;
        dataStorageInstallRsyncBtn.classList.add("hidden");
      } else {
        dataStorageBackupStatusEl.textContent = `${body.message_en || body.error} / ${body.message_ja || ""}`;
      }
    } catch (e) {
      dataStorageBackupStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

// 会話履歴DB + aruaru-db/PostgreSQLの同時rsyncバックアップ(ユーザー
// 指示「RSyncで、open-englishのaruaru-dbとpostgresqlを他のデバイスに
// バックアップ同時を可能に、その設定方法も簡単にして」への対応、
// 2026-08-19新設)。宛先を1箇所入力するだけで両方バックアップされる
// (`/v1/db/rsync-backup-all`、既存の`/v1/db/rsync-backup`とは別
// エンドポイント)。
const dataStorageRsyncDestAllEl = document.getElementById("data-storage-rsync-dest-all");
const dataStorageBackupAllBtn = document.getElementById("data-storage-backup-all-btn");
const dataStorageBackupAllStatusEl = document.getElementById("data-storage-backup-all-status");

if (dataStorageBackupAllBtn) {
  dataStorageBackupAllBtn.addEventListener("click", async () => {
    const destination = (dataStorageRsyncDestAllEl?.value || "").trim();
    if (!destination) {
      dataStorageBackupAllStatusEl.textContent = "Please enter a backup destination. / バックアップ先を入力してください。";
      return;
    }
    dataStorageBackupAllStatusEl.textContent = "Backing up both… / 両方バックアップ中…";
    try {
      const res = await fetch("/v1/db/rsync-backup-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      const body = await res.json();
      const sqlite = body.sqlite_backup || {};
      const pg = body.postgres_backup;
      let sqliteMsg;
      if (sqlite.ok) {
        sqliteMsg = `Conversation DB: OK (${sqlite.detail}) / 会話DB: 成功(${sqlite.detail})`;
      } else if (sqlite.rsync_missing) {
        sqliteMsg = `Conversation DB: ${sqlite.message_en} / 会話DB: ${sqlite.message_ja}`;
      } else {
        sqliteMsg = `Conversation DB: failed (${sqlite.error || "unknown"}) / 会話DB: 失敗(${sqlite.error || "不明"})`;
      }
      let pgMsg;
      if (pg === null || pg === undefined) {
        pgMsg = "aruaru-db/PostgreSQL: not configured (OPEN_ENGLISH_DATABASE_URL not set), skipped / aruaru-db/PostgreSQL: 未設定のためスキップしました";
      } else if (pg.ok) {
        pgMsg = `aruaru-db/PostgreSQL: OK (${pg.detail}) / aruaru-db/PostgreSQL: 成功(${pg.detail})`;
      } else if (pg.rsync_or_pg_dump_missing) {
        pgMsg = `aruaru-db/PostgreSQL: ${pg.message_en} / aruaru-db/PostgreSQL: ${pg.message_ja}`;
      } else {
        pgMsg = `aruaru-db/PostgreSQL: failed (${pg.error || "unknown"}) / aruaru-db/PostgreSQL: 失敗(${pg.error || "不明"})`;
      }
      dataStorageBackupAllStatusEl.textContent = `${sqliteMsg}\n${pgMsg}`;
    } catch (e) {
      dataStorageBackupAllStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

// アップデート・ロールバックパネル(ユーザー指示「バージョンアップしたら
// BUGだった場合の為に、簡単にそのBUGのリポジトリだけダウングレード出来る
// ように」への対応、2026-08-20新設)。`GET /v1/updates/history`・
// `POST /v1/updates/downgrade`へ接続する。誇張しないUI: 保持している
// 世代(既定3世代)にしか戻せない旨をボタン一覧の説明文でも明記する。
const updatesHistoryRefreshBtn = document.getElementById("updates-history-refresh");
const updatesHistoryListEl = document.getElementById("updates-history-list");
const updatesDowngradeStatusEl = document.getElementById("updates-downgrade-status");

async function requestDowngrade(component, version) {
  if (!updatesDowngradeStatusEl) return;
  const confirmed = window.confirm(
    `Roll back "${component}" to ${version}? / 「${component}」を${version}へ戻しますか？`
  );
  if (!confirmed) return;
  updatesDowngradeStatusEl.textContent = `Rolling back ${component} to ${version}… / ${component}を${version}へ戻しています…`;
  try {
    const res = await fetch("/v1/updates/downgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component, version }),
    });
    // 正直な開示: componentが"self"の場合、成功するとサーバー自身が
    // 再起動のため接続が切れ、このfetch自体が失敗することがある
    // (index.htmlの.setup-honest注記参照)——それ自体は想定内の挙動。
    const body = await res.json().catch(() => null);
    if (body && body.ok) {
      updatesDowngradeStatusEl.textContent = `Done: ${component} is now ${version}. / 完了: ${component}は${version}になりました。`;
      refreshUpdatesHistory();
    } else if (body) {
      updatesDowngradeStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
    } else {
      updatesDowngradeStatusEl.textContent =
        `Request sent — if this was the app itself, it may be restarting now (reconnect in a few seconds). / ` +
        `リクエストを送信しました——アプリ本体の場合、再起動中の可能性があります(数秒後に再接続してください)。`;
    }
  } catch (e) {
    updatesDowngradeStatusEl.textContent =
      `No response (this can happen if the app itself is restarting): ${e.message} / ` +
      `応答がありません(アプリ本体が再起動中の場合に起こり得ます): ${e.message}`;
  }
}

async function refreshUpdatesHistory() {
  if (!updatesHistoryListEl) return;
  updatesHistoryListEl.textContent = "Loading… / 読み込み中…";
  try {
    const res = await fetch("/v1/updates/history");
    const body = await res.json();
    const components = body.components || [];
    updatesHistoryListEl.innerHTML = "";
    for (const c of components) {
      const row = document.createElement("div");
      row.className = "update-history-row";
      const label = document.createElement("span");
      label.textContent = `${c.component}: ${c.current_version}`;
      row.appendChild(label);
      if (!c.available_downgrades || c.available_downgrades.length === 0) {
        const none = document.createElement("span");
        none.textContent = " (no retained backups yet / まだ保持中のバックアップはありません)";
        row.appendChild(none);
      } else {
        for (const v of c.available_downgrades) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "setup-btn";
          btn.textContent = `⬅ ${v}`;
          // componentはJSON由来のプレーンテキストなのでclosureで直接渡す
          // (innerHTML文字列組み立てを避け、XSSリスクを回避する既存方針)。
          btn.addEventListener("click", () => requestDowngrade(c.component, v));
          row.appendChild(btn);
        }
      }
      updatesHistoryListEl.appendChild(row);
    }
  } catch (e) {
    updatesHistoryListEl.textContent = `Failed to load update history: ${e.message} / アップデート履歴の取得に失敗しました: ${e.message}`;
  }
}

if (updatesHistoryRefreshBtn) updatesHistoryRefreshBtn.addEventListener("click", refreshUpdatesHistory);
// 保存先パネルを開いたタイミングで併せて読み込む(既存のrefreshDataStorageInfoと同様)。
if (dataStorageBtn && dataStorageModal) {
  dataStorageBtn.addEventListener("click", () => refreshUpdatesHistory());
}

// Google Search設定パネル(ユーザー指示「利用者がAPIキーの取得とCOPY
// ペーストが簡単な機能を搭載して」への対応)。値はaruaru-llmの
// `POST /v1/settings/google-search`(メモリ上保持のみ、ディスクへ保存
// しない)へ送るだけで、このフロントエンド自身もlocalStorage等へ
// 保存しない(ページを再読み込みすれば入力欄は空になる、意図的な設計
// ——ブラウザ内にAPIキーを永続化しない)。
const googleSearchBtn = document.getElementById("google-search-settings-btn");
const googleSearchModal = document.getElementById("google-search-modal");
const googleSearchClose = document.getElementById("google-search-close");
const googleSearchApiKeyEl = document.getElementById("google-search-api-key");
const googleSearchCxEl = document.getElementById("google-search-cx");
const googleSearchSaveBtn = document.getElementById("google-search-save");
const googleSearchClearBtn = document.getElementById("google-search-clear");
const googleSearchStatusEl = document.getElementById("google-search-status");

async function refreshGoogleSearchStatus() {
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetch(`${base}/v1/settings/google-search`);
    const data = await res.json();
    googleSearchStatusEl.textContent = data.configured
      ? "✅ Configured / 設定済みです"
      : "⚪ Not configured yet / まだ設定されていません";
  } catch (err) {
    googleSearchStatusEl.textContent = `⚠ Could not check status / 状態を確認できませんでした: ${err.message}`;
  }
}

if (googleSearchBtn && googleSearchModal) {
  googleSearchBtn.addEventListener("click", () => {
    googleSearchModal.classList.remove("hidden");
    refreshGoogleSearchStatus();
  });
  googleSearchClose.addEventListener("click", () => googleSearchModal.classList.add("hidden"));
  googleSearchModal.addEventListener("click", (e) => {
    if (e.target === googleSearchModal) googleSearchModal.classList.add("hidden");
  });
  googleSearchSaveBtn.addEventListener("click", async () => {
    const base = apiBaseEl.value.trim();
    const api_key = googleSearchApiKeyEl.value.trim();
    const cx = googleSearchCxEl.value.trim();
    try {
      const res = await fetch(`${base}/v1/settings/google-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key, cx }),
      });
      const data = await res.json();
      googleSearchStatusEl.textContent = data.configured
        ? "✅ Saved and configured / 保存・設定できました"
        : "⚠ Saved but not configured (empty key/cx?) / 保存しましたが未設定のままです(キー/cxが空?)";
      // 保存後は入力欄をクリアする(画面上に平文で残さない配慮)。
      googleSearchApiKeyEl.value = "";
      googleSearchCxEl.value = "";
    } catch (err) {
      googleSearchStatusEl.textContent = `⚠ Failed to save / 保存に失敗しました: ${err.message}`;
    }
  });
  googleSearchClearBtn.addEventListener("click", async () => {
    const base = apiBaseEl.value.trim();
    try {
      const res = await fetch(`${base}/v1/settings/google-search`, { method: "DELETE" });
      const data = await res.json();
      googleSearchStatusEl.textContent = data.configured
        ? "⚠ Still configured (unexpected) / まだ設定されたままです(想定外)"
        : "🗑 Cleared / 消去しました";
    } catch (err) {
      googleSearchStatusEl.textContent = `⚠ Failed to clear / 消去に失敗しました: ${err.message}`;
    }
  });
}

document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const target = btn.dataset.target;
    const script = document.querySelector(`.setup-script[data-script="${target}"]`).textContent;
    try {
      await navigator.clipboard.writeText(script);
      btn.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 1500);
    } catch (err) {
      btn.textContent = "Copy failed (select manually)";
    }
  });
});

// 資格試験対策コーナー(2026-08-11新設、ユーザー指示「英検1級2級3級4級
// 5級とTOEICとTOEFLの様々なレベル別擬似的模擬試験機能とその資格対策
// コーナーを搭載して」への対応)。
//
// 正直な開示(最重要): ここに収録した問題はすべて本アプリ用に書き
// 下ろしたオリジナル問題であり、英検(実施団体: 日本英語検定協会)・
// TOEIC・TOEFLの実際の過去問(著作権保護対象)は一切使用・転載していない。
// 難易度も各試験の実際のレベルへの大まかな目安に過ぎず、公式の合否・
// スコア予測ではない。サーバー(aruaru-llm)不要・完全にクライアント側の
// JavaScriptのみで完結するため、Android単体版でもそのまま動作する。
const EXAM_PREP_QUESTIONS = {
  eiken5: [
    { q: "This is ___ apple.", choices: ["a", "an", "the", "some"], answer: 1 },
    { q: "I ___ a student.", choices: ["am", "is", "are", "be"], answer: 0 },
    { q: "She ___ to school every day.", choices: ["go", "goes", "going", "gone"], answer: 1 },
    { q: "What ___ your name?", choices: ["is", "are", "am", "be"], answer: 0 },
    { q: "There ___ two cats on the sofa.", choices: ["is", "am", "are", "be"], answer: 2 },
    { q: "___ you like some tea?", choices: ["Do", "Are", "Would", "Is"], answer: 2 },
    { q: "This pen is ___.", choices: ["I", "my", "mine", "me"], answer: 2 },
    { q: "We ___ soccer after school.", choices: ["play", "plays", "playing", "played"], answer: 0 },
    { q: "It is ___ today.", choices: ["sun", "sunny", "sunning", "suns"], answer: 1 },
    { q: "He can ___ the piano.", choices: ["play", "plays", "playing", "played"], answer: 0 },
  ],
  eiken4: [
    { q: "I have ___ finished my homework.", choices: ["already", "yet", "still", "ago"], answer: 0 },
    { q: "He is taller ___ his brother.", choices: ["as", "than", "then", "that"], answer: 1 },
    { q: "If it ___ tomorrow, we will stay home.", choices: ["rain", "rains", "rained", "raining"], answer: 1 },
    { q: "This book is ___ interesting than that one.", choices: ["more", "most", "much", "many"], answer: 0 },
    { q: "She has been living here ___ 2020.", choices: ["for", "since", "during", "at"], answer: 1 },
    { q: "You should ___ your homework before dinner.", choices: ["finish", "finishing", "finished", "finishes"], answer: 0 },
    { q: "My sister is good ___ drawing pictures.", choices: ["at", "in", "on", "for"], answer: 0 },
    { q: "I was ___ tired that I fell asleep quickly.", choices: ["so", "such", "very", "too"], answer: 0 },
    { q: "They will visit Kyoto ___ next week.", choices: ["at", "on", "in", "-"], answer: 3 },
    { q: "This is the fastest way ___ get there.", choices: ["to", "for", "of", "at"], answer: 0 },
  ],
  eiken3: [
    { q: "I have never ___ sushi before.", choices: ["eat", "ate", "eaten", "eating"], answer: 2 },
    { q: "The letter ___ by my sister yesterday.", choices: ["wrote", "was written", "is writing", "writes"], answer: 1 },
    { q: "You ___ study harder to pass the exam.", choices: ["must", "may", "can", "will"], answer: 0 },
    { q: "This is the book ___ I bought last week.", choices: ["who", "which", "whose", "what"], answer: 1 },
    { q: "By the time we arrived, the movie ___ already started.", choices: ["has", "have", "had", "was"], answer: 2 },
    { q: "I'm looking forward ___ you again.", choices: ["to see", "to seeing", "see", "seeing"], answer: 1 },
    { q: "She asked me ___ I had finished my homework.", choices: ["that", "if", "what", "so"], answer: 1 },
    { q: "The cake ___ by my mother was delicious.", choices: ["make", "made", "making", "makes"], answer: 1 },
    { q: "He is one of the ___ students in our class.", choices: ["tall", "taller", "tallest", "most tall"], answer: 2 },
    { q: "Neither Tom ___ his brother likes vegetables.", choices: ["and", "or", "nor", "but"], answer: 2 },
  ],
  "eiken-pre2": [
    { q: "I wish I ___ more time to travel.", choices: ["have", "had", "will have", "having"], answer: 1 },
    { q: "The project, ___ took two years, was finally completed.", choices: ["that", "which", "who", "what"], answer: 1 },
    { q: "Not only ___ he late, but he also forgot his homework.", choices: ["was", "he was", "did", "he did"], answer: 0 },
    { q: "She suggested ___ to the new restaurant.", choices: ["go", "to go", "going", "went"], answer: 2 },
    { q: "It's high time we ___ a decision.", choices: ["make", "made", "will make", "making"], answer: 1 },
    { q: "The more you practice, the ___ you become.", choices: ["good", "better", "best", "well"], answer: 1 },
    { q: "I'd rather you ___ that right now.", choices: ["do", "did", "will do", "doing"], answer: 1 },
    { q: "He apologized for ___ late to the meeting.", choices: ["be", "being", "been", "is"], answer: 1 },
    { q: "No sooner ___ she arrived than the phone rang.", choices: ["had", "did", "has", "does"], answer: 0 },
    { q: "This report is ___ than I expected.", choices: ["far more detailed", "far detailed", "detailed far", "far detail"], answer: 0 },
  ],
  eiken2: [
    { q: "Had I known about the traffic, I ___ earlier.", choices: ["would leave", "would have left", "will leave", "left"], answer: 1 },
    { q: "The committee is composed ___ five members.", choices: ["of", "by", "with", "from"], answer: 0 },
    { q: "Little ___ that his decision would change everything.", choices: ["he knew", "did he know", "he did know", "knew he"], answer: 1 },
    { q: "The report needs to be submitted ___ Friday at the latest.", choices: ["until", "by", "in", "at"], answer: 1 },
    { q: "She is used to ___ up early for work.", choices: ["get", "got", "getting", "have gotten"], answer: 2 },
    { q: "Not until he apologized ___ she forgive him.", choices: ["did", "had", "would", "does"], answer: 0 },
    { q: "The plan, ___ ambitious, is not impossible.", choices: ["although", "despite", "however", "because"], answer: 0 },
    { q: "He is by far the ___ candidate for the job.", choices: ["strong", "stronger", "strongest", "more strong"], answer: 2 },
    { q: "The company is on the verge ___ bankruptcy.", choices: ["of", "for", "to", "with"], answer: 0 },
    { q: "Scarcely ___ the show begun when the lights went out.", choices: ["had", "did", "has", "does"], answer: 0 },
  ],
  eiken1: [
    { q: "The negotiations broke down, ___ leading to a prolonged strike.", choices: ["thereby", "therefore", "wherein", "albeit"], answer: 0 },
    { q: "His argument, though eloquent, was fundamentally ___.", choices: ["flawless", "specious", "unanimous", "verbatim"], answer: 1 },
    { q: "Were it not for her intervention, the deal ___ collapsed.", choices: ["would have", "will have", "had", "has"], answer: 0 },
    { q: "The policy has been criticized as ___ short-term gains over long-term stability.", choices: ["prioritizing", "to prioritize", "prioritize", "prioritized"], answer: 0 },
    { q: "He remained ___ in the face of overwhelming criticism.", choices: ["obstinate", "gregarious", "affable", "candid"], answer: 0 },
    { q: "The committee's decision was met with ___ skepticism.", choices: ["overweening", "unmitigated", "cursory", "fleeting"], answer: 1 },
    { q: "Her ___ remarks defused the tension in the room.", choices: ["conciliatory", "vitriolic", "surreptitious", "insipid"], answer: 0 },
    { q: "The scandal ___ the politician's once-stellar reputation.", choices: ["tarnished", "burnished", "vindicated", "exonerated"], answer: 0 },
    { q: "So ___ was the evidence that the jury reached a verdict in minutes.", choices: ["compelling", "tenuous", "ambiguous", "circumstantial"], answer: 0 },
    { q: "The treaty was signed ___ the objections of several nations.", choices: ["notwithstanding", "hereby", "whereupon", "insofar"], answer: 0 },
  ],
  toeic: [
    { q: "Please submit the report ___ the end of the week.", choices: ["by", "until", "since", "for"], answer: 0 },
    { q: "The meeting has been ___ to next Monday.", choices: ["postponed", "postpone", "postponing", "postpones"], answer: 0 },
    { q: "All employees are required ___ the new safety guidelines.", choices: ["follow", "to follow", "following", "followed"], answer: 1 },
    { q: "Sales figures ___ significantly since the new campaign launched.", choices: ["has increased", "have increased", "increasing", "increase"], answer: 1 },
    { q: "The invoice should be sent directly ___ the accounting department.", choices: ["to", "at", "with", "for"], answer: 0 },
    { q: "We regret ___ you that your application was not successful.", choices: ["inform", "to inform", "informing", "informed"], answer: 1 },
    { q: "The new policy will ___ effect starting next month.", choices: ["take", "make", "do", "have"], answer: 0 },
    { q: "Please find ___ the requested documents.", choices: ["attach", "attaching", "attached", "attachment"], answer: 2 },
    { q: "The conference room is ___ for use until 3 PM.", choices: ["reserved", "reserving", "reserve", "reservation"], answer: 0 },
    { q: "Employees who work overtime will be ___ accordingly.", choices: ["compensate", "compensated", "compensating", "compensation"], answer: 1 },
  ],
  toefl: [
    { q: "The professor's lecture focused on the factors ___ contribute to climate change.", choices: ["that", "who", "whom", "what"], answer: 0 },
    { q: "Despite ___ evidence, the theory remains widely accepted.", choices: ["limit", "limited", "limiting", "limitation"], answer: 1 },
    { q: "The study suggests that early intervention can ___ the long-term effects.", choices: ["mitigate", "mitigating", "mitigation", "mitigated"], answer: 0 },
    { q: "It is essential that every student ___ the assignment on time.", choices: ["submits", "submit", "submitted", "submitting"], answer: 1 },
    { q: "The researchers were unable to draw a definitive conclusion ___ the limited sample size.", choices: ["because", "because of", "although", "despite"], answer: 1 },
    { q: "The lecture will cover several theories, ___ of which remain controversial.", choices: ["most", "much", "almost", "few of"], answer: 0 },
    { q: "Students are expected to submit their essays ___ the deadline.", choices: ["prior to", "prior", "before to", "previous"], answer: 0 },
    { q: "The data ___ analyzed using statistical software.", choices: ["was", "were", "is", "be"], answer: 1 },
    { q: "The professor emphasized the importance of ___ primary sources.", choices: ["consult", "consulting", "consulted", "to consulting"], answer: 1 },
    { q: "Unlike traditional methods, this approach ___ real-time data.", choices: ["incorporate", "incorporates", "incorporating", "incorporated"], answer: 1 },
  ],
  // 日本語能力試験(JLPT)N5〜N1相当のオリジナル模擬問題(ユーザー指示
  // 「日本語検定と日本語能力検定の擬似的な模擬試験機能も搭載」への
  // 対応)。実際のJLPT過去問(著作権保護対象・実施団体: 国際交流基金/
  // 日本国際教育支援協会)は使用していない、本アプリ用の書き下ろし。
  jlptN5: [
    { q: "これ ___ わたしの本です。", choices: ["は", "を", "に", "で"], answer: 0 },
    { q: "きのう、友達 ___ 会いました。(I met a friend yesterday.)", choices: ["を", "に", "は", "も"], answer: 1 },
    { q: "毎朝7時 ___ 起きます。(I get up at 7 every morning.)", choices: ["に", "で", "を", "へ"], answer: 0 },
    { q: "この本は ___ おもしろいです。(This book is very interesting.)", choices: ["とても", "あまり", "すこし", "ぜんぜん"], answer: 0 },
    { q: "水 ___ 一杯ください。(A glass of water, please.)", choices: ["を", "が", "は", "も"], answer: 0 },
    { q: "きょうは天気が ___ です。(The weather is good today.)", choices: ["いい", "いく", "いいだ", "いくて"], answer: 0 },
    { q: "わたしは日本語 ___ 勉強しています。(I am studying Japanese.)", choices: ["を", "が", "に", "で"], answer: 0 },
    { q: "この駅 ___ バスに乗ります。(I take the bus from this station.)", choices: ["を", "に", "から", "まで"], answer: 2 },
    { q: "テーブルの上 ___ りんごがあります。(There is an apple on the table.)", choices: ["に", "で", "を", "へ"], answer: 0 },
    { q: "きのうは学校 ___ 行きませんでした。(I didn't go to school yesterday.)", choices: ["が", "を", "に", "は"], answer: 2 },
  ],
  jlptN4: [
    { q: "電車が来た ___、走りました。(When the train came, I ran.)", choices: ["ので", "とき", "なら", "けど"], answer: 1 },
    { q: "宿題をやらなければ ___。(You must do your homework.)", choices: ["いけません", "いいです", "だめでした", "しました"], answer: 0 },
    { q: "この漢字は ___ 読みますか。(How do you read this kanji?)", choices: ["どう", "なぜ", "いつ", "どこ"], answer: 0 },
    { q: "雨が降って ___、出かけませんでした。(Since it rained, I didn't go out.)", choices: ["いるので", "いたので", "いても", "いたら"], answer: 1 },
    { q: "田中さんは英語が ___ 話せます。(Tanaka can speak English fluently.)", choices: ["じょうずに", "じょうずで", "じょうずだ", "じょうず"], answer: 0 },
    { q: "友達に手紙を ___ もらいました。(I had a friend write me a letter.)", choices: ["書いて", "書く", "書いた", "書き"], answer: 0 },
    { q: "この部屋は使っては ___。(You may not use this room.)", choices: ["いけません", "かまいません", "けっこうです", "しかたありません"], answer: 0 },
    { q: "電気を ___ まま寝てしまいました。(I fell asleep with the lights on.)", choices: ["つけた", "つけて", "ついた", "つく"], answer: 0 },
    { q: "先生に ___ ことがあります。(There's something I want to ask the teacher.)", choices: ["聞きたい", "聞かせたい", "聞かれたい", "聞こえたい"], answer: 0 },
    { q: "この道をまっすぐ ___ と、駅があります。(If you go straight down this road, there's a station.)", choices: ["行く", "行った", "行くの", "行き"], answer: 0 },
  ],
  jlptN3: [
    { q: "この機械は使い方が ___ で、誰でも操作できる。(This machine is easy to use.)", choices: ["簡単", "簡単に", "簡単な", "簡単さ"], answer: 0 },
    { q: "会議は3時から始まる ___ だ。(The meeting is scheduled to start at 3.)", choices: ["こと", "はず", "もの", "つもり"], answer: 1 },
    { q: "彼は忙しい ___ かかわらず、手伝ってくれた。(Despite being busy, he helped.)", choices: ["にも", "だけ", "ほど", "さえ"], answer: 0 },
    { q: "この問題は思った ___ 難しくなかった。(This problem wasn't as hard as I thought.)", choices: ["ほど", "だけ", "まま", "ばかり"], answer: 0 },
    { q: "食べ ___ ば食べるほど、おいしくなる。(The more you eat, the tastier it gets.)", choices: ["れ", "る", "た", "て"], answer: 1 },
    { q: "彼は日本語 ___ 上手に話せる外国人はめずらしい。(A foreigner who can speak Japanese as well as he can is rare.)", choices: ["ほど", "だけ", "ばかり", "さえ"], answer: 0 },
    { q: "この店は安い ___、味もよい。(This shop is not only cheap, the taste is also good.)", choices: ["うえに", "せいで", "おかげで", "ものの"], answer: 0 },
    { q: "彼女が来る ___ で、雰囲気が明るくなった。(Just her coming made the atmosphere brighter.)", choices: ["だけ", "ばかり", "こそ", "さえ"], answer: 0 },
    { q: "仕事が終わり ___、電話がかかってきた。(Just as work was ending, a call came.)", choices: ["次第", "かけて", "がてら", "つつ"], answer: 1 },
    { q: "彼は忙しい ___、家族との時間を大切にしている。(Even though he is busy, he values time with his family.)", choices: ["なりに", "反面", "ながらも", "あまり"], answer: 2 },
  ],
  jlptN2: [
    { q: "彼の話を聞く ___、彼は来月引っ越すらしい。(According to what he said, he's moving next month.)", choices: ["かぎり", "うえで", "かわりに", "かたわら"], answer: 0 },
    { q: "この結果を ___ して、新しい計画を立てる。(Based on this result, we'll make a new plan.)", choices: ["踏まえ", "問わ", "限ら", "際し"], answer: 0 },
    { q: "彼女は忙しい ___、いつも笑顔を絶やさない。(Despite being busy, she always smiles.)", choices: ["にもかかわらず", "におうじて", "にかけては", "につき"], answer: 0 },
    { q: "この薬は熱を下げる ___ 効果がある。(This medicine is effective in lowering fever.)", choices: ["のに", "ものの", "ばかりに", "あげく"], answer: 0 },
    { q: "検討した ___、この案を採用することにした。(After consideration, we decided to adopt this plan.)", choices: ["結果", "反面", "うちに", "ながらに"], answer: 0 },
    { q: "彼の話は具体性 ___、信じにくい。(His story lacks specifics, so it's hard to believe.)", choices: ["に欠け", "をおいて", "にかまけて", "はおろか"], answer: 0 },
    { q: "この製品は安全性を ___ 設計されている。(This product is designed with safety in mind.)", choices: ["重視して", "問わず", "限らず", "際して"], answer: 0 },
    { q: "彼は多忙 ___、趣味の時間を欠かさない。(Despite being busy, he never skips his hobby time.)", choices: ["をきわめる中でも", "につけ", "とあれば", "なくして"], answer: 0 },
    { q: "この結果は予想 ___ 悪かった。(This result was worse than expected.)", choices: ["以上に", "のみならず", "をよそに", "にひきいられ"], answer: 0 },
    { q: "彼女の説明を ___、状況はまだ不明確だ。(Even after hearing her explanation, the situation is still unclear.)", choices: ["聞いても", "聞くなり", "聞くまでもなく", "聞かんばかりに"], answer: 0 },
  ],
  jlptN1: [
    { q: "彼の発言は、誤解を招く ___ ものだった。(His remark was such as to invite misunderstanding.)", choices: ["に足る", "べからざる", "きらいがある", "にすぎない"], answer: 2 },
    { q: "苦労した ___、その成果は大きかった。(Given the hardship endured, the results were significant.)", choices: ["ながらも", "ならでは", "とばかりに", "だけあって"], answer: 3 },
    { q: "彼は謝罪する ___、さらに批判を浴びた。(Rather than apologizing, he drew even more criticism.)", choices: ["なりに", "どころか", "ゆえに", "うえは"], answer: 1 },
    { q: "この規則は、いかなる理由 ___ 変更できない。(This rule cannot be changed for any reason.)", choices: ["があろうとも", "にとどまらず", "をおいて", "にひきいられ"], answer: 0 },
    { q: "彼女の実力 ___、この結果は当然だ。(Given her ability, this result is only natural.)", choices: ["ですら", "とあれば", "であれ", "からすれば"], answer: 3 },
    { q: "彼の功績は、いかに批判されようとも ___ ものだ。(His achievements are undeniable no matter how much he is criticized.)", choices: ["否定するに足る", "否定しがたい", "否定せんばかりの", "否定ならでは"], answer: 1 },
    { q: "この計画は、失敗する ___ 覚悟で進めるべきだ。(This plan should proceed with the resolve that it might fail.)", choices: ["べく", "もの", "ことも", "だに"], answer: 2 },
    { q: "彼は言うに ___、行動でそれを示した。(Rather than saying it, he showed it through action.)", choices: ["及ばず", "至らず", "事欠かず", "たえず"], answer: 0 },
    { q: "彼女は多忙 ___ を極めているが、笑顔を絶やさない。(She is extremely busy, but never stops smiling.)", choices: ["すら", "ゆえ", "こそ", "きわみ"], answer: 3 },
    { q: "この事態は予測 ___ ものであった。(This situation was beyond prediction.)", choices: ["するに足る", "し難い", "してやまない", "せんばかりの"], answer: 1 },
  ],
  // 日本語検定(実施団体: 特定非営利活動法人日本語検定委員会)相当の
  // オリジナル模擬問題(ユーザー指示「日本語検定の擬似的模擬試験も
  // 選択可能にして」への対応)。JLPT(外国語としての日本語能力を測る)
  // とは異なり、日本語検定は**日本語を母語とする話者も対象**に、敬語・
  // 語彙・漢字・言葉の由来等のより深い運用力を問う試験——この違いを
  // 反映し、敬語の使い分け・慣用表現・漢字語彙を中心に出題した。
  // 正直な開示: 実際の日本語検定委員会の過去問は使用していない。
  nihongoKentei3: [
    { q: "お客様が来られたら、こちらへ ___ ください。(尊敬語)", choices: ["ご案内し", "ご案内になって", "案内されて", "案内し"], answer: 1 },
    { q: "「拝見する」は誰の行為を表す謙譲語か。", choices: ["第三者の行為", "相手の行為", "自分の行為", "どちらでもよい"], answer: 2 },
    { q: "「時期尚早」の意味に最も近いものを選べ。", choices: ["予定通り", "もう遅い", "ちょうど良い時期", "まだ早すぎる"], answer: 3 },
    { q: "「愛想」の正しい読み方は?", choices: ["あいそう", "あいそ", "あいしょう", "あいそく"], answer: 1 },
    { q: "上司に資料を渡すとき、最も適切な言い方は?", choices: ["資料をあげます", "資料をやります", "資料をお渡しします", "資料をわたす"], answer: 2 },
    { q: "「おっしゃる」は何の敬語か。", choices: ["謙譲語", "尊敬語", "丁寧語", "美化語"], answer: 1 },
    { q: "「相槎(あいづち)」の正しい意味は?", choices: ["自己主張", "反対意見", "会話中の短い応答・反応", "沈黙"], answer: 2 },
    { q: "「杓子定規」の意味に最も近いものは?", choices: ["常に前向きである", "臨機応変に対応する", "細かいことを気にしない", "一つの基準にこだわり融通がきかない"], answer: 3 },
    { q: "「大は小を兼ねる」の意味として正しいものは?", choices: ["小さいものが有利である", "大きいものは小さい用途にも使える", "大小は関係ない", "大きすぎると使えない"], answer: 1 },
    { q: "電話で相手の名前が分からないとき、最も適切な言い方は?", choices: ["誰ですか", "あなたの名前は?", "失礼ですが、お名前をお伺いしてもよろしいでしょうか", "名前を教えろ"], answer: 2 },
  ],
  nihongoKentei2: [
    { q: "「役不足」の正しい意味は?", choices: ["役目が多すぎる", "能力が役目に足りない", "能力に対して役目が軽すぎる", "役目が無い"], answer: 2 },
    { q: "取引先に自社の資料を送るとき、最も適切な表現は?", choices: ["送信しておく", "お送りします", "送っておきます", "お送りいたします"], answer: 3 },
    { q: "「相手の気持ちを推し量る」を意味する言葉は?", choices: ["邁進する", "忖度する", "逡巡する", "斟酌しない"], answer: 1 },
    { q: "「檄を飛ばす」の意味として正しいものは?", choices: ["激しく励ます・呼びかける", "強く非難する", "静かに諭す", "無視する"], answer: 0 },
    { q: "会議で意見が対立したとき、相手を敬いつつ反論する適切な言い方は?", choices: ["考え直してください", "それは違います", "そんなことはありません", "おっしゃることは分かりますが、私はこう考えます"], answer: 3 },
    { q: "「二の足を踏む」の意味として正しいものは?", choices: ["急いで行動する", "ためらう・決心がつかない", "堂々と進む", "後悔する"], answer: 1 },
    { q: "取引先へお礼のメールを送るとき、最も適切な結びの言葉は?", choices: ["以上です", "またね", "今後ともよろしくお願いいたします", "よろしく"], answer: 2 },
    { q: "「腹を割って話す」の意味として正しいものは?", choices: ["本音で話す", "怒って話す", "簡潔に話す", "遠回しに話す"], answer: 0 },
    { q: "「間髪を容れず」の正しい読み方は?", choices: ["かんぱついれず", "かんはつをいれず", "まがみをいれず", "かんぱつをいれず"], answer: 3 },
    { q: "上司からの指示に対し、承知したことを丁寧に伝える言い方は?", choices: ["了解", "承知いたしました", "オーケーです", "分かった"], answer: 1 },
  ],
  nihongoKentei1: [
    { q: "「言を左右にする」の意味として正しいものは?", choices: ["左右対称に話す", "はっきりと断言する", "はっきりと言わずに態度をあいまいにする", "急に話題を変える"], answer: 2 },
    { q: "「僭越ながら」の使い方として最も適切な場面は?", choices: ["依頼を断るとき", "相手を褒めるとき", "謝罪するとき", "自分の立場を超えて意見を述べる前置き"], answer: 3 },
    { q: "「机上の空論」に近い意味を持つ言葉は?", choices: ["石橋を叩いて渡る", "絵に描いた餅", "背水の陣", "水を得た魚"], answer: 1 },
    { q: "取引先からの厳しい要求に対し、丁重に断る場合の適切な表現は?", choices: ["誠に恐れ入りますが、今回は見送らせていただきます", "できません", "無理です", "それは困ります"], answer: 0 },
    { q: "「琴線に触れる」の正しい意味は?", choices: ["驚かせる", "怒らせる", "困らせる", "深く感動させる"], answer: 3 },
    { q: "「白眉」の意味として正しいものは?", choices: ["最も劣っているもの", "多数の中で最も優れているもの", "最初のもの", "最後のもの"], answer: 1 },
    { q: "重要な取引先との会談を丁重に切り上げる際の適切な表現は?", choices: ["終わりにしましょう", "もう時間がないので", "本日はお時間を頂き、誠にありがとうございました", "また今度話しましょう"], answer: 2 },
    { q: "「不惜身命」の意味として正しいものは?", choices: ["自分の身を惜しまず全力を尽くすこと", "身の安全を最優先すること", "無関心であること", "怠けること"], answer: 0 },
    { q: "「一斑を見て全豹を卜す」の意味に近いものは?", choices: ["詳細を全て確認する", "全体を見て判断する", "何も見ずに判断する", "一部を見て全体を推測する"], answer: 3 },
    { q: "「胸襟を開く」の意味として正しいものは?", choices: ["服のボタンを開ける", "心を開いて本心を話す", "怒りを表す", "無関心を示す"], answer: 1 },
  ],
};

const examPrepBtn = document.getElementById("exam-prep-btn");
const examPrepModal = document.getElementById("exam-prep-modal");
const examPrepClose = document.getElementById("exam-prep-close");
const examPrepExamEl = document.getElementById("exam-prep-exam");
const examPrepQuizEl = document.getElementById("exam-prep-quiz");
const examPrepStartBtn = document.getElementById("exam-prep-start");
const examPrepSubmitBtn = document.getElementById("exam-prep-submit");
const examPrepResultEl = document.getElementById("exam-prep-result");
const examPrepPracticeBtn = document.getElementById("exam-prep-practice-btn");
// 直近の採点で間違えた問題(採点後にトレーナーへの引き継ぎで使う、
// ユーザー指示「英検で採点後の英会話学習をつなぐようにして」への対応)。
let examPrepMissedQuestions = [];

/**
 * Fisher-Yatesで配列をシャッフルした新しい配列を返す(元の配列は変更しない)。
 */
function shuffledCopy(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 直近にrenderExamPrepQuiz()で組み立てた「今回の出題」(問題の出題順・
// 選択肢の並びを毎回シャッフルした結果)を保持する(ユーザー指示
// 「正解位置を問題ごとにランダムに分散させて」「問題も...ランダムに
// 組み合わせて出題」への対応)。scoreExamPrepQuiz/practiceExamPrepWithTrainer
// は元のEXAM_PREP_QUESTIONS(固定の並び)を再度読むのではなく、必ずこの
// 配列を参照する——採点時にシャッフル結果がずれて誤採点にならないため。
let currentExamPrepQuiz = [];

// 各カテゴリの追加問題プール(`exam-prep-questions.json`、サーバーから
// 配信される静的ファイル)。ユーザー指示「問題もJSONやDATABASEなどから
// ランダムに要素を追加してランダムに組み合わせて出題して」への対応——
// app.js内蔵の固定10問だけでなく、このJSONの追加問題も合算したプールから
// 毎回ランダムに一部を抽出して出題する。取得できない場合(オフライン・
// 配信元にファイルが無い等)は内蔵の固定問題のみへ安全にフォールバックする
// (既存の「サービスを止めない」方針を踏襲)。
let examPrepExtraQuestionsPromise = null;
function loadExtraExamPrepQuestions() {
  if (!examPrepExtraQuestionsPromise) {
    examPrepExtraQuestionsPromise = fetch("/exam-prep-questions.json")
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return examPrepExtraQuestionsPromise;
}

// 一回の出題で提示する問題数の上限(プールがこれより多い場合はランダムに
// この件数だけ抽出する、少ない場合はプール全件を出題する)。
const EXAM_PREP_QUESTIONS_PER_ATTEMPT = 10;

async function renderExamPrepQuiz() {
  const exam = examPrepExamEl.value;
  let pool;
  if (exam.startsWith("world:")) {
    // 世界の言語の擬似模擬試験(2026-08-22追加)。問題は
    // `world-language-exams.json`側にあり、既存の英検/JLPT等のプールとは
    // 別系統で読み込む(既存の仕組みは一切変更しない)。
    const code = exam.slice("world:".length);
    const map = await loadWorldExamQuestions();
    pool = (map[code] || []).map((item) => ({
      // レベル(CEFR風の目安)を問題文の頭に付けて表示する。
      q: item.level ? `[${item.level}] ${item.q}` : item.q,
      choices: item.choices,
      answer: item.answer,
    }));
  } else {
    const extra = await loadExtraExamPrepQuestions();
    pool = (EXAM_PREP_QUESTIONS[exam] || []).concat(extra[exam] || []);
  }
  // プール全体からランダムに抽出した上で出題順もシャッフルし、各問の
  // 選択肢の並び(正解の位置)も毎回シャッフルする——正解が常に同じ
  // 位置に来る/常に同じ問題の組み合わせで出題される、という予測可能性を
  // 排除する。
  const picked = shuffledCopy(pool).slice(0, Math.min(EXAM_PREP_QUESTIONS_PER_ATTEMPT, pool.length));
  currentExamPrepQuiz = picked.map((item) => {
    const order = shuffledCopy(item.choices.map((_, ci) => ci));
    return {
      q: item.q,
      choices: order.map((ci) => item.choices[ci]),
      answer: order.indexOf(item.answer),
    };
  });
  examPrepQuizEl.innerHTML = currentExamPrepQuiz
    .map((item, qi) => {
      const choices = item.choices
        .map(
          (choice, ci) =>
            `<label class="exam-prep-choice"><input type="radio" name="exam-prep-q${qi}" value="${ci}" /> ${choice}</label>`
        )
        .join("");
      return `<div class="exam-prep-question"><p>${qi + 1}. ${item.q}</p>${choices}</div>`;
    })
    .join("");
  examPrepResultEl.textContent = "";
  examPrepSubmitBtn.classList.remove("hidden");
  examPrepPracticeBtn.classList.add("hidden");
  examPrepMissedQuestions = [];
}

function scoreExamPrepQuiz() {
  const questions = currentExamPrepQuiz;
  let correct = 0;
  examPrepMissedQuestions = [];
  questions.forEach((item, qi) => {
    const selected = examPrepQuizEl.querySelector(`input[name="exam-prep-q${qi}"]:checked`);
    const isCorrect = selected && Number(selected.value) === item.answer;
    if (isCorrect) {
      correct += 1;
    } else {
      examPrepMissedQuestions.push({ q: item.q, correctChoice: item.choices[item.answer] });
    }
  });
  const total = questions.length;
  examPrepResultEl.textContent =
    `Score / 得点: ${correct} / ${total} — ` +
    "practice questions only, not an official score prediction. / " +
    "練習問題のみです。公式のスコア予測ではありません。";
  // 間違えた問題(または満点なら全問)をトレーナーとの練習へつなげる
  // ボタンを表示する。満点の場合でも復習として練習できるよう、全問を
  // 対象にする。
  examPrepPracticeBtn.classList.toggle("hidden", questions.length === 0);
}

/**
 * 採点結果をメイドカフェ英会話トレーナーへの練習リクエストへ変換し、
 * モーダルを閉じてチャットへ渡す(ユーザー指示「英検で採点後の英会話
 * 学習をつなぐようにして」への対応)。間違えた問題が無ければ、直近に
 * 解いた問題全体を復習練習として渡す。
 */
function practiceExamPrepWithTrainer() {
  const exam = examPrepExamEl.value;
  const examLabel = examPrepExamEl.options[examPrepExamEl.selectedIndex].textContent.trim();
  const questions = currentExamPrepQuiz;
  const targets = examPrepMissedQuestions.length > 0 ? examPrepMissedQuestions : questions.map((item) => ({ q: item.q, correctChoice: item.choices[item.answer] }));
  if (targets.length === 0) return;

  // 世界の言語の擬似模擬試験を受けた後は、その言語のトレーナーへ移行して
  // 学習を途切れさせない(2026-08-22追加、既存のJLPT→日本語教室と同じ流れを
  // 多言語へ拡張したもの)。応答言語は英語との併記(hybrid)にして、母語話者で
  // なくても内容を追えるようにする。
  if (exam.startsWith("world:")) {
    const code = exam.slice("world:".length);
    const lang = worldLanguageByCode(code) || { endonym: code, en: code };
    if (learnTargetEl && learnTargetEl.querySelector(`option[value="world:${code}"]`)) {
      learnTargetEl.value = `world:${code}`;
    }
    if (replyLangEl) replyLangEl.value = "hybrid";
    const worldSummary = targets.map((t, i) => `${i + 1}) "${t.q}" (answer: ${t.correctChoice})`).join(" ");
    examPrepModal.classList.add("hidden");
    inputEl.value =
      `I just took an original ${lang.en} practice quiz (not a real certification exam). ` +
      `Please continue as my ${lang.en} tutor and help me understand and practice these items, ` +
      `explaining in English and giving example sentences in ${lang.en}. ${worldSummary}`;
    formEl.dispatchEvent(new Event("submit", { cancelable: true }));
    return;
  }

  const isJlpt = exam.startsWith("jlpt") || exam.startsWith("nihongoKentei");
  // JLPT受験後は「日本語教室」へ移行する(ユーザー指示「テスト後に
  // 日本語教室に移って、英語と日本語で表示としゃべって」への対応)。
  // learn-targetを日本語へ、reply-langをhybrid(英日併記の表示・
  // 読み上げ、既存のspeakBilingual系の仕組みをそのまま活用)へ切替える。
  if (isJlpt) {
    if (learnTargetEl) learnTargetEl.value = "japanese";
    if (replyLangEl) replyLangEl.value = "hybrid";
  }

  const summary = targets.map((t, i) => `${i + 1}) "${t.q}" (answer: ${t.correctChoice})`).join(" ");
  const requestText = isJlpt
    ? `I just took a ${examLabel} practice quiz. Please switch to Japanese conversation practice and help me understand these in both English and Japanese. ${summary}`
    : `I just took a ${examLabel} practice quiz. Can you help me understand and practice these questions in conversation? ${summary}`;

  examPrepModal.classList.add("hidden");
  inputEl.value = requestText;
  formEl.dispatchEvent(new Event("submit", { cancelable: true }));
}

// ===========================================================================
// 多言語擬似模擬試験 + 追加言語パック選択(2026-08-22新設)
// ---------------------------------------------------------------------------
// ユーザー指示への対応:
//  1.「日本語と英語をデフォルトとして選択できますが、世界中の言語も選択
//     可能です」——`index.html`の`#world-language-banner`で日英併記の大きな
//     案内を表示する。
//  2.「日本語における英検・TOEIC・TOEFLのような、その言語の運用能力を測る
//     擬似模擬試験を世界中の言語で」——`world-language-exams.json`に各言語の
//     オリジナル問題を収録し、資格対策モーダルの試験メニューへ`world:<code>`
//     という値で追加する。
//  3.「受験後の学習継続」——既存の`examPrepMissedQuestions`の仕組みをそのまま
//     再利用し、採点後に間違えた問題を持ってその言語のトレーナーへ移行する。
//  4.「メンテナンス中に言語を追加するか尋ね、チェックで選ばせる。全部を選択
//     ボタンと、日英以外を全部解除するボタンを置く」——`#language-pack-modal`。
//
// **正直な開示(誇張しないこと)**:
//  - 収録しているのはこのアプリ用に書き下ろしたオリジナル問題で、実在の
//    語学資格試験(DELE/DELF/Goethe-Zertifikat/HSK/TOPIK等)の過去問では
//    なく、それらの試験とは一切無関係。試験名も騙らず「運用能力チェック
//    (オリジナル問題)」として提示する。
//  - 収録数は言語ごとに不均一(現状3〜6問)で、CEFR風のレベル表記も
//    大まかな目安に過ぎない。UI上でも問題数をそのまま表示する。
//  - トレーナー(aruaru-llmのGPT-2)は英語中心のモデルであり、対象言語で
//    自然な応答を返す保証は無い——これは既存の既知の制約と同じ。
// ===========================================================================

// 「英語・日本語」は常に有効な既定言語(このリストからは外せない)。
const DEFAULT_LANGUAGE_CODES = ["en", "ja"];
// 追加で有効化した言語コードの保存先(既存の`localStorage`利用パターンに合わせる)。
const ENABLED_LANGUAGES_KEY = "open-english.enabledLanguages";
// メンテナンス中の言語追加案内を既に一度出したかどうか(毎回出すと煩わしいため)。
const LANGUAGE_PROMPT_SHOWN_KEY = "open-english.languagePromptShown";
// 母国語(ネイティブ)と、連続表示・読み上げの順番(2026-08-22の追加要望)。
const NATIVE_LANGUAGE_KEY = "open-english.nativeLanguage";
const LANGUAGE_ORDER_KEY = "open-english.languageOrder";

// ---------------------------------------------------------------------------
// 設定の永続化(ユーザー指示、2026-08-22追加要望「母国語と学びたい言語の設定が
// メンテナンスやアップデートを挟んでも消えず、次回起動時に同じ組み合わせが
// 有効になるように」への対応)。
//
// **調査結果(実装前に既存コードを確認したこと自体の記録)**: 既存の
// `auto-update.js`は、バージョン変化を検出すると`openEnglish.`接頭辞を持つ
// localStorageキーを**全削除**する設計だった(「旧バージョンの痕跡の破棄」)。
// 今回の言語設定のキーは`open-english.`接頭辞のため現状では削除対象外だが、
// 接頭辞の違いという偶然に頼るのは危険なので、`auto-update.js`側へ明示的な
// 保持キー許可リスト(`PRESERVED_KEYS`)を追加した。
//
// **二重保存にする理由**: localStorageはブラウザ側のデータで、ブラウザの
// 「サイトデータを削除」や別プロファイル/別端末では失われる。一方、
// サーバー側のSQLite(`data/open-english.sqlite3`)は、既存の自己更新
// (`self_update.rs`)・ダウングレード処理が`data\`ディレクトリを明示的に
// 退避・復元する設計になっている(=アプリのアップデートで消えない)。
// そこで、書き込みは常に両方へ行い、読み込みは localStorage を一次・
// サーバーDBを二次(localStorageが空の時のフォールバック)とする。
// **正直な開示**: サーバーが起動していない/`file://`直開きの場合は
// DB側の復元は効かず、localStorageのみが頼りになる。
// ---------------------------------------------------------------------------

/** 設定を localStorage とサーバーDB(既存の`POST /v1/db/settings`)の両方へ保存する。 */
function persistSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* localStorageが使えなくてもDB側には保存される(次回はDBから復元) */
  }
  fetch("/v1/db/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => {});
}

/**
 * 起動時に一度だけ実行し、localStorageに無い設定をサーバーDBから復元する
 * (ブラウザ側のデータが消えていても、アップデートを跨いで設定が戻る)。
 */
async function restoreSettingsFromServer() {
  let settings;
  try {
    const res = await fetch("/v1/db/settings", { cache: "no-store" });
    if (!res.ok) return;
    settings = await res.json();
  } catch (e) {
    return; // サーバー未起動・file://等では何もしない(localStorageのみで動作)
  }
  if (!settings || typeof settings !== "object") return;
  [ENABLED_LANGUAGES_KEY, NATIVE_LANGUAGE_KEY, LANGUAGE_ORDER_KEY].forEach((key) => {
    try {
      if (localStorage.getItem(key) === null && typeof settings[key] === "string") {
        localStorage.setItem(key, settings[key]);
      }
    } catch (e) {
      /* 復元できなくてもセッション中の動作は妨げない */
    }
  });
}

function loadNativeLanguage() {
  try {
    return localStorage.getItem(NATIVE_LANGUAGE_KEY) || "ja";
  } catch (e) {
    return "ja";
  }
}

function loadLanguageOrder() {
  try {
    const raw = localStorage.getItem(LANGUAGE_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch (e) {
    return [];
  }
}

let worldLanguages = [];       // /v1/world-languages のサマリ一覧
let worldExamQuestions = {};   // code -> questions[](world-language-exams.jsonから)
// 各言語圏の静的な基礎情報(国旗・国名・首都・主要都市・観光名所・名物・
// 著名人・代表的な企業)。`world-language-regions.json`から読み込む。
// 言語選択UIの国旗/国名表示と、話題ブリーフィングの両方で使う。
let worldRegions = {};

async function loadWorldRegions() {
  try {
    const res = await fetch("world-language-regions.json", { cache: "no-store" });
    const data = await res.json();
    const map = {};
    (data.languages || []).forEach((l) => {
      map[l.code] = l;
    });
    worldRegions = map;
  } catch (e) {
    worldRegions = {};
  }
}

/** 言語コードに対応する国旗絵文字(データが無ければ地球儀で代用)。 */
function languageFlag(code) {
  const r = worldRegions[code];
  return (r && r.flag) || "🌐";
}

/** 言語コードに対応する国名ラベル(日英)。国名でも探せるようにUIへ併記する。 */
function languageCountries(code) {
  const r = worldRegions[code];
  if (!r) return "";
  const ja = r.countries_ja || "";
  const en = r.countries_en || "";
  return ja && en ? `${ja} / ${en}` : ja || en;
}

function loadEnabledLanguages() {
  try {
    const raw = localStorage.getItem(ENABLED_LANGUAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch (e) {
    // localStorageが使えない環境でも他機能を止めない(既存方針)。
    return [];
  }
}

function saveEnabledLanguages(codes) {
  // localStorage(一次)+サーバーSQLite(二次、アップデートを跨いで残る)の
  // 二重保存。詳細はpersistSetting()のdoc参照。
  persistSetting(ENABLED_LANGUAGES_KEY, JSON.stringify(codes));
}

async function fetchWorldLanguages() {
  try {
    const res = await fetch("/v1/world-languages", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.languages) ? data.languages : [];
  } catch (e) {
    // APIが無い配信形態(`file://`直開き等)では静的JSONへフォールバックする。
    try {
      const res2 = await fetch("world-language-exams.json", { cache: "no-store" });
      const data2 = await res2.json();
      return (data2.languages || []).map((l) => ({
        code: l.code, endonym: l.endonym, en: l.en, ja: l.ja, rtl: !!l.rtl,
        authored: !!l.authored, question_count: (l.questions || []).length,
        levels: [...new Set((l.questions || []).map((q) => q.level))].sort(),
      }));
    } catch (e2) {
      return [];
    }
  }
}

let worldExamQuestionsPromise = null;
function loadWorldExamQuestions() {
  if (!worldExamQuestionsPromise) {
    worldExamQuestionsPromise = fetch("world-language-exams.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { languages: [] }))
      .then((data) => {
        const map = {};
        (data.languages || []).forEach((l) => {
          map[l.code] = l.questions || [];
        });
        worldExamQuestions = map;
        return map;
      })
      .catch(() => ({}));
  }
  return worldExamQuestionsPromise;
}

function worldLanguageByCode(code) {
  return worldLanguages.find((l) => l.code === code) || null;
}

function worldLanguageLabel(lang) {
  const levels = (lang.levels || []).join("/");
  return `${lang.endonym} / ${lang.en} / ${lang.ja} — 運用能力チェック(オリジナル問題${levels ? `, ${levels}目安` : ""})`;
}

/**
 * 有効化された言語を「学びたい言語」メニューと資格対策の試験メニューへ反映する。
 * 既定の英語・日本語の項目はそのまま残し、その下へ追加する(既存UIを壊さない)。
 */
function applyEnabledLanguagesToMenus() {
  const enabled = loadEnabledLanguages();

  // 1) 学びたい言語メニュー
  if (learnTargetEl) {
    const previous = learnTargetEl.value;
    learnTargetEl.querySelectorAll("option[data-world-lang]").forEach((o) => o.remove());
    enabled.forEach((code) => {
      const lang = worldLanguageByCode(code);
      if (!lang) return;
      const opt = document.createElement("option");
      opt.value = `world:${code}`;
      opt.dataset.worldLang = code;
      opt.textContent = `${lang.endonym} conversation / ${lang.ja}会話`;
      learnTargetEl.appendChild(opt);
    });
    if (learnTargetEl.querySelector(`option[value="${previous}"]`)) learnTargetEl.value = previous;
  }

  // 2) 資格対策コーナーの試験メニュー(既存の英検/TOEIC/JLPT等はそのまま)
  if (examPrepExamEl) {
    const previous = examPrepExamEl.value;
    examPrepExamEl.querySelectorAll("optgroup[data-world-group]").forEach((g) => g.remove());
    const group = document.createElement("optgroup");
    group.dataset.worldGroup = "1";
    group.label = "世界の言語 / World languages (original practice sets)";
    enabled.forEach((code) => {
      const lang = worldLanguageByCode(code);
      if (!lang || !lang.question_count) return;
      const opt = document.createElement("option");
      opt.value = `world:${code}`;
      opt.textContent = `${worldLanguageLabel(lang)} — ${lang.question_count}問`;
      group.appendChild(opt);
    });
    if (group.children.length > 0) examPrepExamEl.appendChild(group);
    if (examPrepExamEl.querySelector(`option[value="${previous}"]`)) examPrepExamEl.value = previous;
  }

  const note = document.getElementById("exam-prep-world-note");
  if (note) {
    const usable = enabled.filter((c) => (worldLanguageByCode(c) || {}).question_count).length;
    note.textContent = usable > 0
      ? `世界の言語の擬似模擬試験を${usable}言語ぶん有効化しています(オリジナル問題、実在の資格試験とは無関係)。 / ${usable} world-language practice sets enabled (original questions, unaffiliated with any real certification exam).`
      : "世界の言語の模擬試験はまだ有効化されていません。上の「🌐 Languages / 言語を追加」から選べます。 / No world-language practice sets enabled yet — add them from the 🌐 Languages button above.";
  }
}

// --- 追加言語パック選択モーダル -------------------------------------------
const languagePackModal = document.getElementById("language-pack-modal");
const languagePackListEl = document.getElementById("language-pack-list");
const languagePackStatusEl = document.getElementById("language-pack-status");

function renderLanguagePackList() {
  if (!languagePackListEl) return;
  const enabled = new Set(loadEnabledLanguages());
  const defaults = [
    { code: "en", endonym: "English", ja: "英語", fixed: true },
    { code: "ja", endonym: "日本語", ja: "日本語", fixed: true },
  ];
  const defaultRows = defaults
    .map(
      (d) =>
        `<label class="language-pack-item language-pack-default"><input type="checkbox" checked disabled /> ${languageFlag(d.code)} ${d.endonym} / ${d.ja}<span class="language-pack-country">${languageCountries(d.code)}</span> <span class="language-pack-count">(default / 既定)</span></label>`
    )
    .join("");
  // 各行に国旗絵文字と国名(日英)を併記する(ユーザー指示、2026-08-22
  // 「国名でも選びやすいように国名併記+国旗絵文字」への対応)。
  const rows = worldLanguages
    .map((lang) => {
      const checked = enabled.has(lang.code) ? " checked" : "";
      const count = lang.question_count
        ? `${lang.question_count}問 / ${lang.question_count} items`
        : "問題未収録 / no items yet";
      const countries = languageCountries(lang.code);
      return `<label class="language-pack-item"><input type="checkbox" data-lang-code="${lang.code}"${checked} /> ${languageFlag(lang.code)} ${lang.endonym} / ${lang.en} / ${lang.ja}${countries ? `<span class="language-pack-country">${countries}</span>` : ""} <span class="language-pack-count">(${count})</span></label>`;
    })
    .join("");
  languagePackListEl.innerHTML = defaultRows + rows;
  // 個別のON/OFF(利用者が好きな2言語だけ、といった自由な組み合わせ)は
  // 通常のチェックボックスとしてそのまま機能する。ここでは上限のみ制御する。
  languagePackListEl.querySelectorAll("input[data-lang-code]").forEach((box) => {
    box.addEventListener("change", () => {
      enforceLanguageSelectionLimit();
      refreshLanguageDependentUi();
    });
  });
  enforceLanguageSelectionLimit();
  applyLanguagePackFilter();
}

/**
 * 言語一覧の絞り込み(2026-08-22追加)。対応言語が130件と多いため、
 * 言語名(現地語・英語・日本語)と**国名**(日英)・言語コードのいずれでも
 * 部分一致で絞り込めるようにする(ユーザー指示「国名でも選びやすいように」)。
 * チェック状態はDOMを作り直さず`display`の切替だけで隠すため、絞り込んでも
 * 選択済みの言語が失われることはない。
 */
function applyLanguagePackFilter() {
  const input = document.getElementById("language-pack-filter");
  if (!input || !languagePackListEl) return;
  const q = input.value.trim().toLowerCase();
  languagePackListEl.querySelectorAll(".language-pack-item").forEach((item) => {
    const box = item.querySelector("input[data-lang-code]");
    const code = box ? box.dataset.langCode : "";
    const hay = `${item.textContent} ${code}`.toLowerCase();
    item.style.display = !q || hay.includes(q) ? "" : "none";
  });
}

// 同時に選択できる言語数の上限・下限(ユーザー指示、2026-08-22
// 「最低2か国語・最大5か国語、日英含む」)。英語・日本語は常に有効で
// 外せないため、下限2は常に満たされ、追加できるのは最大3言語になる。
const MIN_TOTAL_LANGUAGES = 2;
const MAX_TOTAL_LANGUAGES = 5;
const MAX_ADDITIONAL_LANGUAGES = MAX_TOTAL_LANGUAGES - DEFAULT_LANGUAGE_CODES.length; // = 3

/**
 * 上限に達したら未チェックのチェックボックスをdisabledにする(既にチェック
 * 済みのものは外せるようdisabledにしない)。上限・下限の状況を案内文へ出す。
 */
function enforceLanguageSelectionLimit() {
  if (!languagePackListEl) return;
  const boxes = Array.from(languagePackListEl.querySelectorAll("input[data-lang-code]"));
  const checked = boxes.filter((b) => b.checked);
  const atMax = checked.length >= MAX_ADDITIONAL_LANGUAGES;
  boxes.forEach((b) => {
    b.disabled = atMax && !b.checked;
  });
  if (languagePackStatusEl) {
    const total = DEFAULT_LANGUAGE_CODES.length + checked.length;
    languagePackStatusEl.textContent = atMax
      ? `上限に達しました: 合計${total}言語(最大${MAX_TOTAL_LANGUAGES}言語、英語・日本語を含む)。他の言語を選ぶには、どれかのチェックを外してください。 / Limit reached: ${total} languages (max ${MAX_TOTAL_LANGUAGES} including English and Japanese). Uncheck one to choose another.`
      : `現在 合計${total}言語を選択中(最低${MIN_TOTAL_LANGUAGES}・最大${MAX_TOTAL_LANGUAGES}言語、英語・日本語は常に有効)。 / Currently ${total} languages selected (min ${MIN_TOTAL_LANGUAGES}, max ${MAX_TOTAL_LANGUAGES}; English and Japanese are always on).`;
  }
}

function currentlyCheckedLanguageCodes() {
  if (!languagePackListEl) return [];
  return Array.from(languagePackListEl.querySelectorAll("input[data-lang-code]:checked")).map(
    (el) => el.dataset.langCode
  );
}

function openLanguagePackModal() {
  if (!languagePackModal) return;
  renderLanguagePackList();
  if (languagePackStatusEl) languagePackStatusEl.textContent = "";
  languagePackModal.classList.remove("hidden");
}

if (languagePackModal) {
  const openBtns = ["language-pack-btn", "world-language-banner-btn"];
  openBtns.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", openLanguagePackModal);
  });
  const closeBtn = document.getElementById("language-pack-close");
  if (closeBtn) closeBtn.addEventListener("click", () => languagePackModal.classList.add("hidden"));
  languagePackModal.addEventListener("click", (e) => {
    if (e.target === languagePackModal) languagePackModal.classList.add("hidden");
  });
  const selectAllBtn = document.getElementById("language-pack-select-all");
  if (selectAllBtn) {
    // 「全部を選択」: 合計5言語(英語・日本語+3言語)という上限があるため、
    // 全言語をチェック状態にすることはできない——一覧の先頭から上限ぶんだけ
    // チェックし、その旨をUIで正直に案内する(ユーザー指示「全部を選択の
    // 挙動も上限と矛盾しないように、UI上で分かりやすく説明する」への対応)。
    selectAllBtn.addEventListener("click", () => {
      const boxes = Array.from(languagePackListEl.querySelectorAll("input[data-lang-code]"));
      boxes.forEach((el, i) => {
        el.disabled = false;
        el.checked = i < MAX_ADDITIONAL_LANGUAGES;
      });
      enforceLanguageSelectionLimit();
      refreshLanguageDependentUi();
      if (languagePackStatusEl) {
        languagePackStatusEl.textContent =
          `上限のため、一覧の先頭から${MAX_ADDITIONAL_LANGUAGES}言語のみ選択しました(英語・日本語と合わせて合計${MAX_TOTAL_LANGUAGES}言語)。別の言語にしたい場合はチェックを付け替えてください。 / ` +
          `Because of the ${MAX_TOTAL_LANGUAGES}-language limit, only the first ${MAX_ADDITIONAL_LANGUAGES} languages were selected (plus English and Japanese). Uncheck and pick others if you prefer.`;
      }
    });
  }
  // 「日本語と英語以外の全部を解除」——既定の英語・日本語はそもそも
  // チェックボックス自体が固定(disabled・常時checked)なので、追加言語の
  // チェックだけを外せばユーザーの要望通りの状態になる。
  const clearOthersBtn = document.getElementById("language-pack-clear-others");
  if (clearOthersBtn) {
    clearOthersBtn.addEventListener("click", () => {
      languagePackListEl.querySelectorAll("input[data-lang-code]").forEach((el) => {
        el.checked = false;
      });
      enforceLanguageSelectionLimit();
      refreshLanguageDependentUi();
    });
  }
  const filterInput = document.getElementById("language-pack-filter");
  if (filterInput) filterInput.addEventListener("input", applyLanguagePackFilter);

  // 母国語(ネイティブ)の変更は即座に保存し、並び替えUI・連続表示にも反映する。
  const nativeSelect = document.getElementById("native-language");
  if (nativeSelect) {
    nativeSelect.addEventListener("change", () => {
      persistSetting(NATIVE_LANGUAGE_KEY, nativeSelect.value);
      renderLanguageOrderList();
      renderMultiSpeakOutput();
    });
  }

  const saveBtn = document.getElementById("language-pack-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const codes = currentlyCheckedLanguageCodes();
      saveEnabledLanguages(codes);
      applyEnabledLanguagesToMenus();
      if (languagePackStatusEl) {
        languagePackStatusEl.textContent = `保存しました(${DEFAULT_LANGUAGE_CODES.length + codes.length}言語有効: 英語・日本語 + ${codes.length}言語)。 / Saved: English, Japanese + ${codes.length} additional language(s).`;
      }
      // 言語を選び終えた直後に話題ブリーフィング(情報収集)を始める
      // (ユーザー指示、2026-08-22「母国語と学びたい言語を選択した後、
      // メンテナンス中の案内を出しつつ情報を集める」への対応)。
      languagePackModal.classList.add("hidden");
      runTopicBriefing();
    });
  }
}

// --- 多言語の連続表示・連続読み上げ ---------------------------------------
// ユーザー指示(2026-08-22)への対応: 選択した2〜5か国語(英語・日本語を含む)
// について、同じ内容を選択順に画面へ表示しながら音声で順番に読み上げる。
// 表示文はコピー&ペースト可能なテキスト(`user-select`を妨げない通常のDOM
// +readonlyのtextarea)とし、ファイルダウンロード保存・DB保存にも対応する。
// 何度でも再生し直せるよう、全体の再生ボタンと言語ごとの再生ボタンを置く。
//
// **正直な開示**: 音声は既存機能と同じブラウザ内蔵のWeb Speech APIを流用
// しているだけで、独自の音声合成エンジンは持たない——その言語の音声が
// OS/ブラウザに無ければ、表示はできても読み上げは別言語の声になるか
// 無音でスキップされる。
const multiSpeakPhraseEl = document.getElementById("multi-speak-phrase");
const multiSpeakOutputEl = document.getElementById("multi-speak-output");
const multiSpeakStatusEl = document.getElementById("multi-speak-status");
let multiSpeakPhrases = [];

// 言語コード -> Web Speech APIへ渡すBCP-47タグ(声の選択に使う)。
const SPEECH_LANG_TAGS = {
  en: "en-US", ja: "ja-JP", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT",
  pt: "pt-PT", nl: "nl-NL", sv: "sv-SE", no: "nb-NO", da: "da-DK", fi: "fi-FI",
  pl: "pl-PL", cs: "cs-CZ", ro: "ro-RO", ru: "ru-RU", uk: "uk-UA", el: "el-GR",
  tr: "tr-TR", ar: "ar-SA", he: "he-IL", fa: "fa-IR", hi: "hi-IN", bn: "bn-BD",
  id: "id-ID", ms: "ms-MY", vi: "vi-VN", th: "th-TH", tl: "fil-PH", zh: "zh-CN",
  ko: "ko-KR", sw: "sw-KE",
};

async function loadMultiSpeakPhrases() {
  try {
    const res = await fetch("world-language-phrases.json", { cache: "no-store" });
    const data = await res.json();
    multiSpeakPhrases = data.phrases || [];
  } catch (e) {
    multiSpeakPhrases = [];
  }
  if (multiSpeakPhraseEl) {
    multiSpeakPhraseEl.innerHTML = multiSpeakPhrases
      .map((p) => `<option value="${p.id}">${p.label_ja} / ${p.label_en}</option>`)
      .join("");
  }
}

/**
 * 現在の再生対象言語(英語・日本語 + チェック済みの追加言語、最大5言語)。
 * モーダルが開いていればチェックボックスの「今の状態」を、閉じていれば
 * 保存済みの設定を使う。
 */
function multiSpeakTargetCodes() {
  const additional =
    languagePackModal && !languagePackModal.classList.contains("hidden")
      ? currentlyCheckedLanguageCodes()
      : loadEnabledLanguages();
  const active = DEFAULT_LANGUAGE_CODES.concat(additional).slice(0, MAX_TOTAL_LANGUAGES);
  // 母国語がまだインストール(有効化)されていない場合も、必ず読み上げ対象に
  // 含める(合計最大6項目 = 英語・日本語+追加3言語+母国語1)。
  const native = loadNativeLanguage();
  const withNative = active.includes(native) ? active : active.concat([native]);
  return orderActiveLanguages(withNative);
}

/**
 * 有効な言語を、利用者が保存した並び順(`LANGUAGE_ORDER_KEY`)に従って
 * 並べ替える(ユーザー指示、2026-08-22追加要望「連続表示・読み上げの
 * 順番を好きな順に並び替えられるように、その順番も保存する」への対応)。
 *
 * 保存された順番に含まれない言語(後から追加した言語)は末尾へ回す。
 * 並び順がまだ保存されていない場合は、母国語を先頭に置いた既定順にする
 * ——母語での説明を最初に聞きたい、という自然な期待に合わせるため。
 */
function orderActiveLanguages(active) {
  const saved = loadLanguageOrder().filter((code) => active.includes(code));
  const rest = active.filter((code) => !saved.includes(code));
  if (saved.length === 0) {
    const native = loadNativeLanguage();
    return active.includes(native) ? [native].concat(active.filter((c) => c !== native)) : active;
  }
  return saved.concat(rest);
}

function languageDisplayName(code) {
  if (code === "en") return "English / 英語";
  if (code === "ja") return "日本語 / Japanese";
  const lang = worldLanguageByCode(code);
  return lang ? `${lang.endonym} / ${lang.ja}` : code;
}

/**
 * 母国語セレクトを**全対応言語**(英語・日本語+38言語)で組み立てる。
 *
 * 母国語は「学びたい言語」とは別の軸なので、インストール済み(有効化済み)の
 * 言語に限定しない——母語がまだ有効化されていない場合は、連続表示・読み上げ
 * の対象へ自動的に1行追加される(合計最大6項目、ユーザー指示2026-08-22
 * 「母国語+学びたい言語〈最大5つ〉=合計最大6項目」への対応)。
 */
function renderNativeLanguageSelect() {
  const el = document.getElementById("native-language");
  if (!el) return;
  const all = DEFAULT_LANGUAGE_CODES.concat(worldLanguages.map((l) => l.code));
  const current = loadNativeLanguage();
  el.innerHTML = all.map((code) => `<option value="${code}">${languageDisplayName(code)}</option>`).join("");
  el.value = all.includes(current) ? current : "ja";
  if (el.value !== current) persistSetting(NATIVE_LANGUAGE_KEY, el.value);
}

/**
 * 並び替えUIを描画する。ユーザー指示(2026-08-22追加要望)により、順番の
 * 指定方法を**3系統**用意し、いずれを操作しても互いに連動させる:
 *  (a) 数値入力欄(1〜N)への直接入力
 *  (b) 1(左端)〜N(右端)を横に並べたラジオボタン
 *  (c) ▲▼ボタン(元々の実装、タッチ操作でそのまま使えるので残す)
 *
 * **重複の扱い**: 同じ順番を2つの言語に指定できないようにするため、
 * 「入れ替え(swap)」方式を採る——エラーを出して操作を拒否するのではなく、
 * 指定された位置に既にいる言語と席を交換する。UIが行き止まりにならず、
 * 「3番にしたい」という意図がそのまま1操作で通るため。
 */
function renderLanguageOrderList() {
  const listEl = document.getElementById("language-order-list");
  if (!listEl) return;
  const codes = multiSpeakTargetCodes();
  const native = loadNativeLanguage();
  const total = codes.length;
  listEl.innerHTML = codes
    .map((code, i) => {
      const radios = codes
        .map(
          (_, n) =>
            `<label class="language-order-radio"><input type="radio" name="lang-order-${code}" value="${n + 1}" data-code="${code}"${n === i ? " checked" : ""} /> ${n + 1}</label>`
        )
        .join("");
      return `
      <div class="language-order-item" data-code="${code}">
        <span class="language-order-name">${code === native ? "🏠 " : ""}${languageDisplayName(code)}</span>
        <label class="language-order-number">順番 / order:
          <input type="number" min="1" max="${total}" step="1" value="${i + 1}" data-code="${code}" class="language-order-input" />
        </label>
        <span class="language-order-radios">${radios}</span>
        <button type="button" class="setup-btn language-order-up" data-code="${code}" ${i === 0 ? "disabled" : ""} aria-label="上へ / move up">▲</button>
        <button type="button" class="setup-btn language-order-down" data-code="${code}" ${i === total - 1 ? "disabled" : ""} aria-label="下へ / move down">▼</button>
      </div>`;
    })
    .join("");
  listEl.querySelectorAll(".language-order-up, .language-order-down").forEach((btn) => {
    btn.addEventListener("click", () => moveLanguageInOrder(btn.dataset.code, btn.classList.contains("language-order-up") ? -1 : 1));
  });
  // 数値入力欄・ラジオボタンのどちらを操作しても同じ`setLanguageOrderPosition`を
  // 通るため、再描画によって両方の表示が必ず同期する(片方だけずれることが無い)。
  listEl.querySelectorAll(".language-order-input").forEach((input) => {
    input.addEventListener("change", () => setLanguageOrderPosition(input.dataset.code, Number(input.value)));
  });
  listEl.querySelectorAll('.language-order-radio input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) setLanguageOrderPosition(radio.dataset.code, Number(radio.value));
    });
  });
}

/**
 * ある言語を「1始まりのposition番目」へ移動する(既にそこにいる言語とは入れ替え)。
 * 数値入力欄・ラジオボタンの双方から呼ばれる共通の入口。
 */
function setLanguageOrderPosition(code, position) {
  const codes = multiSpeakTargetCodes();
  const target = Math.round(position);
  const from = codes.indexOf(code);
  // 範囲外・不正な値は黙って無視し、現在の並びで描画し直す(入力欄の値が
  // 元に戻るだけで、UIが壊れた状態にはならない)。
  if (from < 0 || !Number.isFinite(target) || target < 1 || target > codes.length) {
    renderLanguageOrderList();
    return;
  }
  const to = target - 1;
  if (to === from) return;
  [codes[from], codes[to]] = [codes[to], codes[from]];
  persistSetting(LANGUAGE_ORDER_KEY, JSON.stringify(codes));
  renderLanguageOrderList();
  renderMultiSpeakOutput();
}

/** 言語の選択状態が変わったときに、母国語セレクト・並び替えUI・連続表示を一括で更新する。 */
function refreshLanguageDependentUi() {
  renderNativeLanguageSelect();
  renderLanguageOrderList();
  renderMultiSpeakOutput();
}

function moveLanguageInOrder(code, delta) {
  const codes = multiSpeakTargetCodes();
  const i = codes.indexOf(code);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= codes.length) return;
  [codes[i], codes[j]] = [codes[j], codes[i]];
  // 並べ替えた結果をそのまま設定として保存する(次回起動時も同じ順番)。
  persistSetting(LANGUAGE_ORDER_KEY, JSON.stringify(codes));
  renderLanguageOrderList();
  renderMultiSpeakOutput();
}

function multiSpeakLines() {
  const phrase = multiSpeakPhrases.find((p) => p.id === (multiSpeakPhraseEl ? multiSpeakPhraseEl.value : ""));
  if (!phrase) return [];
  return multiSpeakTargetCodes()
    .map((code) => {
      const lang = worldLanguageByCode(code);
      const name = code === "en" ? "English / 英語" : code === "ja" ? "日本語 / Japanese" : lang ? `${lang.endonym} / ${lang.ja}` : code;
      return { code, name, text: (phrase.text || {})[code] || "" };
    })
    .filter((row) => row.text);
}

function renderMultiSpeakOutput() {
  if (!multiSpeakOutputEl) return;
  const lines = multiSpeakLines();
  if (lines.length < MIN_TOTAL_LANGUAGES) {
    multiSpeakOutputEl.innerHTML = `<p class="setup-note">この言語の訳文がまだ揃っていません(最低${MIN_TOTAL_LANGUAGES}言語必要です)。 / Not enough translated lines yet (minimum ${MIN_TOTAL_LANGUAGES}).</p>`;
    return;
  }
  multiSpeakOutputEl.innerHTML = lines
    .map(
      (row, i) => `
      <div class="multi-speak-row" data-code="${row.code}">
        <div class="multi-speak-row-head">
          <span class="multi-speak-lang">${i + 1}. ${row.name}</span>
          <button type="button" class="setup-btn multi-speak-row-play" data-code="${row.code}">🔁 この言語だけ再生 / Play this one</button>
        </div>
        <textarea class="multi-speak-text" readonly rows="2">${row.text}</textarea>
      </div>`
    )
    .join("");
  multiSpeakOutputEl.querySelectorAll(".multi-speak-row-play").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = lines.find((r) => r.code === btn.dataset.code);
      if (row) speakOneLanguage(row);
    });
  });
}

function speakOneLanguage(row) {
  if (!("speechSynthesis" in window)) {
    if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "このブラウザは音声読み上げに対応していません。 / This browser does not support speech synthesis.";
    return;
  }
  window.speechSynthesis.cancel();
  const tag = SPEECH_LANG_TAGS[row.code] || row.code;
  const utter = new SpeechSynthesisUtterance(row.text);
  utter.lang = tag;
  const voice = pickVoice(tag, false);
  if (voice) utter.voice = voice;
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}

/**
 * 選択言語の順に、画面表示をハイライトしながら連続して読み上げる。
 * 何度でも呼べる(呼ぶたびに先頭からやり直す)。
 */
function playMultiSpeakSequence() {
  const lines = multiSpeakLines();
  renderMultiSpeakOutput();
  if (lines.length < MIN_TOTAL_LANGUAGES) return;
  if (!("speechSynthesis" in window)) {
    if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "このブラウザは音声読み上げに対応していないため、表示のみ行いました。 / Speech synthesis is unavailable in this browser; text is displayed only.";
    return;
  }
  window.speechSynthesis.cancel();
  const rows = Array.from(multiSpeakOutputEl.querySelectorAll(".multi-speak-row"));
  lines.forEach((line, i) => {
    const tag = SPEECH_LANG_TAGS[line.code] || line.code;
    const utter = new SpeechSynthesisUtterance(line.text);
    utter.lang = tag;
    const voice = pickVoice(tag, false);
    if (voice) utter.voice = voice;
    utter.rate = 0.9;
    utter.onstart = () => {
      rows.forEach((r) => r.classList.remove("speaking-now"));
      if (rows[i]) rows[i].classList.add("speaking-now");
    };
    utter.onend = () => {
      if (i === lines.length - 1) {
        rows.forEach((r) => r.classList.remove("speaking-now"));
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = `${lines.length}言語の再生が終わりました。何度でも再生できます。 / Finished reading ${lines.length} languages. You can replay as many times as you like.`;
      }
    };
    window.speechSynthesis.speak(utter);
  });
  if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = `${lines.length}言語を順番に再生しています… / Reading ${lines.length} languages in order…`;
}

function multiSpeakPlainText() {
  const phrase = multiSpeakPhrases.find((p) => p.id === (multiSpeakPhraseEl ? multiSpeakPhraseEl.value : ""));
  const header = phrase ? `# ${phrase.label_ja} / ${phrase.label_en}` : "# open-english multilingual phrases";
  return [header].concat(multiSpeakLines().map((row) => `${row.name}: ${row.text}`)).join("\n");
}

if (multiSpeakOutputEl) {
  const playBtn = document.getElementById("multi-speak-play");
  const replayBtn = document.getElementById("multi-speak-replay");
  const stopBtn = document.getElementById("multi-speak-stop");
  if (playBtn) playBtn.addEventListener("click", playMultiSpeakSequence);
  if (replayBtn) replayBtn.addEventListener("click", playMultiSpeakSequence);
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      multiSpeakOutputEl.querySelectorAll(".multi-speak-row").forEach((r) => r.classList.remove("speaking-now"));
      if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "停止しました。 / Stopped.";
    });
  }
  if (multiSpeakPhraseEl) multiSpeakPhraseEl.addEventListener("change", renderMultiSpeakOutput);

  const copyBtn = document.getElementById("multi-speak-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = multiSpeakPlainText();
      try {
        await navigator.clipboard.writeText(text);
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "クリップボードへコピーしました。 / Copied to the clipboard.";
      } catch (e) {
        // クリップボードAPIが使えない場合でも、各行のtextareaから手動で
        // 選択・コピーできる(readonlyにしているだけで選択は妨げていない)。
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "自動コピーに失敗しました。各行のテキストを手動で選択してコピーしてください。 / Automatic copy failed; please select the text manually and copy it.";
      }
    });
  }

  const downloadBtn = document.getElementById("multi-speak-download");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const blob = new Blob([multiSpeakPlainText()], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `open-english-phrases-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "テキストファイルとして保存しました。 / Saved as a text file.";
    });
  }

  // DB保存は既存の会話履歴API(`POST /v1/db/history`、2026-08-18実装済みの
  // SQLite永続化)をそのまま使う——新しいDB基盤は作らない(ユーザー指示
  // 「既存の永続化パターンに合わせること」への対応)。
  const saveDbBtn = document.getElementById("multi-speak-save-db");
  if (saveDbBtn) {
    saveDbBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/v1/db/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "multilingual-phrase", content: multiSpeakPlainText() }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "データベース(ローカルSQLite)へ保存しました。 / Saved to the local SQLite database.";
      } catch (e) {
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = `データベースへの保存に失敗しました(${e.message})。ダウンロード保存やコピーはそのまま使えます。 / Saving to the database failed (${e.message}); download and copy still work.`;
      }
    });
  }
}

// --- 話題ブリーフィング(言語選択後の情報収集) ---------------------------
// ユーザー指示(2026-08-22): 母国語と学びたい言語を選んだ後、「メンテナンス中」
// の案内を出しつつ、選んだ言語(特に一番上の言語)の地域について
// ニュース・首都・主要都市・観光名所・名物・有名人・有名な企業を集めて、
// その言語での話題に少しでもついていけるようにする。
//
// **技術的な実現方法(実装前に調査した結果)**:
//  - ニュース: **実際にインターネットへ接続して取得している**。サーバー側
//    (`GET /v1/region-news`)がGoogleニュースの公開RSSをその都度取得し、
//    **見出しのみ**を返す(記事本文は取得も転載もしない——著作権への配慮)。
//    オフライン等で取得できない場合は`ok:false`が返り、UIもその旨を正直に表示する。
//  - 首都・主要都市・観光名所・名物・有名人・企業: `world-language-regions.json`
//    (本アプリ用に書いた静的な基礎知識)をサーバー側`GET /v1/region-info`が返す。
//    **リアルタイム情報ではなく、古くなり得る**ことをUIにも明記する。
//  - `aruaru-llm`(GPT-2ベース)に事実を生成させる方式は採らなかった——
//    もっともらしい嘘(ハルシネーション)を「情報収集の結果」として提示する
//    ことになり、このプロジェクトの正直な開示方針に反するため。
//
// **待機UIについて**: ユーザー指示は「2分程度のメンテナンス表示」だったが、
// 実際の処理は通常数秒で終わる。実処理より長く待たせる演出は利用者の時間を
// 無駄にするため行わず、**実際の進捗をそのまま見せる**プログレス表示にした
// (指示中の「実際の処理時間に合わせて実装してよい」に従う)。
const briefingModal = document.getElementById("briefing-modal");
const briefingProgressEl = document.getElementById("briefing-progress");
const briefingBodyEl = document.getElementById("briefing-body");
let lastBriefingText = "";

function briefingList(title, items) {
  if (!items || items.length === 0) return "";
  const li = items.map((x) => `<li>${escapeHtmlText(x)}</li>`).join("");
  return `<div class="briefing-section"><h4>${title}</h4><ul>${li}</ul></div>`;
}

/** 外部(RSS)由来のテキストを含むため、HTMLとして解釈させない(既存のXSS回避方針)。 */
function escapeHtmlText(s) {
  const div = document.createElement("div");
  div.textContent = String(s);
  return div.innerHTML;
}

async function runTopicBriefing() {
  if (!briefingModal) return;
  briefingModal.classList.remove("hidden");
  briefingBodyEl.innerHTML = "";
  const codes = multiSpeakTargetCodes();
  const top = codes[0];
  const steps = [];
  const setProgress = (done, total, label) => {
    briefingProgressEl.innerHTML =
      `<p class="briefing-maintenance">🛠️ ただいま情報を集めています(メンテナンス中)… ${done}/${total} 完了 — ${escapeHtmlText(label)}<br />` +
      `Gathering topic information (maintenance in progress)… ${done}/${total} done — ${escapeHtmlText(label)}</p>` +
      `<progress max="${total}" value="${done}"></progress>`;
  };
  const total = codes.length + 1; // 各言語の基礎情報 + 先頭言語のニュース
  let done = 0;
  setProgress(done, total, "start / 開始");

  // 1) 先頭の言語のニュース見出し(実際にインターネットから取得)
  let newsHtml = "";
  try {
    const res = await fetch(`/v1/region-news?lang=${encodeURIComponent(top)}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok && (data.headlines || []).length > 0) {
      newsHtml =
        briefingList(`📰 最新ニュースの見出し(${languageDisplayName(top)}) / Latest headlines`, data.headlines) +
        `<p class="setup-note">${escapeHtmlText(data.disclosure_ja || "")}<br />${escapeHtmlText(data.disclosure_en || "")}</p>`;
    } else {
      newsHtml =
        `<div class="briefing-section"><h4>📰 最新ニュース / Latest news</h4>` +
        `<p class="setup-note">今回は取得できませんでした(オフラインか、配信元へ到達できませんでした): ${escapeHtmlText(data.error || "unknown")}。<br />` +
        `Could not fetch headlines this time (offline or the feed was unreachable).</p></div>`;
    }
  } catch (e) {
    newsHtml =
      `<div class="briefing-section"><h4>📰 最新ニュース / Latest news</h4>` +
      `<p class="setup-note">取得に失敗しました(${escapeHtmlText(e.message)})。 / Fetching headlines failed.</p></div>`;
  }
  done += 1;
  setProgress(done, total, "news / ニュース");

  // 2) 各言語の静的な基礎情報(先頭の言語を最初に、いちばん詳しく表示する)
  let infoHtml = "";
  for (const code of codes) {
    let region = null;
    try {
      const res = await fetch(`/v1/region-info?lang=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) region = data.region;
    } catch (e) {
      region = worldRegions[code] || null; // APIが無い配信形態でも静的JSONの内容で代替
    }
    if (!region) region = worldRegions[code] || null;
    done += 1;
    setProgress(done, total, languageDisplayName(code));
    if (!region) {
      infoHtml += `<div class="briefing-lang"><h3>${languageFlag(code)} ${escapeHtmlText(languageDisplayName(code))}</h3><p class="setup-note">この言語圏の基礎データはまだ作成されていません。 / No background data has been written for this language yet.</p></div>`;
      continue;
    }
    const isTop = code === top;
    // 詳細データ(首都以下)がまだ書かれていない言語は、空欄を並べるのではなく
    // 「未作成である」ことを正直に表示する(誇張しない既存方針)。
    if (!region.capital) {
      infoHtml +=
        `<div class="briefing-lang${isTop ? " briefing-lang-top" : ""}">` +
        `<h3>${languageFlag(code)} ${escapeHtmlText(languageDisplayName(code))}${isTop ? " <span class=\"briefing-top-badge\">最優先 / top</span>" : ""}</h3>` +
        `<p><strong>国・地域 / Region:</strong> ${escapeHtmlText(region.regions || "")}</p>` +
        `<p class="setup-note">この言語圏の詳細データ(首都・主要都市・観光名所・名物・著名人・企業)はまだ作成されていません——現在は国旗と国名のみ登録されています。<br />` +
        `Detailed background data (capital, cities, sights, food, people, companies) has not been written for this language yet; only its flag and country label are registered so far.</p>` +
        `</div>`;
      continue;
    }
    const companies = (region.companies || []).map((c) => `${c.name} — ${c.about_ja} / ${c.about_en}`);
    infoHtml +=
      `<div class="briefing-lang${isTop ? " briefing-lang-top" : ""}">` +
      `<h3>${languageFlag(code)} ${escapeHtmlText(languageDisplayName(code))}${isTop ? " <span class=\"briefing-top-badge\">最優先 / top</span>" : ""}</h3>` +
      `<p><strong>国・地域 / Region:</strong> ${escapeHtmlText(region.regions || "")}<br />` +
      `<strong>首都 / Capital:</strong> ${escapeHtmlText(region.capital || "")}</p>` +
      briefingList("🏙 主要都市 / Major cities", region.major_cities) +
      briefingList("🗺 観光名所 / Sights", region.sights) +
      briefingList("🍽 名物 / Famous food", region.foods) +
      briefingList("⭐ 有名人 / Famous people", region.people) +
      briefingList("🏢 有名な会社・ブランド / Well-known companies", companies) +
      briefingList("✨ その他有名なもの / Other well-known things", region.other) +
      `</div>`;
  }

  briefingProgressEl.innerHTML =
    `<p class="briefing-maintenance">✅ 情報の収集が終わりました(${total}/${total})。 / Finished gathering information.</p>`;
  briefingBodyEl.innerHTML = newsHtml + infoHtml;

  // 学習継続(既存の流れに接続): この話題をそのままAI講師との会話練習へ渡す。
  const topRegion = worldRegions[top] || {};
  lastBriefingText =
    `Let's talk about ${topRegion.countries_en || languageDisplayName(top)}. ` +
    `Capital: ${topRegion.capital || "?"}. Major cities: ${(topRegion.major_cities || []).slice(0, 3).join(", ")}. ` +
    `Famous sights: ${(topRegion.sights || []).slice(0, 2).join(", ")}. Famous food: ${(topRegion.foods || []).slice(0, 2).join(", ")}. ` +
    `Well-known companies: ${(topRegion.companies || []).slice(0, 2).map((c) => c.name).join(", ")}. ` +
    `Please help me practise small talk about these topics in ${topRegion.countries_en || languageDisplayName(top)}.`;
}

if (briefingModal) {
  const openBtn = document.getElementById("briefing-btn");
  if (openBtn) openBtn.addEventListener("click", runTopicBriefing);
  const closeBtn = document.getElementById("briefing-close");
  if (closeBtn) closeBtn.addEventListener("click", () => briefingModal.classList.add("hidden"));
  briefingModal.addEventListener("click", (e) => {
    if (e.target === briefingModal) briefingModal.classList.add("hidden");
  });
  const practiceBtn = document.getElementById("briefing-practice-btn");
  if (practiceBtn) {
    practiceBtn.addEventListener("click", () => {
      if (!lastBriefingText) return;
      briefingModal.classList.add("hidden");
      // 先頭の言語のトレーナーへ切り替えてから練習リクエストを送る
      // (既存の資格試験→トレーナーの導線と同じ考え方)。
      const top = multiSpeakTargetCodes()[0];
      if (learnTargetEl && learnTargetEl.querySelector(`option[value="world:${top}"]`)) {
        learnTargetEl.value = `world:${top}`;
      } else if (learnTargetEl && top === "ja") {
        learnTargetEl.value = "japanese";
      } else if (learnTargetEl && top === "en") {
        learnTargetEl.value = "english";
      }
      if (replyLangEl) replyLangEl.value = "hybrid";
      inputEl.value = lastBriefingText;
      formEl.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  }
}

// 起動時: 対応言語一覧を取得してメニューへ反映し、メンテナンス中(初回)は
// 言語追加の案内モーダルを自動で開く。
(async function initWorldLanguages() {
  // localStorageに設定が無い場合(ブラウザデータ消去後・別プロファイル等)は
  // サーバーDBから復元する。**必ず`worldLanguages`の取得より前に呼ぶこと**
  // ——メニュー構築より後だと復元が今回の描画に間に合わない(実機検証で
  // 「復元されない」実バグとして発覚したため、順序に依存する点をここに明記)。
  await restoreSettingsFromServer();
  await loadWorldRegions();
  worldLanguages = await fetchWorldLanguages();
  applyEnabledLanguagesToMenus();
  await loadMultiSpeakPhrases();
  refreshLanguageDependentUi();
  let alreadyPrompted = false;
  try {
    alreadyPrompted = localStorage.getItem(LANGUAGE_PROMPT_SHOWN_KEY) === "1";
  } catch (e) {
    alreadyPrompted = false;
  }
  const maintenanceVisible =
    document.getElementById("maintenance-banner") &&
    !document.getElementById("maintenance-banner").classList.contains("hidden");
  if (!alreadyPrompted && maintenanceVisible && worldLanguages.length > 0) {
    // メンテナンス(起動直後の60秒カウントダウン)の待ち時間に案内する。
    openLanguagePackModal();
    try {
      localStorage.setItem(LANGUAGE_PROMPT_SHOWN_KEY, "1");
    } catch (e) {
      /* 保存できない場合は毎回表示されるだけで実害は無い */
    }
  }
})();

if (examPrepBtn && examPrepModal) {
  examPrepBtn.addEventListener("click", () => {
    examPrepModal.classList.remove("hidden");
  });
  examPrepClose.addEventListener("click", () => examPrepModal.classList.add("hidden"));
  examPrepModal.addEventListener("click", (e) => {
    if (e.target === examPrepModal) examPrepModal.classList.add("hidden");
  });
  examPrepStartBtn.addEventListener("click", renderExamPrepQuiz);
  examPrepSubmitBtn.addEventListener("click", scoreExamPrepQuiz);
  examPrepPracticeBtn.addEventListener("click", practiceExamPrepWithTrainer);
}

// おすすめLLM機能(ユーザー指示、2026-08-17「メンテナンス時に…VRAMなどの
// 性能やCPUの性能やシステムメモリーの大きさやNPUがあるかないかなどの
// 最新の情報を元に、AIがオススメのLLMをインストールする時に、似たような
// LLMがあれば、それぞれの特徴をお知らせして…どちらのオープンソースの
// ローカルLLMになさいますか?と質問してくる機能と…もう一つ大きなサイズの
// LLMやもう一つ小さなLLMも御座いますとそれぞれのLLMの特徴もお知らせして
// LLMの選択機能」への対応)。ハードウェア検出(`GET /v1/recommend`)+
// モデルカタログ(`GET /v1/models/catalog`)は既にaruaru-llm側に実装
// 済み(2026-07-27、CLAUDE.md参照)——本機能はそれをopen-english側の
// UIとして初めて可視化し、推奨モデル・ワンサイズ上・ワンサイズ下の
// 3択を特徴つきで提示し、ボタン1つでインストール・切り替えできるように
// する。
const llmRecommendBtn = document.getElementById("llm-recommend-btn");
const llmRecommendModal = document.getElementById("llm-recommend-modal");
const llmRecommendClose = document.getElementById("llm-recommend-close");
const llmRecommendDetectBtn = document.getElementById("llm-recommend-detect");
const llmRecommendBody = document.getElementById("llm-recommend-body");

function catalogEntryLabel(entry) {
  return `${entry.display_name_en} / ${entry.display_name_ja} (~${entry.approx_size_mb}MB)`;
}

async function installAndSwitchModel(base, id, statusEl) {
  statusEl.textContent = `Installing & switching to ${id}… / ${id}へインストール・切替中…`;
  try {
    const installRes = await fetch(`${base}/v1/models/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!installRes.ok) throw new Error(`install HTTP ${installRes.status}`);
    const selectRes = await fetch(`${base}/v1/models/select`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!selectRes.ok) throw new Error(`select HTTP ${selectRes.status}`);
    statusEl.textContent = `✅ Switched to ${id} / ${id}へ切り替えました`;
  } catch (err) {
    statusEl.textContent = `⚠ Failed / 失敗しました: ${err.message}`;
  }
}

async function detectAndCompareLlm() {
  const base = apiBaseEl.value.trim();
  llmRecommendBody.innerHTML = "<p class=\"setup-note\">Detecting… / 検出中…</p>";
  try {
    const [recRes, catalogRes] = await Promise.all([fetch(`${base}/v1/recommend`), fetch(`${base}/v1/models/catalog`)]);
    if (!recRes.ok || !catalogRes.ok) throw new Error(`HTTP ${recRes.status}/${catalogRes.status}`);
    const rec = await recRes.json();
    const catalog = await catalogRes.json();
    const models = catalog.models.slice().sort((a, b) => a.approx_size_mb - b.approx_size_mb);
    const recIndex = models.findIndex((m) => m.id === rec.recommended_model_id);

    const choices = [];
    if (recIndex >= 0) choices.push({ role: "Recommended / おすすめ", entry: models[recIndex] });
    if (recIndex + 1 < models.length) choices.push({ role: "One size larger / もう一つ大きいサイズ", entry: models[recIndex + 1] });
    if (recIndex - 1 >= 0) choices.push({ role: "One size smaller / もう一つ小さいサイズ", entry: models[recIndex - 1] });

    const hwLine =
      `GPU: ${rec.hardware.gpu_name || "not detected / 未検出"} ` +
      `(VRAM: ${rec.hardware.vram_bytes ? Math.round(rec.hardware.vram_bytes / 1024 / 1024) + "MB" : "?"}, ` +
      `detection: ${rec.hardware.detection_path}) / ` +
      `GPU: ${rec.hardware.gpu_name || "未検出"} (VRAM: ${rec.hardware.vram_bytes ? Math.round(rec.hardware.vram_bytes / 1024 / 1024) + "MB" : "不明"}, 検出経路: ${rec.hardware.detection_path})`;

    llmRecommendBody.innerHTML = "";
    const hwP = document.createElement("p");
    hwP.className = "setup-note";
    hwP.textContent = hwLine;
    llmRecommendBody.appendChild(hwP);

    const questionP = document.createElement("p");
    questionP.className = "setup-note";
    questionP.textContent =
      "Similar open-source local LLMs are available — which would you like? / " +
      "似たようなオープンソースのローカルLLMがあります。どちらになさいますか?";
    llmRecommendBody.appendChild(questionP);

    choices.forEach((choice) => {
      const row = document.createElement("div");
      row.className = "settings-field";
      const label = document.createElement("div");
      label.textContent = `${choice.role}: ${catalogEntryLabel(choice.entry)}`;
      row.appendChild(label);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "setup-btn";
      btn.textContent = `Use this / これにする (${choice.entry.id})`;
      const statusEl = document.createElement("p");
      statusEl.className = "setup-note";
      btn.addEventListener("click", () => installAndSwitchModel(base, choice.entry.id, statusEl));
      row.appendChild(btn);
      row.appendChild(statusEl);
      llmRecommendBody.appendChild(row);
    });
  } catch (err) {
    llmRecommendBody.innerHTML = `<p class="setup-note">⚠ Could not detect/compare / 検出・比較できませんでした: ${err.message}</p>`;
  }
}

if (llmRecommendBtn && llmRecommendModal) {
  llmRecommendBtn.addEventListener("click", () => llmRecommendModal.classList.remove("hidden"));
  llmRecommendClose.addEventListener("click", () => llmRecommendModal.classList.add("hidden"));
  llmRecommendModal.addEventListener("click", (e) => {
    if (e.target === llmRecommendModal) llmRecommendModal.classList.add("hidden");
  });
  llmRecommendDetectBtn.addEventListener("click", detectAndCompareLlm);
}

// AIでプログラミング / AI Coding Assistantパネル(ユーザー指示「UPLOADと
// ダウンロード機能とGUIでローカルドライブ指定も可能な、CLAUDEなら
// CLAUDE CODE DESKTOPもマウスで選択可能に」への対応、2026-08-20新設)。
// 正直な開示: ブラウザはサンドボックス化されており(1)任意のローカル
// ドライブへ自由にアクセスすること、(2)このページからClaude Code Desktop
// のような別のデスクトップアプリを起動すること、のいずれも技術的に
// できない。実現できる範囲は、ユーザーが明示的に選んだファイル/フォルダ
// へのアクセス(File System Access API、Chromium系のみ)・ダウンロード・
// 選択したAIツールの公式サイトへの案内リンク表示にとどめた
// (誇張しないこと、ユーザー指示より)。
const aiCodingBtn = document.getElementById("ai-coding-btn");
const aiCodingModal = document.getElementById("ai-coding-modal");
const aiCodingClose = document.getElementById("ai-coding-close");
const aiCodingUploadEl = document.getElementById("ai-coding-upload");
const aiCodingUploadStatusEl = document.getElementById("ai-coding-upload-status");
const aiCodingFolderBtn = document.getElementById("ai-coding-folder-btn");
const aiCodingFolderStatusEl = document.getElementById("ai-coding-folder-status");
const aiCodingDownloadBtn = document.getElementById("ai-coding-download-btn");
const aiCodingDownloadStatusEl = document.getElementById("ai-coding-download-status");
const aiCodingToolSelectEl = document.getElementById("ai-coding-tool-select");
const aiCodingToolLinkBtn = document.getElementById("ai-coding-tool-link-btn");
const aiCodingToolStatusEl = document.getElementById("ai-coding-tool-status");

let aiCodingUploadedFiles = [];

if (aiCodingBtn && aiCodingModal) {
  aiCodingBtn.addEventListener("click", () => aiCodingModal.classList.remove("hidden"));
  aiCodingClose.addEventListener("click", () => aiCodingModal.classList.add("hidden"));
  aiCodingModal.addEventListener("click", (e) => {
    if (e.target === aiCodingModal) aiCodingModal.classList.add("hidden");
  });
}

if (aiCodingUploadEl) {
  aiCodingUploadEl.addEventListener("change", () => {
    aiCodingUploadedFiles = Array.from(aiCodingUploadEl.files || []);
    if (aiCodingUploadedFiles.length === 0) {
      aiCodingUploadStatusEl.textContent = "No files selected. / ファイル未選択です。";
      return;
    }
    const list = aiCodingUploadedFiles
      .map((f) => `${f.name} (${formatBytes(f.size)})`)
      .join(", ");
    aiCodingUploadStatusEl.textContent =
      `Selected ${aiCodingUploadedFiles.length} file(s): ${list} / ` +
      `${aiCodingUploadedFiles.length}件のファイルを選択しました: ${list}`;
  });
}

// フォルダ選択(File System Access API、Chromium系ブラウザのみ対応)。
// 非対応ブラウザではボタンをdisabledにし、正直な非対応メッセージを表示する。
if (aiCodingFolderBtn) {
  if (typeof window.showDirectoryPicker !== "function") {
    aiCodingFolderBtn.disabled = true;
    aiCodingFolderStatusEl.textContent =
      "Your browser does not support folder selection (showDirectoryPicker is only available " +
      "in Chromium-based browsers such as Chrome/Edge). / お使いのブラウザはフォルダ選択に" +
      "対応していません(showDirectoryPickerはChrome/EdgeなどChromium系ブラウザのみ対応です)。";
  } else {
    aiCodingFolderBtn.addEventListener("click", async () => {
      try {
        const dirHandle = await window.showDirectoryPicker();
        const entryNames = [];
        for await (const [name, handle] of dirHandle.entries()) {
          entryNames.push(`${name}${handle.kind === "directory" ? "/" : ""}`);
          if (entryNames.length >= 50) {
            entryNames.push("… (truncated / 省略)");
            break;
          }
        }
        aiCodingFolderStatusEl.textContent =
          `Selected folder: "${dirHandle.name}" (${entryNames.length} top-level entries shown) / ` +
          `選択したフォルダ: 「${dirHandle.name}」(トップレベルの項目 ${entryNames.length}件を表示)\n` +
          entryNames.join(", ");
      } catch (e) {
        // ユーザーがダイアログをキャンセルした場合もここに来る(AbortError)。
        if (e && e.name === "AbortError") {
          aiCodingFolderStatusEl.textContent = "Cancelled. / キャンセルされました。";
        } else {
          aiCodingFolderStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
        }
      }
    });
  }
}

if (aiCodingDownloadBtn) {
  aiCodingDownloadBtn.addEventListener("click", () => {
    if (aiCodingUploadedFiles.length === 0) {
      aiCodingDownloadStatusEl.textContent =
        "Please upload file(s) above first. / まず上でファイルをアップロードしてください。";
      return;
    }
    aiCodingUploadedFiles.forEach((file) => {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // メモリリーク回避のため、少し待ってからURLを解放する。
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
    aiCodingDownloadStatusEl.textContent =
      `Triggered download for ${aiCodingUploadedFiles.length} file(s). / ` +
      `${aiCodingUploadedFiles.length}件のファイルのダウンロードを開始しました。`;
  });
}

// AIツール案内リンク(正直な開示: リンク表示のみ、起動はできない)。
const AI_CODING_TOOL_LINKS = {
  "claude-code-desktop": {
    url: "https://claude.com/product/claude-code",
    label_en: "Claude Code Desktop official page",
    label_ja: "Claude Code Desktop公式ページ",
  },
  "claude-code-cli": {
    url: "https://docs.claude.com/en/docs/claude-code/overview",
    label_en: "Claude Code (CLI) documentation",
    label_ja: "Claude Code(CLI)ドキュメント",
  },
  "claude-ai": {
    url: "https://claude.ai/",
    label_en: "Claude.ai",
    label_ja: "Claude.ai",
  },
  "chatgpt": {
    url: "https://chat.openai.com/",
    label_en: "ChatGPT",
    label_ja: "ChatGPT",
  },
  "gemini": {
    url: "https://gemini.google.com/",
    label_en: "Google Gemini",
    label_ja: "Google Gemini",
  },
  "deepseek": {
    url: "https://www.deepseek.com/",
    label_en: "DeepSeek",
    label_ja: "DeepSeek",
  },
};

if (aiCodingToolLinkBtn) {
  aiCodingToolLinkBtn.addEventListener("click", () => {
    const key = aiCodingToolSelectEl?.value;
    const entry = AI_CODING_TOOL_LINKS[key];
    if (!entry) return;
    window.open(entry.url, "_blank", "noopener,noreferrer");
    aiCodingToolStatusEl.textContent =
      `Opened: ${entry.label_en} (${entry.url}) — this only opens a link, it cannot launch a ` +
      `desktop app for you. / 開きました: ${entry.label_ja}(${entry.url})——リンクを開くのみで、` +
      `デスクトップアプリを起動することはできません。`;
  });
}
