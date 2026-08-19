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
  const trainerRole = trainerRoleByTarget[learnTargetEl ? learnTargetEl.value : "english"] || trainerRoleByTarget.english;
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
  const extra = await loadExtraExamPrepQuestions();
  const pool = (EXAM_PREP_QUESTIONS[exam] || []).concat(extra[exam] || []);
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
