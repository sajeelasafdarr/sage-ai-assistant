/*!
 * Sage AI Assistant Widget
 * Version: 1.0.0
 * Description: Embeddable AI chatbot widget — drop-in, zero-dependency.
 * Usage: <script src="sage-ai.js"></script>
 */

/* ============================================================
   SECTION 1 — CONFIGURATION
   Edit these values to instantly rebrand the chatbot.
   ============================================================ */
const CONFIG = {
  companyName:    "Sage AI Assistant",
  primaryColor:   "#2563eb",          // Main brand colour
  secondaryColor: "#f8fafc",          // Surface / background
  accentColor:    "#1e40af",          // Darker shade for hover / gradient
  welcomeMessage: "👋 Hi! I'm Sage AI Assistant. How can I help you today?",
  subtitle:       "Powered by AI",
  logo:           "",                 // URL to logo image (leave "" to use emoji)
  logoEmoji:      "🤖",               // Fallback avatar emoji
  webhookUrl:     "https://hook.us2.make.com/3e7m3kiyqdv7cpd4nsoxeqgsx3lorvws",                 // Make.com / Zapier / custom webhook endpoint
  aiApiEndpoint:  "/api/chat",                 // Your AI backend URL (see README)
  darkMode:       "auto",             // "auto" | "dark" | "light"
  showFooter:     true,               // Toggle "Powered by Sage AI" footer
  leadAfterMsgs:  5,                  // Trigger lead capture after N user messages
  cssHref:        "sage-ai.css",      // Path/URL to the stylesheet
};

/* ============================================================
   SECTION 2 — STATE
   In-memory runtime state.
   ============================================================ */
const STATE = {
  isOpen:           false,
  conversationId:   null,
  messages:         [],           // { role, text, time }
  userMsgCount:     0,
  leadMode:         false,        // Currently collecting lead info?
  leadStep:         0,            // 0=name, 1=email, 2=phone
  leadData:         {},           // Collected name/email/phone
  leadSubmitted:    false,        // Prevent duplicate submissions
  aiPending:        false,        // Awaiting AI response?
};

/* ============================================================
   SECTION 3 — STORAGE HELPERS
   All persistence goes through these three functions.
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
  } catch (_) { /* storage unavailable */ }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

/* ============================================================
   SECTION 4 — UNIQUE ID GENERATION
   ============================================================ */
