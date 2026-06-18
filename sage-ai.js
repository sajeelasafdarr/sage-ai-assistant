/*!
 * Sage AI Assistant Widget  v1.2 — FINAL
 * ─────────────────────────────────────────
 * ✅ Lead capture: asks name → email → phone
 * ✅ Works with OR without an AI backend
 * ✅ Posts lead to Make.com webhook
 * ✅ Pushes lead into CRM dashboard (crm.js)
 * ✅ Groq / OpenAI / any AI endpoint supported
 */

/* ============================================================
   SECTION 1 — CONFIGURATION
   ▸ Only edit values in this block to customise the widget.
   ============================================================ */
const CONFIG = {
  companyName:    "Sage AI Assistant",
  primaryColor:   "#2563eb",
  secondaryColor: "#f8fafc",
  accentColor:    "#1e40af",
  welcomeMessage: "👋 Hi! I'm Sage AI Assistant. How can I help you today?",
  subtitle:       "Powered by AI",
  logo:           "",        // URL to logo image — leave "" to use emoji
  logoEmoji:      "🤖",
  darkMode:       "auto",    // "auto" | "light" | "dark"
  showFooter:     true,

  // ── AI backend (your Groq proxy, OpenAI route, etc.) ──────────
  // Leave "" if you have no backend yet — the bot will still do
  // lead capture and send to Make.com perfectly.
  aiApiEndpoint:  "",

  // ── Make.com webhook ──────────────────────────────────────────
  // Paste your Make.com Custom Webhook URL here.
  // This is called as soon as the user provides name+email+phone.
  webhookUrl: "https://hook.us2.make.com/3e7m3kiyqdv7cpd4nsoxeqgsx3lorvws",

  // ── Lead capture trigger ──────────────────────────────────────
  // How many user messages before the bot asks for contact info.
  // Set to 1 to ask immediately after the very first message.
  leadAfterMsgs: 3,

  cssHref: "sage-ai.css",
};

/* ============================================================
   SECTION 2 — RUNTIME STATE
   ============================================================ */
const STATE = {
  isOpen:         false,
  conversationId: null,
  messages:       [],   // { role, text, time }
  userMsgCount:   0,
  leadMode:       false,
  leadStep:       0,    // 0 = name | 1 = email | 2 = phone
  leadData:       {},   // { name, email, phone }
  leadSubmitted:  false,
  aiPending:      false,
};

/* ============================================================
   SECTION 3 — LOCAL STORAGE
   ============================================================ */
const STORAGE_KEY = "sage_ai_session";

function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      conversationId: STATE.conversationId,
      messages:       STATE.messages,
      userMsgCount:   STATE.userMsgCount,
      leadSubmitted:  STATE.leadSubmitted,
      leadData:       STATE.leadData,
    }));
  } catch (_) { /* quota exceeded or private browsing */ }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

/* ============================================================
   SECTION 4 — ID GENERATION
   ============================================================ */
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ============================================================
   SECTION 5 — BUILD WIDGET HTML
   ============================================================ */
function injectCSS() {
  if (document.getElementById("sage-ai-styles")) return;

  const link      = document.createElement("link");
  link.id         = "sage-ai-styles";
  link.rel        = "stylesheet";
  link.href       = CONFIG.cssHref;
  document.head.appendChild(link);

  const gfPre     = document.createElement("link");
  gfPre.rel       = "preconnect";
  gfPre.href      = "https://fonts.googleapis.com";
  document.head.appendChild(gfPre);

  const gfFont    = document.createElement("link");
  gfFont.rel      = "stylesheet";
  gfFont.crossOrigin = "anonymous";
  gfFont.href     = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(gfFont);
}

