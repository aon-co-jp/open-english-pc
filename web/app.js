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
function pickVoice(lang) {
  if (!cachedVoices.length && "speechSynthesis" in window) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  const candidates = cachedVoices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  const femaleNameHints = ["female", "woman", "kyoko", "haruka", "ayumi", "samantha", "zira", "susan", "google 日本語", "google us english"];
  const preferred = candidates.find((v) => femaleNameHints.some((hint) => v.name.toLowerCase().includes(hint)));
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
      const voice = pickVoice(lang);
      if (voice) utter.voice = voice;
      // キャビンアテンダント風の丁寧さ(やや低め・ゆっくり)+
      // メイドカフェ風の明るさ(やや高めのピッチ)を両立させる調整値。
      utter.pitch = 1.12;
      utter.rate = 0.95;
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

async function checkHealth() {
  const base = apiBaseEl.value.trim();
  try {
    const res = await fetch(`${base}/healthz`);
    if (res.ok) {
      setStatus(true, "aruaru-llm: connected");
    } else {
      setStatus(false, `aruaru-llm: HTTP ${res.status}`);
    }
  } catch (err) {
    setStatus(false, "aruaru-llm: unreachable (CORS or server not running?)");
  }
}

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
