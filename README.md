# Sage AI Assistant Widget

A production-ready, zero-dependency, embeddable AI chatbot widget.  
Drop **one `<script>` tag** into any website to add a full-featured floating chat interface.

---

## Files

| File | Purpose |
|---|---|
| `sage-ai.js` | Main widget script — all logic lives here |
| `sage-ai.css` | Styles — scoped to `#sage-ai-widget`, safe to embed anywhere |
| `index.html` | Demo page — open locally or deploy as a landing page |
| `README.md` | This file |

---

## 1 — Hosting the Files

### Option A — Your own server / CDN

Upload `sage-ai.js` and `sage-ai.css` to any static host (S3, Cloudflare R2, Netlify, Vercel, GitHub Pages, etc.).

Make sure both files are served from the **same directory** so the JS can find the CSS automatically.  
Or update `CONFIG.cssHref` in `sage-ai.js` to an absolute URL:

```js
cssHref: "https://cdn.example.com/sage-ai.css",
```

### Option B — GitHub Pages (free)

1. Create a public GitHub repository.
2. Push both files to the `main` branch (or `/docs` folder).
3. Enable **Settings → Pages** → Source: `main` branch.
4. Your widget is live at `https://<username>.github.io/<repo>/sage-ai.js`.

### Option C — Netlify Drop (30 seconds)

1. Zip the folder.
2. Drag it to [app.netlify.com/drop](https://app.netlify.com/drop).
3. Done — instant CDN URL.

---

## 2 — Embedding the Chatbot

Add this **single line** before the closing `</body>` tag of any webpage:

```html
<script src="https://yourdomain.com/sage-ai.js"></script>
```

No other dependencies, no npm, no build step. The widget creates its own DOM, styles, and storage.

### Programmatic control (optional)

After the script loads, `window.SageAI` exposes a small public API:

```js
SageAI.open();          // Open chat window
SageAI.close();         // Close chat window
SageAI.toggle();        // Toggle open/closed
SageAI.clearHistory();  // Wipe localStorage and reload
SageAI.getState();      // Returns a copy of the runtime state object
SageAI.setConfig({ primaryColor: "#7c3aed" }); // Update config live
```

---

## 3 — Changing the Branding

Open `sage-ai.js` and edit the `CONFIG` object at the top of the file:

```js
const CONFIG = {
  companyName:    "Your Company Name",
  primaryColor:   "#7c3aed",          // Any valid CSS colour
  accentColor:    "#6d28d9",          // Darker hover/gradient shade
  secondaryColor: "#faf5ff",
  welcomeMessage: "Hi! How can we help you today?",
  subtitle:       "Online · Typically replies in minutes",
  logo:           "https://example.com/logo.png",  // or "" to use emoji
  logoEmoji:      "🟣",               // Used when logo is empty
  darkMode:       "auto",             // "auto" | "light" | "dark"
  showFooter:     true,
};
```

Every change to `CONFIG` is reflected immediately — no build step required.

---

## 4 — Connecting an AI Backend

Set `CONFIG.aiApiEndpoint` to your backend URL:

```js
aiApiEndpoint: "https://api.yourapp.com/chat",
```

### Expected request (POST)

```json
{
  "message": "What are your business hours?",
  "conversation_id": "uuid-string",
  "history": [ { "role": "user", "text": "...", "time": 1700000000000 } ]
}
```

### Expected response

```json
{ "reply": "We're open Monday–Friday, 9 am – 6 pm." }
```

To trigger automatic lead capture from your backend, include:

```json
{ "capture_lead": true }
```

### Connecting OpenAI

Create a thin serverless function (Vercel, Cloudflare Workers, etc.):

```js
// api/chat.js (Vercel Edge Function example)
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req) {
  const { message, history = [] } = await req.json();
  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    ...history.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })),
    { role: "user", content: message },
  ];
  const completion = await client.chat.completions.create({ model: "gpt-4o", messages });
  return Response.json({ reply: completion.choices[0].message.content });
}
```

### Connecting Claude (Anthropic)

```js
// api/chat.js
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req) {
  const { message, history = [] } = await req.json();
  const messages = [
    ...history.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })),
    { role: "user", content: message },
  ];
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: "You are a helpful assistant.",
    messages,
  });
  return Response.json({ reply: response.content[0].text });
}
```

---

## 5 — Connecting a Make.com Webhook

1. In Make.com, create a new **Scenario**.
2. Add a **Webhooks → Custom webhook** trigger — copy the URL it gives you.
3. Paste it into `CONFIG.webhookUrl`:

```js
webhookUrl: "https://hook.eu1.make.com/xxxxxxxxxxxxxxxxxxxx",
```

The widget will POST this payload when lead data is collected:

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1 555 0100",
  "conversation": [ { "role": "user", "text": "...", "time": 1700000000000 } ],
  "timestamp": "2025-01-01T12:00:00.000Z",
  "conversation_id": "uuid-string"
}
```

Use Make.com modules to route this into Gmail, Slack, Notion, HubSpot, or any other app.

---

## 6 — Connecting Zoho CRM

### Option A — via Make.com (recommended)

Use the Make.com webhook (step 5) and add a **Zoho CRM → Create Record** module.  
Map the fields: `name → Last Name`, `email → Email`, `phone → Phone`.

### Option B — Direct Zoho API

1. Create a Zoho OAuth app and get a `client_id` / `client_secret`.
2. Build a small backend endpoint that exchanges the lead payload for a Zoho API call:

```js
// POST to Zoho CRM Leads endpoint
fetch("https://www.zohoapis.com/crm/v2/Leads", {
  method: "POST",
  headers: {
    "Authorization": `Zoho-oauthtoken ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    data: [{
      Last_Name: leadData.name,
      Email:     leadData.email,
      Phone:     leadData.phone,
      Lead_Source: "Website Chat",
    }],
  }),
});
```

Set `CONFIG.webhookUrl` to your backend endpoint.

---

## Future Expansion Hooks

The widget is structured for easy extension without touching core logic:

| Feature | What to do |
|---|---|
| **RAG / Knowledge base** | On your backend, embed the user query, retrieve top-K chunks, and prepend them to the system prompt before calling the LLM. No frontend changes needed. |
| **Streaming responses** | Replace the `fetch` call in `sendToAI()` with an SSE / EventSource reader and append text chunks incrementally. |
| **File uploads** | Add a file input button to `#sage-input-area` and send base64 data in the API request body. |
| **Multi-language** | Add a `CONFIG.locale` key and translate the hardcoded strings at the top of `sage-ai.js`. |
| **Analytics** | Call your analytics SDK inside `appendMessage()` when `role === "user"`. |
| **Auth / user identity** | Pass a JWT or session token in the `sendToAI()` fetch headers. |

---

## Browser Support

Chrome 80+, Firefox 75+, Safari 14+, Edge 80+, iOS Safari 14+.  
Uses `fetch`, `localStorage`, `crypto.randomUUID` (with fallback), and CSS custom properties.

---

## License

MIT — free to use, modify, and distribute.
