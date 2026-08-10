// open-english フロントエンド(Phase 0)。
//
// 正直な開示: `aruaru-llm`の`/v1/generate`は対話特化のファインチューニング
// を受けていない素のGPT-2であり、応答品質・レベル遵守は保証されない。
// このスクリプトはそれを誠実に開示した上で、実際にaruaru-llmへ接続する。

const levelInstructions = {
  "super-beginner": "Use only very simple words and short sentences.",
  beginner: "Use simple vocabulary and short sentences.",
  intermediate: "Use natural, everyday English.",
  advanced: "Use rich vocabulary and more complex sentence structures.",
};

const langInstructions = {
  en: "Reply only in English.",
  ja: "日本語のみで返答してください(Reply only in Japanese).",
  hybrid: "Reply with a short mix of English and Japanese in the same message (e.g. give the English sentence, then a brief Japanese translation or note), to help the student learn both.",
};

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
  return preferred || candidates[0] || cachedVoices[0] || null;
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
const countryFunFacts = {
  australia: "I love kangaroos and koalas! / 私はカンガルーとコアラが大好きです!",
  usa: "I love baseball and Hollywood movies! / 私は野球とハリウッド映画が大好きです!",
  america: "I love baseball and Hollywood movies! / 私は野球とハリウッド映画が大好きです!",
  uk: "I love tea time and football! / 私はお茶の時間とサッカーが大好きです!",
  england: "I love tea time and football! / 私はお茶の時間とサッカーが大好きです!",
  canada: "I love maple syrup and hockey! / 私はメープルシロップとホッケーが大好きです!",
  france: "I love croissants and the Eiffel Tower! / 私はクロワッサンとエッフェル塔が大好きです!",
  china: "I love pandas and dumplings! / 私はパンダと餃子が大好きです!",
  korea: "I love K-pop and kimchi! / 私はK-POPとキムチが大好きです!",
};

function findCountryFunFact(text) {
  const lower = text.toLowerCase();
  for (const [key, fact] of Object.entries(countryFunFacts)) {
    if (lower.includes(key)) return fact;
  }
  return "That's wonderful! I'd love to learn more about your country someday! / それは素晴らしいですね!いつかあなたの国についてもっと知りたいです!";
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
    onUserReply: (text) =>
      `${findCountryFunFact(text)}\n` + "Do you know Japanese animation? / 日本のアニメーションを知っていますか?",
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

function startTrainingMode() {
  trainingStepIndex = 0;
  appendMessage("trainer", trainingSteps[0].trainerSays);
  speak(trainingSteps[0].trainerSays);
}

function advanceTrainingMode(userText) {
  const step = trainingSteps[trainingStepIndex];
  const reply = step.onUserReply(userText);
  appendMessage("trainer", reply);
  speak(reply);
  trainingStepIndex = Math.min(trainingStepIndex + 1, trainingSteps.length - 1);
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
    speak(newIntro);
  }
}

characterSwitchBtn.addEventListener("click", switchCharacter);

async function askTrainer(userText) {
  const base = apiBaseEl.value.trim();
  const level = levelEl.value;
  const levelInstruction = levelInstructions[level] || "";
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
  const prompt = `You are a friendly English conversation trainer at a maid cafe. ${levelInstruction} ${langInstruction}\nStudent: ${userText}\nTrainer:`;

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
  return reply;
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

  if (levelEl.value === "maid-cafe-training") {
    advanceTrainingMode(text);
    return;
  }

  try {
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
