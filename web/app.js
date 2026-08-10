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

const logEl = document.getElementById("log");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const apiBaseEl = document.getElementById("api-base");
const statusEl = document.getElementById("status");
const trainerEl = document.getElementById("trainer");
const bubbleEl = document.getElementById("speech-bubble");
const levelEl = document.getElementById("level");
const replyLangEl = document.getElementById("reply-lang");
const micBtn = document.getElementById("mic-btn");
const voiceOutEl = document.getElementById("voice-out");

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
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
      const utter = new SpeechSynthesisUtterance(text);
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
        utter.pitch = 1.1;
        utter.rate = 0.92;
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

const trainingSteps = [
  {
    trainerSays:
      "Let's begin the Maid Cafe English Training! / メイドカフェ英会話研修を始めましょう!\n" +
      "Hello, I am Sakura, your maid trainer! / こんにちは、私はメイドの先生、さくらです!\n" +
      "How old am I, you ask? / 私が何歳か気になりますか?\n" +
      "A maid is eternally 17 years old! ✨ / メイドは永遠の17歳です!✨\n" +
      "Now — what is YOUR name? / さて、あなたのお名前は?",
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
  }
}

characterSwitchBtn.addEventListener("click", switchCharacter);

async function askTrainer(userText) {
  const base = apiBaseEl.value.trim();
  const level = levelEl.value;
  const levelInstruction = levelInstructions[level] || "";
  const langInstruction = langInstructions[replyLangEl.value] || "";
  // 正直な開示: プロンプトへの指示文付加のみでレベル・言語を守らせようと
  // しているだけで、GPT-2側が実際にそれを守る保証は無い。
  const prompt = `You are a friendly English conversation trainer at a maid cafe. ${levelInstruction} ${langInstruction}\nStudent: ${userText}\nTrainer:`;

  const res = await fetch(`${base}/v1/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, max_new_tokens: 48 }),
  });
  if (!res.ok) {
    throw new Error(`aruaru-llm returned HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.completion ?? "(no completion field in response)";
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
