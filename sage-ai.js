/*!
 * Sage AI Assistant Widget  v1.3 — FINAL FIXED
 * ✅ Lead capture ALWAYS triggers after N messages
 * ✅ Works with Groq / any AI backend OR no backend
 * ✅ Fires Make.com webhook with name + email + phone
 * ✅ Pushes lead into CRM dashboard
 */

/* ============================================================
   SECTION 1 — CONFIGURATION
   ▸ Edit only this block to customise.
   ============================================================ */
const CONFIG = {
  companyName:    "Sage AI Assistant",
  primaryColor:   "#2563eb",
  secondaryColor: "#f8fafc",
  accentColor:    "#1e40af",
  welcomeMessage: "👋 Hi! I'm Sage AI Assistant. How can I help you today?",
  subtitle:       "Powered by AI",
  logo:           "",
  logoEmoji:      "🤖",
  darkMode:       "auto",
  showFooter:     true,

  // Your Groq proxy / AI backend — leave "" if none
  aiApiEndpoint: "",

  // Your Make.com Custom Webhook URL
  webhookUrl: "https://hook.us2.make.com/ultvm1gntfk7siuqsx442tnoaj7n2p6s",

  // After how many USER messages the bot asks for contact info
  leadAfterMsgs: 3,

  cssHref: "sage-ai.css",
};

/* ============================================================
   SECTION 2 — STATE  (never persisted between reloads wrong)
   ============================================================ */
const STATE = {
  isOpen:         false,
  conversationId: null,
  messages:       [],
  userMsgCount:   0,
  leadMode:       false,
  leadStep:       0,    // 0=name 1=email 2=phone
  leadData:       {},
  leadSubmitted:  false,
  aiPending:      false,
};

/* ============================================================
   SECTION 3 — STORAGE
   ============================================================ */
const STORAGE_KEY = "sage_ai_v13"; // bumped key — clears old broken sessions

