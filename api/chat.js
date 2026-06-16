export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "No message provided" });

    const key = process.env.GEMINI_API_KEY;

    // Log key presence (never log the full key)
    console.log("Key present:", !!key, "Key length:", key?.length, "Key start:", key?.substring(0, 6));

    const contents = [
      ...history.slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    console.log("Calling URL (no key):", url.split("?")[0]);

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "You are a helpful assistant. Be friendly, concise, and professional." }]
        },
        contents,
        generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
      }),
    });

    const rawText = await geminiRes.text();
    console.log("Gemini status:", geminiRes.status);
    console.log("Gemini response:", rawText.substring(0, 500));

    if (!geminiRes.ok) {
      return res.status(502).json({ error: "Gemini API error", detail: rawText });
    }

    const data = JSON.parse(rawText);
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm not sure how to answer that.";
    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