function generateId() {
  // crypto.randomUUID is widely supported; fall back to Math.random
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ============================================================
   SECTION 5 — DOM CONSTRUCTION
   Build the full widget markup and inject it into the page.
   ============================================================ */
function injectCSS() {
  // Inject the stylesheet if it hasn't already been loaded
  if (document.getElementById("sage-ai-styles")) return;
  const link = document.createElement("link");
  link.id   = "sage-ai-styles";
  link.rel  = "stylesheet";
  link.href = CONFIG.cssHref;
  document.head.appendChild(link);

  // Also inject Google Fonts (DM Sans) for optimal typography
  const gf = document.createElement("link");
  gf.rel  = "preconnect";
  gf.href = "https://fonts.googleapis.com";
  document.head.appendChild(gf);
  const gf2 = document.createElement("link");
  gf2.rel         = "stylesheet";
  gf2.crossOrigin = "anonymous";
  gf2.href        = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(gf2);
}

function buildWidget() {
  // ── Wrapper (scopes all CSS vars and prevents bleed) ──
  const widget = document.createElement("div");
  widget.id = "sage-ai-widget";
  applyTheme(widget);

  // ── Toggle button ──────────────────────────────────────
  widget.innerHTML = `
    <!-- Floating chat toggle button -->
    <button id="sage-toggle-btn" aria-label="Open chat" aria-expanded="false">
      <!-- Chat bubble icon -->
      <svg class="icon-chat" viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <!-- Close X icon -->
      <svg class="icon-close" viewBox="0 0 24 24">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
      <!-- Notification badge -->
      <span id="sage-badge" aria-hidden="true">1</span>
    </button>

    <!-- Chat window -->
    <div id="sage-chat-window" role="dialog" aria-modal="true" aria-label="Sage AI Chat">

      <!-- Header -->
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
          <!-- Dark mode toggle -->
          <button class="sage-header-btn" id="sage-theme-btn" title="Toggle dark mode" aria-label="Toggle dark mode">
            <svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <!-- Minimise -->
          <button class="sage-header-btn" id="sage-close-btn" title="Close chat" aria-label="Close chat">
            <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
        </div>
      </div>

      <!-- Message list -->
      <div id="sage-messages" aria-live="polite" aria-label="Messages"></div>

      <!-- Typing indicator (shown while AI is "thinking") -->
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

      <!-- Text input bar -->
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

      <!-- Optional footer -->
      ${CONFIG.showFooter ? `<div id="sage-footer">Powered by <strong>Sage AI</strong></div>` : ""}
    </div>
  `;

  document.body.appendChild(widget);
}

function buildAvatar() {
  if (CONFIG.logo) {
    return `<img src="${escHtml(CONFIG.logo)}" alt="${escHtml(CONFIG.companyName)} logo">`;
  }
  return CONFIG.logoEmoji;
}

/* ============================================================
   SECTION 6 — THEME MANAGEMENT
   ============================================================ */
function applyTheme(widget) {
  const el = widget || document.getElementById("sage-ai-widget");
  if (!el) return;

  let theme = CONFIG.darkMode;
  if (theme === "auto") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  el.dataset.theme = theme;

  // Apply CONFIG colours as CSS custom properties
  el.style.setProperty("--sage-primary",      CONFIG.primaryColor);
  el.style.setProperty("--sage-primary-dark", CONFIG.accentColor);
  el.style.setProperty("--sage-secondary",    CONFIG.secondaryColor);
}

function toggleTheme() {
  const el = document.getElementById("sage-ai-widget");
  if (!el) return;
  el.dataset.theme = el.dataset.theme === "dark" ? "light" : "dark";
}

/* ============================================================
   SECTION 7 — OPEN / CLOSE LOGIC
   ============================================================ */
function openChat() {
  STATE.isOpen = true;
  const win = document.getElementById("sage-chat-window");
  const btn = document.getElementById("sage-toggle-btn");
  const badge = document.getElementById("sage-badge");

  win.classList.add("open");
  btn.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
  badge.classList.remove("visible");

  // Focus input
  setTimeout(() => {
    const input = document.getElementById("sage-input");
    if (input) input.focus();
  }, 350);

  scrollToBottom();
}

function closeChat() {
  STATE.isOpen = false;
  const win = document.getElementById("sage-chat-window");
  const btn = document.getElementById("sage-toggle-btn");

  win.classList.remove("open");
  btn.classList.remove("open");
  btn.setAttribute("aria-expanded", "false");
}

function toggleChat() {
  STATE.isOpen ? closeChat() : openChat();
}

/* ============================================================
   SECTION 8 — MESSAGE RENDERING
   ============================================================ */
function formatTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(str).replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * Append a chat bubble to the message list.
 * @param {string} role  "user" | "bot"
 * @param {string} text  Message content (plain text)
 * @param {number} ts    Unix timestamp (ms)
 * @param {boolean} persist  Save to localStorage?
 */
function appendMessage(role, text, ts, persist = true) {
  const msgList = document.getElementById("sage-messages");
  if (!msgList) return;

  const time = ts || Date.now();
  const timeStr = formatTime(time);

  const row = document.createElement("div");
  row.className = `sage-msg-row ${role}`;

  if (role === "bot") {
    row.innerHTML = `
      <div class="sage-msg-avatar">${CONFIG.logoEmoji}</div>
      <div>
        <div class="sage-bubble">${escHtml(text)}</div>
        <div class="sage-ts">${timeStr}</div>
      </div>
    `;
  } else {
    row.innerHTML = `
      <div>
        <div class="sage-bubble">${escHtml(text)}</div>
        <div class="sage-ts">${timeStr}</div>
      </div>
    `;
  }

  msgList.appendChild(row);
  scrollToBottom();

  // Persist
  if (persist) {
    STATE.messages.push({ role, text, time });
    saveSession();
  }
}

function scrollToBottom() {
  const el = document.getElementById("sage-messages");
  if (el) {
    // Use requestAnimationFrame so the DOM has painted
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }
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
   SECTION 10 — AI API COMMUNICATION
   ============================================================ */
/**
 * Send a message to the AI backend and display the response.
 * Falls back gracefully if no endpoint is configured.
 *
 * @param {string} userMessage
 */
async function sendToAI(userMessage) {
  if (STATE.aiPending) return;
  STATE.aiPending = true;

  // Disable send button
  const sendBtn = document.getElementById("sage-send-btn");
  if (sendBtn) sendBtn.disabled = true;

  showTyping();

  // If no endpoint is configured, reply with a placeholder
  if (!CONFIG.aiApiEndpoint) {
    await fakeBotDelay();
    hideTyping();
    appendMessage("bot", "I'm Sage AI. Connect me to a real AI backend via CONFIG.aiApiEndpoint to get live responses!");
    STATE.aiPending = false;
    if (sendBtn) sendBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch(CONFIG.aiApiEndpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        message:         userMessage,
        conversation_id: STATE.conversationId,
        history:         STATE.messages.slice(-10), // send last 10 messages for context
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    hideTyping();

    // Check for lead-capture flag from backend
    if (data.capture_lead === true && !STATE.leadSubmitted) {
      startLeadCapture();
      STATE.aiPending = false;
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    const reply = data.reply || "I didn't get a response. Please try again.";
    appendMessage("bot", reply);

  } catch (err) {
    console.error("[Sage AI] API error:", err);
    hideTyping();
    appendMessage("bot", "Sorry, I'm having trouble connecting right now. Please try again later.");
  }

  STATE.aiPending = false;
  if (sendBtn) sendBtn.disabled = false;
}

/** Simulate typing delay (used when no endpoint is configured) */
function fakeBotDelay(ms = 1200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ============================================================
   SECTION 11 — LEAD CAPTURE FLOW
   ============================================================ */
function startLeadCapture() {
  if (STATE.leadMode || STATE.leadSubmitted) return;
  STATE.leadMode = true;
  STATE.leadStep = 0;
  STATE.leadData = {};

  appendMessage("bot",
    "I'd be happy to have our team assist you further. May I have your name?"
  );
}

/**
 * Handle a user reply during the lead capture conversation.
 * Returns true if we consumed the message (still in lead flow).
 */
async function handleLeadReply(text) {
  if (!STATE.leadMode) return false;

  switch (STATE.leadStep) {
    case 0: // Awaiting name
      STATE.leadData.name = text;
      STATE.leadStep = 1;
      showTyping();
      await fakeBotDelay(700);
      hideTyping();
      appendMessage("bot", `Nice to meet you, ${escHtml(STATE.leadData.name)}! 😊 What's your email address?`);
      break;

    case 1: // Awaiting email
      if (!isValidEmail(text)) {
        showTyping();
        await fakeBotDelay(600);
        hideTyping();
        appendMessage("bot", "That doesn't look like a valid email address. Could you please check it?");
        return true; // Stay on step 1
      }
      STATE.leadData.email = text;
      STATE.leadStep = 2;
      showTyping();
      await fakeBotDelay(700);
      hideTyping();
      appendMessage("bot", "Perfect! And your phone number? (You can skip this by typing 'skip')");
      break;

    case 2: // Awaiting phone
      STATE.leadData.phone = text.toLowerCase() === "skip" ? "" : text;
      STATE.leadMode = false;

      showTyping();
      await fakeBotDelay(900);
      hideTyping();

      await submitLead();
      break;
  }

  return true;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function submitLead() {
  if (STATE.leadSubmitted) return;

  const payload = {
    name:            STATE.leadData.name    || "",
    email:           STATE.leadData.email   || "",
    phone:           STATE.leadData.phone   || "",
    conversation:    STATE.messages,
    timestamp:       new Date().toISOString(),
    conversation_id: STATE.conversationId,
  };

  try {
    if (CONFIG.webhookUrl) {
      await fetch(CONFIG.webhookUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
    }

    STATE.leadSubmitted = true;
    saveSession();

    appendMessage("bot", "✅ Thank you! Our team will contact you shortly. Is there anything else I can help you with?");

  } catch (err) {
    console.error("[Sage AI] Webhook error:", err);
    appendMessage("bot", "✅ Thank you for your information! We'll be in touch soon.");
    STATE.leadSubmitted = true;
    saveSession();
  }
}

/* ============================================================
   SECTION 12 — USER MESSAGE HANDLING
   ============================================================ */
async function handleUserMessage() {
  const input = document.getElementById("sage-input");
  if (!input) return;

  const text = input.value.trim();
  if (!text || STATE.aiPending) return;

  // Clear input
  input.value = "";
  input.style.height = "auto";

  // Display user message
  appendMessage("user", text);

  // Track message count (for lead-capture threshold)
  STATE.userMsgCount++;
  saveSession();

  // ── Lead capture mode? ──
  if (STATE.leadMode) {
    await handleLeadReply(text);
    return;
  }

  // ── Lead capture threshold reached? ──
  if (STATE.userMsgCount >= CONFIG.leadAfterMsgs && !STATE.leadSubmitted) {
    await sendToAI(text); // Still send last message to AI first
    // Let the AI decide; if no capture_lead flag, handle threshold here
    if (!STATE.leadMode && !STATE.leadSubmitted) {
      // We'll defer to the next message exchange
    }
    return;
  }

  // ── Normal AI call ──
  await sendToAI(text);
}

/* ============================================================
   SECTION 13 — SESSION RESTORATION
   Replay persisted messages without making new API calls.
   ============================================================ */
function restoreSession() {
  const saved = loadSession();

  if (saved && saved.conversationId) {
    STATE.conversationId  = saved.conversationId;
    STATE.userMsgCount    = saved.userMsgCount    || 0;
    STATE.leadSubmitted   = saved.leadSubmitted   || false;
    STATE.leadData        = saved.leadData        || {};

    // Replay messages into DOM
    if (Array.isArray(saved.messages)) {
      saved.messages.forEach(({ role, text, time }) => {
        appendMessage(role, text, time, false /* don't re-save */);
      });
      STATE.messages = saved.messages;
    }
  } else {
    // Brand new session
    STATE.conversationId = generateId();
    appendMessage("bot", CONFIG.welcomeMessage, Date.now(), false);
    STATE.messages = [{ role: "bot", text: CONFIG.welcomeMessage, time: Date.now() }];
    saveSession();
  }
}

/* ============================================================
   SECTION 14 — EVENT LISTENERS
   ============================================================ */
function attachEvents() {
  const toggleBtn  = document.getElementById("sage-toggle-btn");
  const closeBtn   = document.getElementById("sage-close-btn");
  const themeBtn   = document.getElementById("sage-theme-btn");
  const sendBtn    = document.getElementById("sage-send-btn");
  const input      = document.getElementById("sage-input");

  toggleBtn.addEventListener("click", toggleChat);
  closeBtn.addEventListener("click",  closeChat);
  themeBtn.addEventListener("click",  toggleTheme);
  sendBtn.addEventListener("click",   handleUserMessage);

  // Send on Enter (Shift+Enter = newline)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleUserMessage();
    }
  });

  // Auto-grow textarea
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  // Respond to OS dark-mode changes when CONFIG.darkMode === "auto"
  if (CONFIG.darkMode === "auto") {
    window.matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => applyTheme(null));
  }

  // Close chat when clicking the backdrop on mobile
  document.addEventListener("click", (e) => {
    if (!STATE.isOpen) return;
    const win    = document.getElementById("sage-chat-window");
    const toggle = document.getElementById("sage-toggle-btn");
    if (!win.contains(e.target) && !toggle.contains(e.target)) {
      closeChat();
    }
  });
}

/* ============================================================
   SECTION 15 — PUBLIC API
   Expose a small surface on window for advanced integrations.
   ============================================================ */
window.SageAI = {
  open:          openChat,
  close:         closeChat,
  toggle:        toggleChat,
  sendMessage:   handleUserMessage,
  clearHistory:  () => { clearSession(); location.reload(); },
  getState:      () => ({ ...STATE }),
  setConfig:     (overrides) => {
    Object.assign(CONFIG, overrides);
    applyTheme(null);
  },
};

/* ============================================================
   SECTION 16 — INITIALISATION
   ============================================================ */
function init() {
  injectCSS();
  buildWidget();
  attachEvents();
  restoreSession();

  // Show badge after 3 s if chat hasn't been opened yet
  setTimeout(() => {
    if (!STATE.isOpen) {
      const badge = document.getElementById("sage-badge");
      if (badge) badge.classList.add("visible");
    }
  }, 3000);

  console.info("[Sage AI] Widget initialised. Conversation ID:", STATE.conversationId);
}

/* ── Kick off after DOM is ready ─────────────────────────────── */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
