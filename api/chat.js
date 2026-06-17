export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "No message provided" });

    const messages = [
      { role: "system", content: "You are a helpful business assistant called Sage AI. Be friendly, concise, and professional." },
      ...history.slice(-10).map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text
      })),
      { role: "user", content: message }
    ];

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.Sage_API_Key}`
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages,
        max_tokens: 512,
        temperature: 0.7
      })
    });

    const data = await groqRes.json();
    console.log("Groq status:", groqRes.status);

    if (!groqRes.ok) {
      console.error("Groq error:", JSON.stringify(data));
      return res.status(502).json({ error: "Groq API error", detail: data });
    }

    const reply = data.choices?.[0]?.message?.content || "I'm not sure how to answer that.";
    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
