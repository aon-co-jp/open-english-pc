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

const logEl = document.getElementById("log");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const apiBaseEl = document.getElementById("api-base");
const statusEl = document.getElementById("status");
const trainerEl = document.getElementById("trainer");
const bubbleEl = document.getElementById("speech-bubble");
const levelEl = document.getElementById("level");

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

function speak(text) {
  bubbleEl.textContent = text;
  trainerEl.classList.add("speaking");
  clearTimeout(speak._timer);
  speak._timer = setTimeout(() => trainerEl.classList.remove("speaking"), Math.min(4000, text.length * 60));
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
  const instruction = levelInstructions[level] || "";
  // 正直な開示: プロンプトへの指示文付加のみでレベルを守らせようとしている
  // だけで、GPT-2側が実際にそれを守る保証は無い。
  const prompt = `You are a friendly English conversation trainer at a maid cafe. ${instruction}\nStudent: ${userText}\nTrainer:`;

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
checkHealth();
speak("Hi! I'm your English trainer. Type something below to start practicing! (Placeholder character design.)");
