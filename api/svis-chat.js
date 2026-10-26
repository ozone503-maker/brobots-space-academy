// Search + AI Visibility page helper. Answers only from the page text.
// Vercel AI Gateway via the platform OIDC token (same pattern as api/chat.js). No API keys.
import { PAGE_TEXT } from "./_lib/svis-content.js";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = process.env.SVIS_MODEL || "openai/gpt-4.1-nano";
const MAX_TOKENS = 220;          // short replies, hard cap
const MAX_TURNS = 8;             // user messages per chat before we close it out
const MAX_INPUT_CHARS = 500;     // per user message
const RATE = { windowMs: 10 * 60 * 1000, max: 15 }; // per IP, per warm instance
const ENABLED = process.env.SVIS_CHAT_DISABLED !== "1";
const QUOTE = "Want us to look at your business? Tap Get a quote and we will send one that fits.";

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE.max;
}

const SYSTEM = [
  "You are the Brobots helper on the Search + AI Visibility service page at brobots.space.",
  "Answer ONLY using the page text below. If the answer is not in it, say you do not have that detail and suggest asking for a quote.",
  "Never invent prices, stats, timelines, guarantees, or results. Packages have no listed prices; every quote is custom.",
  "No one can promise a ranking or an AI mention. The Muse AI visibility score is Brobots' own method, not an industry standard.",
  "Muse is the name of the audit engine. Keep replies to 2 to 4 short sentences, plain, confident, and warm.",
  "Never use em dashes. When it fits, nudge the visitor toward Get a quote.",
  "",
  "PAGE TEXT:",
  PAGE_TEXT,
].join("\n");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ enabled: ENABLED });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!ENABLED) return res.status(503).json({ error: "Chat is offline right now. " + QUOTE });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return res.status(429).json({ error: "That is a lot of questions for one sitting. " + QUOTE });

  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const chat = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_TURNS * 2)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_INPUT_CHARS) }));
  if (!chat.length || chat[chat.length - 1].role !== "user") return res.status(400).json({ error: "Ask a question first." });

  const userTurns = chat.filter((m) => m.role === "user").length;
  if (userTurns > MAX_TURNS) return res.status(200).json({ reply: "Thanks for all the great questions. " + QUOTE, done: true });

  const token = req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return res.status(503).json({ error: "Chat is warming up. " + QUOTE });

  try {
    const r = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, temperature: 0.3, messages: [{ role: "system", content: SYSTEM }, ...chat] }),
    });
    if (!r.ok) {
      console.error("svis gateway", r.status, (await r.text()).slice(0, 300));
      return res.status(502).json({ error: "Chat is offline right now. " + QUOTE });
    }
    const data = await r.json();
    let reply = (data.choices?.[0]?.message?.content || "").replace(/\s*[\u2014\u2013]\s*/g, ", ").trim();
    const last = userTurns >= MAX_TURNS;
    if (last) reply += "\n\n" + QUOTE;
    return res.status(200).json({ reply, done: last });
  } catch (e) {
    console.error("svis error", e);
    return res.status(502).json({ error: "Chat is offline right now. " + QUOTE });
  }
}