function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      conversationId: STATE.conversationId,
      messages:       STATE.messages,
      userMsgCount:   STATE.userMsgCount,
      leadSubmitted:  STATE.leadSubmitted,
      leadData:       STATE.leadData,
    }));
  } catch (_) {}
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
   SECTION 4 — UTILITIES
   ============================================================ */
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function escHtml(str) {
  const m = { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" };
  return String(str || "").replace(/[&<>"']/g, c => m[c]);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ============================================================
   SECTION 5 — BUILD WIDGET HTML
   ============================================================ */
function injectCSS() {
  if (document.getElementById("sage-ai-styles")) return;
  const link = document.createElement("link");
  link.id = "sage-ai-styles"; link.rel = "stylesheet"; link.href = CONFIG.cssHref;
  document.head.appendChild(link);
  const gf = document.createElement("link");
  gf.rel = "preconnect"; gf.href = "https://fonts.googleapis.com";
  document.head.appendChild(gf);
  const gf2 = document.createElement("link");
  gf2.rel = "stylesheet"; gf2.crossOrigin = "anonymous";
  gf2.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(gf2);
}

function buildWidget() {
  const widget = document.createElement("div");
  widget.id = "sage-ai-widget";
  applyTheme(widget);
  widget.innerHTML = `
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
    <div id="sage-chat-window" role="dialog" aria-modal="true" aria-label="Sage AI Chat">
      <div id="sage-header">
        <div id="sage-avatar">${CONFIG.logo ? `<img src="${escHtml(CONFIG.logo)}" alt="logo">` : CONFIG.logoEmoji}</div>
        <div id="sage-header-info">
          <div id="sage-header-name">${escHtml(CONFIG.companyName)}</div>
          <div id="sage-header-subtitle">
            <span id="sage-status-dot"></span>${escHtml(CONFIG.subtitle)}
          </div>
        </div>
        <div id="sage-header-actions">
          <button class="sage-header-btn" id="sage-theme-btn" title="Toggle dark mode" aria-label="Toggle dark mode">
            <svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <button class="sage-header-btn" id="sage-close-btn" title="Close" aria-label="Close chat">
            <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
        </div>
      </div>
      <div id="sage-messages" aria-live="polite"></div>
      <div id="sage-typing" role="status">
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
        <textarea id="sage-input" rows="1" placeholder="Type a message…"
                  aria-label="Message input" maxlength="2000"></textarea>
        <button id="sage-send-btn" aria-label="Send message">
          <svg viewBox="0 0 24 24">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      ${CONFIG.showFooter ? `<div id="sage-footer">Powered by <strong>Sage AI</strong></div>` : ""}
    </div>`;
  document.body.appendChild(widget);
}

/* ============================================================
   SECTION 6 — THEME
   ============================================================ */
function applyTheme(el) {
  el = el || document.getElementById("sage-ai-widget");
  if (!el) return;
  let t = CONFIG.darkMode;
  if (t === "auto") t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  el.dataset.theme = t;
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
  document.getElementById("sage-chat-window").classList.add("open");
  const btn = document.getElementById("sage-toggle-btn");
  btn.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
  document.getElementById("sage-badge").classList.remove("visible");
  setTimeout(() => { const i = document.getElementById("sage-input"); if (i) i.focus(); }, 350);
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
function formatTime(ts) {
  return (ts ? new Date(ts) : new Date()).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
}

function appendMessage(role, text, ts, persist = true) {
  const list = document.getElementById("sage-messages");
  if (!list) return;
  const time = ts || Date.now();
  const row  = document.createElement("div");
  row.className = `sage-msg-row ${role}`;
  row.innerHTML = role === "bot"
    ? `<div class="sage-msg-avatar">${CONFIG.logoEmoji}</div>
       <div><div class="sage-bubble">${escHtml(text)}</div>
       <div class="sage-ts">${formatTime(time)}</div></div>`
    : `<div><div class="sage-bubble">${escHtml(text)}</div>
       <div class="sage-ts">${formatTime(time)}</div></div>`;
  list.appendChild(row);
  scrollToBottom();
  if (persist) { STATE.messages.push({ role, text, time }); saveSession(); }
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

/* ============================================================
   SECTION 10 — AI CALL  (Groq / OpenAI / any backend)
   NOTE: This function NEVER touches STATE.aiPending from outside.
   The pending flag only blocks duplicate sends, not lead capture.
   ============================================================ */
async function callAI(userMessage) {
  // No endpoint → return a canned reply string
  if (!CONFIG.aiApiEndpoint) {
    await wait(800);
    return "Thanks for reaching out! Let me get someone to help you. 🙌";
  }

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

    // Backend can force lead-capture with { capture_lead: true }
    if (data.capture_lead === true) return "__CAPTURE_LEAD__";

    return data.reply || "I didn't catch that — could you rephrase?";
  } catch (err) {
    console.error("[Sage AI] API error:", err);
    return "Sorry, I'm having a connection issue. Let me connect you with our team instead.";
  }
}

/* ============================================================
   SECTION 11 — LEAD CAPTURE FLOW
   Asks: name → email → phone → fires webhook
   ============================================================ */
function startLeadCapture() {
  // Guard: only start once
  if (STATE.leadMode || STATE.leadSubmitted) return;
  STATE.leadMode = true;
  STATE.leadStep = 0;
  STATE.leadData = {};
  appendMessage("bot", "Before I connect you with our team, may I have your name? 😊");
}

async function handleLeadStep(text) {
  // Always returns true (consumed) while in lead flow
  const val = text.trim();

  switch (STATE.leadStep) {

    // ── STEP 0: name ──────────────────────────────────────────
    case 0:
      if (val.length < 2) {
        showTyping(); await wait(500); hideTyping();
        appendMessage("bot", "Please enter your full name so we can address you properly.");
        return;
      }
      STATE.leadData.name = val;
      STATE.leadStep = 1;
      showTyping(); await wait(700); hideTyping();
      appendMessage("bot",
        `Nice to meet you, ${escHtml(STATE.leadData.name)}! 👋\nWhat is your email address?`
      );
      break;

    // ── STEP 1: email ─────────────────────────────────────────
    case 1:
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        showTyping(); await wait(600); hideTyping();
        appendMessage("bot",
          "That doesn't look like a valid email. Please check it — e.g. you@company.com"
        );
        return; // stay on step 1
      }
      STATE.leadData.email = val;
      STATE.leadStep = 2;
      showTyping(); await wait(700); hideTyping();
      appendMessage("bot",
        "Got it! 📧\nAnd your phone number? (type skip to skip)"
      );
      break;

    // ── STEP 2: phone → submit ────────────────────────────────
    case 2:
      STATE.leadData.phone = val.toLowerCase() === "skip" ? "" : val;
      STATE.leadMode  = false;
      STATE.leadStep  = 0;
      showTyping(); await wait(900); hideTyping();
      await submitLead();
      break;
  }
}

/* ============================================================
   SECTION 12 — SUBMIT LEAD
   Fires:  1. Local CRM (crm.js)
           2. Make.com webhook
   ============================================================ */
async function submitLead() {
  if (STATE.leadSubmitted) return;
  STATE.leadSubmitted = true; // lock before any async
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

  // 1. Push into local CRM dashboard
  if (window.SageCRM && typeof window.SageCRM.createLead === "function") {
    window.SageCRM.createLead({
      name:   payload.name,
      email:  payload.email,
      phone:  payload.phone,
      source: "chatbot",
    });
    console.info("[Sage AI] Lead saved to CRM.");
  }

  // 2. Send to Make.com
  if (CONFIG.webhookUrl) {
    try {
      const res = await fetch(CONFIG.webhookUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      console.info("[Sage AI] Webhook status:", res.status);
    } catch (err) {
      console.error("[Sage AI] Webhook error (lead still in CRM):", err.message);
    }
  }

  appendMessage("bot",
    "✅ Perfect! Our team has your details and will be in touch very soon.\n\nIs there anything else I can help you with?"
  );
}

/* ============================================================
   SECTION 13 — MAIN MESSAGE HANDLER
   ─────────────────────────────────────────────────────────────
   This is the ONLY entry point for user messages.

   Flow:
   ┌─ Is leadMode ON? ──────────────► handleLeadStep() → return
   │
   ├─ Is leadSubmitted? ────────────► just call AI → return
   │
   ├─ userMsgCount >= leadAfterMsgs? ► call AI, then startLeadCapture()
   │
   └─ otherwise ────────────────────► call AI normally

   KEY FIX: We do NOT use STATE.aiPending as a gate here.
   The pending flag only prevents double-tapping Send.
   Lead capture logic runs AFTER the AI promise resolves.
   ============================================================ */
async function handleUserMessage() {
  const input = document.getElementById("sage-input");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  // Prevent double-tap while a message is being processed
  if (STATE.aiPending) return;

  // Clear input immediately so user sees it was accepted
  input.value = "";
  input.style.height = "auto";

  // Show user bubble
  appendMessage("user", text);
  STATE.userMsgCount++;
  saveSession();

  /* ── CASE 1: In the middle of collecting lead info ────────── */
  if (STATE.leadMode) {
    await handleLeadStep(text);
    return;
  }

  /* ── CASE 2: Lead already collected — just chat ──────────── */
  if (STATE.leadSubmitted) {
    STATE.aiPending = true;
    lockUI(true);
    showTyping();
    const reply = await callAI(text);
    hideTyping();
    appendMessage("bot", reply);
    STATE.aiPending = false;
    lockUI(false);
    return;
  }

  /* ── CASE 3: Threshold reached — answer THEN capture ─────── */
  if (STATE.userMsgCount >= CONFIG.leadAfterMsgs) {
    STATE.aiPending = true;
    lockUI(true);
    showTyping();
    const reply = await callAI(text);
    hideTyping();
    STATE.aiPending = false;
    lockUI(false);

    if (reply === "__CAPTURE_LEAD__") {
      startLeadCapture();
      return;
    }

    appendMessage("bot", reply);

    // Small natural pause, then ask for contact info
    await wait(500);
    startLeadCapture();
    return;
  }

  /* ── CASE 4: Normal message — just call AI ────────────────── */
  STATE.aiPending = true;
  lockUI(true);
  showTyping();
  const reply = await callAI(text);
  hideTyping();
  STATE.aiPending = false;
  lockUI(false);
  appendMessage("bot", reply);
}

function lockUI(locked) {
  const btn = document.getElementById("sage-send-btn");
  const inp = document.getElementById("sage-input");
  if (btn) btn.disabled = locked;
  if (inp) inp.disabled = locked;
}

/* ============================================================
   SECTION 14 — SESSION RESTORE
   ============================================================ */
function restoreSession() {
  const saved = loadSession();

  if (saved && saved.conversationId) {
    STATE.conversationId = saved.conversationId;
    STATE.userMsgCount   = saved.userMsgCount  || 0;
    STATE.leadSubmitted  = saved.leadSubmitted || false;
    STATE.leadData       = saved.leadData      || {};

    if (Array.isArray(saved.messages) && saved.messages.length > 0) {
      saved.messages.forEach(({ role, text, time }) =>
        appendMessage(role, text, time, false)
      );
      STATE.messages = saved.messages;
      return;
    }
  }

  // Fresh session
  STATE.conversationId = generateId();
  appendMessage("bot", CONFIG.welcomeMessage, Date.now(), false);
  STATE.messages = [{ role: "bot", text: CONFIG.welcomeMessage, time: Date.now() }];
  saveSession();
}

/* ============================================================
   SECTION 15 — EVENTS
   ============================================================ */
function attachEvents() {
  document.getElementById("sage-toggle-btn").addEventListener("click", toggleChat);
  document.getElementById("sage-close-btn").addEventListener("click",  closeChat);
  document.getElementById("sage-theme-btn").addEventListener("click",  toggleTheme);
  document.getElementById("sage-send-btn").addEventListener("click",   handleUserMessage);

  const inp = document.getElementById("sage-input");
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleUserMessage(); }
  });
  inp.addEventListener("input", () => {
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight, 120) + "px";
  });

  if (CONFIG.darkMode === "auto") {
    window.matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => applyTheme(null));
  }

  // Close on outside tap (mobile)
  document.addEventListener("click", e => {
    if (!STATE.isOpen) return;
    const win = document.getElementById("sage-chat-window");
    const tog = document.getElementById("sage-toggle-btn");
    if (!win.contains(e.target) && !tog.contains(e.target)) closeChat();
  });
}

/* ============================================================
   SECTION 16 — PUBLIC API
   ============================================================ */
window.SageAI = {
  open:         openChat,
  close:        closeChat,
  toggle:       toggleChat,
  clearHistory: () => { clearSession(); location.reload(); },
  getState:     () => ({ ...STATE }),
  setConfig:    o  => { Object.assign(CONFIG, o); applyTheme(null); },
};

/* ============================================================
   SECTION 17 — INIT
   ============================================================ */
function init() {
  injectCSS();
  buildWidget();
  attachEvents();
  restoreSession();
  setTimeout(() => {
    if (!STATE.isOpen) {
      const b = document.getElementById("sage-badge");
      if (b) b.classList.add("visible");
    }
  }, 3000);
  console.info("[Sage AI] v1.3 ready | ID:", STATE.conversationId,
               "| msgs:", STATE.userMsgCount,
               "| submitted:", STATE.leadSubmitted);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
