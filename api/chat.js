export default async function handler(req, res) {
  // Allow requests from any origin (required for browser fetch calls)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle CORS preflight
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, history = [] } = req.body;

    if (!message) return res.status(400).json({ error: "No message provided" });

    // Build conversation history in Gemini format
    // history comes from sage-ai.js as [{ role: "user"|"bot", text: "..." }]
    const contents = [
      // Previous messages (Gemini uses "model" instead of "bot")
      ...history.slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      })),
      // Current user message
      { role: "user", parts: [{ text: message }] },
    ];

    // Call Gemini API (free tier — gemini-1.5-flash is fast and free)
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              // ✏️ EDIT THIS to describe your business / assistant personality
              text: "You are a helpful assistant. Be friendly, concise, and professional. Answer questions clearly in 1-3 sentences unless more detail is needed."
            }]
          },
          contents,
          generationConfig: {
            maxOutputTokens: 512,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("Gemini error:", err);
      return res.status(502).json({ error: "Gemini API error", detail: err });
    }

    const data = await geminiRes.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm not sure how to answer that.";

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
