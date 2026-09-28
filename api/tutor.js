// /api/tutor.js
// Vercel Serverless Function — the Brobots Tutor on the homepage.
// POST { messages: [{role, content}, ...] } → { reply }
// Personality and lessons live in tutor/tutor.txt (plain text, edit any time).
// Talks through the Vercel AI Gateway using the platform's OIDC token. No API keys.

import fs from "fs";
import path from "path";

const TUTOR_PATH = path.join(process.cwd(), "tutor", "tutor.txt");

// Vercel AI Gateway (OpenAI-compatible Chat Completions endpoint)
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
// Fast, inexpensive default. Override with the TUTOR_MODEL setting.
const DEFAULT_MODEL = "openai/gpt-4.1-mini";

// Cost guards — same limits as api/chat.js on the ai-gateway-chat branch.
const MAX_TOKENS = 700;
const MAX_MESSAGES = 20; // only the most recent turns are sent
const MAX_MESSAGE_CHARS = 2000; // per message
const MAX_TOTAL_CHARS = 12000; // whole conversation
const TIMEOUT_MS = 25000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to talk to the tutor." });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages[] is required" });
  }

  const chat = sanitizeMessages(messages);
  if (!chat.length || chat[chat.length - 1].role !== "user") {
    return res.status(400).json({ error: "Say something first." });
  }
  const last = messages[messages.length - 1];
  if (typeof last?.content === "string" && last.content.length > MAX_MESSAGE_CHARS) {
    return res.status(413).json({
      error: `That message is too long. Keep it under ${MAX_MESSAGE_CHARS} characters.`,
    });
  }

  let tutorFile;
  try {
    tutorFile = fs.readFileSync(TUTOR_PATH, "utf-8");
  } catch (err) {
    console.error("Tutor file missing", err);
    return res.status(500).json({ error: "The tutor's notes are missing. Try again later." });
  }

  // Auth: the Vercel OIDC token the platform gives this function
  // (header at runtime, env var as a fallback). No API keys anywhere.
  const token = req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) {
    return res.status(503).json({
      error: "The tutor is powering up. The AI Gateway isn't connected yet, try again later.",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: process.env.TUTOR_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "system", content: tutorFile }, ...chat],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("AI Gateway error", response.status, errText.slice(0, 500));
      return res.status(502).json({ error: friendlyGatewayError(response.status, errText) });
    }

    const data = await response.json();
    const reply = (data.choices?.[0]?.message?.content || "").trim();
    if (!reply) {
      return res.status(502).json({ error: "Static on the line. Try again." });
    }
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Tutor error", err);
    const timedOut = err?.name === "AbortError";
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut
        ? "The tutor is taking too long to answer. Try again."
        : "Connection hiccup. Try again.",
    });
  } finally {
    clearTimeout(timer);
  }
}

// Keep only well-formed user/assistant text turns, trimmed to the cost caps.
function sanitizeMessages(messages) {
  const cleaned = messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  // Drop oldest turns until the whole conversation fits the budget.
  let total = cleaned.reduce((n, m) => n + m.content.length, 0);
  while (cleaned.length > 1 && total > MAX_TOTAL_CHARS) {
    total -= cleaned.shift().content.length;
  }
  // Conversations should open with the visitor, not the bot.
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();
  return cleaned;
}

function friendlyGatewayError(status, body) {
  const text = String(body || "").toLowerCase();
  if (text.includes("customer_verification") || text.includes("credit card")) {
    return "The tutor isn't switched on yet. The AI Gateway needs a card on file, check back soon.";
  }
  if (status === 401 || status === 403) {
    return "The tutor couldn't sign in to the AI Gateway. Try again later.";
  }
  if (status === 402 || text.includes("credit") || text.includes("insufficient") || text.includes("billing")) {
    return "The tutor is out of fuel. AI Gateway credits are used up, check back soon.";
  }
  if (status === 429) {
    return "Too many questions at once. Give it a minute and try again.";
  }
  return "Static on the line. The tutor didn't answer, try again.";
}