function buildWidget() {
  const widget = document.createElement("div");
  widget.id    = "sage-ai-widget";
  applyTheme(widget);

  widget.innerHTML = `
    <!-- ── Floating button ──────────────────────────────── -->
    <button id="sage-toggle-btn" aria-label="Open chat" aria-expanded="false">
      <svg class="icon-chat" viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="icon-close" viewBox="0 0 24 24">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6"  y1="6" x2="18" y2="18"/>
      </svg>
      <span id="sage-badge" aria-hidden="true">1</span>
    </button>

    <!-- ── Chat window ──────────────────────────────────── -->
    <div id="sage-chat-window" role="dialog" aria-modal="true" aria-label="Sage AI Chat">

      <div id="sage-header">
        <div id="sage-avatar">${buildAvatar()}</div>
        <div id="sage-header-info">
          <div id="sage-header-name">${escHtml(CONFIG.companyName)}</div>
          <div id="sage-header-subtitle">
            <span id="sage-status-dot"></span>
            ${escHtml(CONFIG.subtitle)}
          </div>
        </div>
        <div id="sage-header-actions">
          <button class="sage-header-btn" id="sage-theme-btn"
                  title="Toggle dark mode" aria-label="Toggle dark mode">
            <svg viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </button>
          <button class="sage-header-btn" id="sage-close-btn"
                  title="Close" aria-label="Close chat">
            <svg viewBox="0 0 24 24">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
        </div>
      </div>

      <div id="sage-messages" aria-live="polite" aria-label="Messages"></div>

      <div id="sage-typing" aria-label="Assistant is typing" role="status">
        <div class="sage-msg-avatar">🤖</div>
        <div>
          <div class="sage-typing-label">${escHtml(CONFIG.companyName)} is typing…</div>
          <div class="sage-typing-bubble">
            <span class="sage-dot"></span>
            <span class="sage-dot"></span>
            <span class="sage-dot"></span>
          </div>
        </div>
      </div>

      <div id="sage-input-area">
        <textarea
          id="sage-input"
          rows="1"
          placeholder="Type a message…"
          aria-label="Message input"
          maxlength="2000"
        ></textarea>
        <button id="sage-send-btn" aria-label="Send message">
          <svg viewBox="0 0 24 24">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      ${CONFIG.showFooter
        ? `<div id="sage-footer">Powered by <strong>Sage AI</strong></div>`
        : ""}
    </div>
  `;

  document.body.appendChild(widget);
}

function buildAvatar() {
  return CONFIG.logo
    ? `<img src="${escHtml(CONFIG.logo)}" alt="${escHtml(CONFIG.companyName)} logo">`
    : CONFIG.logoEmoji;
}

/* ============================================================
   SECTION 6 — THEME
   ============================================================ */
function applyTheme(el) {
  el = el || document.getElementById("sage-ai-widget");
  if (!el) return;
  let theme = CONFIG.darkMode;
  if (theme === "auto")
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  el.dataset.theme = theme;
  el.style.setProperty("--sage-primary",      CONFIG.primaryColor);
  el.style.setProperty("--sage-primary-dark", CONFIG.accentColor);
  el.style.setProperty("--sage-secondary",    CONFIG.secondaryColor);
}

function toggleTheme() {
  const el = document.getElementById("sage-ai-widget");
  if (el) el.dataset.theme = el.dataset.theme === "dark" ? "light" : "dark";
}

/* ============================================================
   SECTION 7 — OPEN / CLOSE
   ============================================================ */
function openChat() {
  STATE.isOpen = true;
  const win   = document.getElementById("sage-chat-window");
  const btn   = document.getElementById("sage-toggle-btn");
  const badge = document.getElementById("sage-badge");
  win.classList.add("open");
  btn.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
  badge.classList.remove("visible");
  setTimeout(() => {
    const inp = document.getElementById("sage-input");
    if (inp) inp.focus();
  }, 350);
  scrollToBottom();
}

function closeChat() {
  STATE.isOpen = false;
  document.getElementById("sage-chat-window").classList.remove("open");
  const btn = document.getElementById("sage-toggle-btn");
  btn.classList.remove("open");
  btn.setAttribute("aria-expanded", "false");
}

function toggleChat() { STATE.isOpen ? closeChat() : openChat(); }

/* ============================================================
   SECTION 8 — MESSAGES
   ============================================================ */
