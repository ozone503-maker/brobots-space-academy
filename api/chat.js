// /api/chat.js
// Vercel Serverless Function — the Console Operator.
// GET  → roster (built from cartridges + _manifest.json)
// POST → seat a cartridge and talk
//
// Talks through the Vercel AI Gateway using the platform's OIDC token. No API keys.

import fs from "fs";
import path from "path";

const CARTRIDGE_DIR = path.join(process.cwd(), "cartridges");
const MANIFEST_PATH = path.join(CARTRIDGE_DIR, "_manifest.json");
const CONSOLE_PATH = path.join(CARTRIDGE_DIR, "_console.txt");

// Vercel AI Gateway (OpenAI-compatible Chat Completions endpoint)
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
// Fast, inexpensive default. Override with the BROBOTS_MODEL setting.
const DEFAULT_MODEL = "openai/gpt-4.1-mini";

// Cost guards — same limits as api/tutor.js.
const MAX_TOKENS = 700;
const MAX_MESSAGES = 20; // only the most recent turns are sent
const MAX_MESSAGE_CHARS = 2000; // per message
const MAX_TOTAL_CHARS = 12000; // whole conversation
const TIMEOUT_MS = 25000;

function listCartridgeSlugs() {
  return fs
    .readdirSync(CARTRIDGE_DIR)
    .filter((f) => f.endsWith(".txt") && !f.startsWith("_"))
    .map((f) => f.replace(/\.txt$/, ""));
}

function parseIdentity(text) {
  const grab = (label) => {
    const m = text.match(new RegExp("^" + label + ":\\s*(.+)$", "mi"));
    return m ? m[1].trim() : "";
  };
  return {
    name: grab("Name"),
    code_name: grab("Code name"),
    tagline: grab("Tagline"),
  };
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function buildRoster() {
  const manifest = loadManifest();
  const bySlug = Object.fromEntries(manifest.map((b) => [b.slug, b]));
  return listCartridgeSlugs().map((slug, i) => {
    const file = `${slug}.txt`;
    const raw = fs.readFileSync(path.join(CARTRIDGE_DIR, file), "utf-8");
    const id = parseIdentity(raw);
    const row = bySlug[slug] || {};
    return {
      slug,
      name: row.name || id.name || slug,
      code_name: id.code_name || slug.toUpperCase(),
      tagline: row.tagline || id.tagline || "",
      cartridge_file: row.cartridge_file || `cartridges/${file}`,
      skin_image:
        row.skin_image ||
        `https://brobots.space/media/roster/${slug}.png`,
      dossier: i + 1,
    };
  });
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
    return "The Console isn't switched on yet. The AI Gateway needs a card on file, check back soon.";
  }
  if (status === 401 || status === 403) {
    return "The Console couldn't sign in to the AI Gateway. Try again later.";
  }
  if (status === 402 || text.includes("credit") || text.includes("insufficient") || text.includes("billing")) {
    return "The Console is out of fuel. AI Gateway credits are used up, check back soon.";
  }
  if (status === 429) {
    return "Too many people at the Console at once. Give it a minute and try again.";
  }
  return "Static on the line. The graduate didn't answer, try again.";
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(res);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({
      factory: "BroBots Space Factory",
      station: "console",
      count: listCartridgeSlugs().length,
      roster: buildRoster(),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use GET for roster, POST to talk" });
  }

  const { botSlug, messages } = req.body || {};

  if (!botSlug || !Array.isArray(messages)) {
    return res.status(400).json({ error: "botSlug and messages[] are required" });
  }

  const valid = listCartridgeSlugs();
  if (!valid.includes(botSlug)) {
    return res.status(404).json({ error: `Unknown graduate: ${botSlug}` });
  }

  const chat = sanitizeMessages(messages);
  if (!chat.length || chat[chat.length - 1].role !== "user") {
    return res.status(400).json({ error: "Say something first." });
  }

  const consoleOp = fs.existsSync(CONSOLE_PATH)
    ? fs.readFileSync(CONSOLE_PATH, "utf-8")
    : "";
  const cartridge = fs.readFileSync(
    path.join(CARTRIDGE_DIR, `${botSlug}.txt`),
    "utf-8"
  );
  const identity = parseIdentity(cartridge);

  const systemPrompt = [
    consoleOp,
    "",
    "========== SEATED CARTRIDGE ==========",
    cartridge,
    "========== END CARTRIDGE ==========",
    "",
    `Seated graduate: ${identity.name || botSlug}`,
    "Speak only as the seated graduate.",
  ].join("\n");

  // Auth: the Vercel OIDC token the platform gives this function
  // (header at runtime, env var as a fallback). No API keys anywhere.
  const token = req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) {
    return res.status(503).json({
      error: "The Console is powering up. The AI Gateway isn't connected yet, try again soon.",
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
        model: process.env.BROBOTS_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "system", content: systemPrompt }, ...chat],
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

    return res.status(200).json({
      reply,
      seated: {
        slug: botSlug,
        name: identity.name,
        tagline: identity.tagline,
      },
    });
  } catch (err) {
    console.error("Console error", err);
    const timedOut = err?.name === "AbortError";
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut
        ? "The graduate is taking too long to answer. Try again."
        : "Connection hiccup. Try again.",
    });
  } finally {
    clearTimeout(timer);
  }
}