function escHtml(str) {
  const m = { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" };
  return String(str).replace(/[&<>"']/g, c => m[c]);
}

function formatTime(ts) {
  return (ts ? new Date(ts) : new Date())
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function appendMessage(role, text, ts, persist = true) {
  const list = document.getElementById("sage-messages");
  if (!list) return;
  const time = ts || Date.now();
  const row  = document.createElement("div");
  row.className = `sage-msg-row ${role}`;

  if (role === "bot") {
    row.innerHTML = `
      <div class="sage-msg-avatar">${CONFIG.logoEmoji}</div>
      <div>
        <div class="sage-bubble">${escHtml(text)}</div>
        <div class="sage-ts">${formatTime(time)}</div>
      </div>`;
  } else {
    row.innerHTML = `
      <div>
        <div class="sage-bubble">${escHtml(text)}</div>
        <div class="sage-ts">${formatTime(time)}</div>
      </div>`;
  }

  list.appendChild(row);
  scrollToBottom();

  if (persist) {
    STATE.messages.push({ role, text, time });
    saveSession();
  }
}

function scrollToBottom() {
  const el = document.getElementById("sage-messages");
  if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

/* ============================================================
   SECTION 9 — TYPING INDICATOR
   ============================================================ */
function showTyping() {
  const el = document.getElementById("sage-typing");
  if (el) { el.classList.add("visible"); scrollToBottom(); }
}
function hideTyping() {
  const el = document.getElementById("sage-typing");
  if (el) el.classList.remove("visible");
}

function delay(ms = 900) { return new Promise(r => setTimeout(r, ms)); }

/* ============================================================
   SECTION 10 — AI API  (Groq / OpenAI / custom proxy)
   ─────────────────────────────────────────────────────────────
   If aiApiEndpoint is empty, the bot skips calling AI and goes
   straight to lead capture (or gives a fallback message).
   ============================================================ */
async function sendToAI(userMessage) {
  if (STATE.aiPending) return;
  STATE.aiPending = true;

  const sendBtn = document.getElementById("sage-send-btn");
  if (sendBtn) sendBtn.disabled = true;
  showTyping();

  if (!CONFIG.aiApiEndpoint) {
    // ── No backend: give a friendly canned reply ─────────────
    await delay(800);
    hideTyping();
    appendMessage("bot", "Great question! Let me connect you with the right person who can help. 🙌");
    STATE.aiPending = false;
    if (sendBtn) sendBtn.disabled = false;
    return;
  }

  // ── Call the AI backend ───────────────────────────────────
  try {
    const res = await fetch(CONFIG.aiApiEndpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        message:         userMessage,
        conversation_id: STATE.conversationId,
        history:         STATE.messages.slice(-10),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    hideTyping();

    // Backend can force lead-capture by returning { capture_lead: true }
    if (data.capture_lead === true && !STATE.leadSubmitted) {
      startLeadCapture();
      STATE.aiPending = false;
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    appendMessage("bot", data.reply || "I didn't catch that — could you rephrase?");

  } catch (err) {
    console.error("[Sage AI] API error:", err);
    hideTyping();
    appendMessage("bot", "Sorry, I'm having a connection issue. Please try again in a moment.");
  }

  STATE.aiPending = false;
  if (sendBtn) sendBtn.disabled = false;
}

/* ============================================================
   SECTION 11 — LEAD CAPTURE CONVERSATION
   Flow: name → email → phone → submitLead()
   ============================================================ */

/** Kick off the lead-capture sequence */
function startLeadCapture() {
  if (STATE.leadMode || STATE.leadSubmitted) return;
  STATE.leadMode = true;
  STATE.leadStep = 0;
  STATE.leadData = {};
  appendMessage(
    "bot",
    "Before I connect you with our team, could I grab your name? 😊"
  );
}

/**
 * Called for every user message while leadMode === true.
 * Returns true so the main handler knows the message was consumed.
 */
async function handleLeadReply(text) {
  if (!STATE.leadMode) return false;

  const val = text.trim();

  switch (STATE.leadStep) {

    // ── Step 0: collect name ────────────────────────────────
    case 0:
      if (val.length < 2) {
        showTyping(); await delay(500); hideTyping();
        appendMessage("bot", "Please enter your full name so we can address you properly.");
        return true;
      }
      STATE.leadData.name = val;
      STATE.leadStep = 1;
      showTyping(); await delay(700); hideTyping();
      appendMessage("bot",
        `Nice to meet you, ${escHtml(STATE.leadData.name)}! 👋\nWhat's the best email address for you?`
      );
      break;

    // ── Step 1: collect email ───────────────────────────────
    case 1:
      if (!isValidEmail(val)) {
        showTyping(); await delay(600); hideTyping();
        appendMessage("bot",
          "Hmm, that email doesn't look right. Could you double-check it? (example: you@company.com)"
        );
        return true; // stay on step 1
      }
      STATE.leadData.email = val;
      STATE.leadStep = 2;
      showTyping(); await delay(700); hideTyping();
      appendMessage("bot",
        "Got it! 📧\nAnd your phone number? (You can type 'skip' if you prefer not to share it)"
      );
      break;

    // ── Step 2: collect phone then fire webhook ─────────────
    case 2:
      STATE.leadData.phone = val.toLowerCase() === "skip" ? "" : val;
      STATE.leadMode = false;
      showTyping(); await delay(1000); hideTyping();
      await submitLead();
      break;
  }

  return true;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ============================================================
   SECTION 12 — LEAD SUBMISSION
   ─────────────────────────────────────────────────────────────
   Sends the collected lead to TWO places:
     1. window.SageCRM  — the local CRM dashboard (crm.js)
     2. CONFIG.webhookUrl — Make.com → Zoho CRM

   JSON payload sent to Make.com:
   {
     "name":            "Jane Smith",
     "email":           "jane@acme.com",
     "phone":           "+1 555 1234",
     "source":          "chatbot",
     "conversation_id": "uuid",
     "timestamp":       "2025-01-01T12:00:00.000Z",
     "conversation": [
       { "role": "bot",  "text": "Hi! …", "time": 1700000000000 },
       { "role": "user", "text": "Hello", "time": 1700000010000 },
       …
     ]
   }

   Make.com mapping → Zoho CRM Create Lead:
     name            → Last_Name
     email           → Email
     phone           → Phone
     source          → Lead_Source  (or hardcode "Chat")
   ============================================================ */
async function submitLead() {
  if (STATE.leadSubmitted) return;

  // Lock FIRST to prevent any race condition
  STATE.leadSubmitted = true;
  saveSession();

  const payload = {
    name:            STATE.leadData.name  || "",
    email:           STATE.leadData.email || "",
    phone:           STATE.leadData.phone || "",
    source:          "chatbot",
    conversation_id: STATE.conversationId,
    timestamp:       new Date().toISOString(),
    conversation:    STATE.messages,
  };

  /* ── 1. Local CRM dashboard ───────────────────────────────── */
  if (window.SageCRM && typeof window.SageCRM.createLead === "function") {
    window.SageCRM.createLead({
      name:   payload.name,
      email:  payload.email,
      phone:  payload.phone,
      source: "chatbot",
    });
    console.info("[Sage AI] Lead saved to CRM dashboard.");
  }

  /* ── 2. Make.com webhook ──────────────────────────────────── */
  if (CONFIG.webhookUrl) {
    try {
      const res = await fetch(CONFIG.webhookUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (res.ok) {
        console.info("[Sage AI] ✅ Lead sent to Make.com successfully.");
      } else {
        console.warn("[Sage AI] ⚠️ Make.com returned status:", res.status);
      }
    } catch (err) {
      // Non-fatal — lead is already in local CRM
      console.error("[Sage AI] ⚠️ Make.com webhook failed:", err.message);
    }
  }

  /* ── 3. Thank the user ────────────────────────────────────── */
  appendMessage(
    "bot",
    "✅ Perfect! Our team has your details and will reach out to you very soon.\n\nIs there anything else I can help you with in the meantime?"
  );
}

/* ============================================================
   SECTION 13 — MAIN MESSAGE HANDLER
   ─────────────────────────────────────────────────────────────
   Priority order:
     1. If already in lead flow → route to handleLeadReply
     2. If threshold reached   → AI reply (if available) THEN lead capture
     3. Otherwise              → normal AI call
   ============================================================ */
async function handleUserMessage() {
  const input = document.getElementById("sage-input");
  if (!input) return;

  const text = input.value.trim();
  if (!text || STATE.aiPending) return;

  // Clear textarea
  input.value = "";
  input.style.height = "auto";

  // Show user bubble + count
  appendMessage("user", text);
  STATE.userMsgCount++;
  saveSession();

  // ── 1. Still in lead-capture flow ───────────────────────────
  if (STATE.leadMode) {
    await handleLeadReply(text);
    return;
  }

  // ── 2. Lead already submitted — just keep chatting ──────────
  if (STATE.leadSubmitted) {
    await sendToAI(text);
    return;
  }

  // ── 3. Threshold reached ────────────────────────────────────
  //   Answer with AI first (if backend exists), then ask for lead.
  //   If no backend, give a canned reply then immediately capture.
  if (STATE.userMsgCount >= CONFIG.leadAfterMsgs) {
    await sendToAI(text);                       // works even with no endpoint
    await delay(400);                           // short natural pause
    if (!STATE.leadMode && !STATE.leadSubmitted) {
      startLeadCapture();
    }
    return;
  }

  // ── 4. Normal message — call AI ─────────────────────────────
  await sendToAI(text);
}

/* ============================================================
   SECTION 14 — SESSION RESTORE ON PAGE LOAD
   ============================================================ */
function restoreSession() {
  const saved = loadSession();

  if (saved && saved.conversationId) {
    STATE.conversationId = saved.conversationId;
    STATE.userMsgCount   = saved.userMsgCount  || 0;
    STATE.leadSubmitted  = saved.leadSubmitted || false;
    STATE.leadData       = saved.leadData      || {};

    if (Array.isArray(saved.messages)) {
      saved.messages.forEach(({ role, text, time }) =>
        appendMessage(role, text, time, false)
      );
      STATE.messages = saved.messages;
    }
  } else {
    // Fresh session
    STATE.conversationId = generateId();
    appendMessage("bot", CONFIG.welcomeMessage, Date.now(), false);
    STATE.messages = [{ role: "bot", text: CONFIG.welcomeMessage, time: Date.now() }];
    saveSession();
  }
}

/* ============================================================
   SECTION 15 — EVENT LISTENERS
   ============================================================ */
function attachEvents() {
  document.getElementById("sage-toggle-btn").addEventListener("click", toggleChat);
  document.getElementById("sage-close-btn").addEventListener("click",  closeChat);
  document.getElementById("sage-theme-btn").addEventListener("click",  toggleTheme);
  document.getElementById("sage-send-btn").addEventListener("click",   handleUserMessage);

  const input = document.getElementById("sage-input");

  // Enter to send, Shift+Enter for newline
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleUserMessage();
    }
  });

  // Auto-grow textarea up to 120px
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  // Sync with OS dark-mode changes
  if (CONFIG.darkMode === "auto") {
    window.matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => applyTheme(null));
  }

  // Close chat when tapping outside (mobile)
  document.addEventListener("click", e => {
    if (!STATE.isOpen) return;
    const win    = document.getElementById("sage-chat-window");
    const toggle = document.getElementById("sage-toggle-btn");
    if (!win.contains(e.target) && !toggle.contains(e.target)) closeChat();
  });
}

/* ============================================================
   SECTION 16 — PUBLIC API  (window.SageAI)
   ============================================================ */
window.SageAI = {
  open:         openChat,
  close:        closeChat,
  toggle:       toggleChat,
  clearHistory: () => { clearSession(); location.reload(); },
  getState:     () => ({ ...STATE }),
  // Update config at runtime, e.g. SageAI.setConfig({ primaryColor:"#7c3aed" })
  setConfig:    overrides => { Object.assign(CONFIG, overrides); applyTheme(null); },
};

/* ============================================================
   SECTION 17 — INIT
   ============================================================ */
function init() {
  injectCSS();
  buildWidget();
  attachEvents();
  restoreSession();

  // Show red badge after 3 s if user hasn't opened the chat
  setTimeout(() => {
    if (!STATE.isOpen) {
      const badge = document.getElementById("sage-badge");
      if (badge) badge.classList.add("visible");
    }
  }, 3000);

  console.info("[Sage AI] v1.2 ready | ID:", STATE.conversationId);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
