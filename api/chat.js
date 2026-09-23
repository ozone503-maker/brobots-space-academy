// /api/chat.js
// Vercel Serverless Function — the Console Operator.
// GET  → roster (built from cartridges + _manifest.json)
// POST → seat a cartridge and talk

import fs from "fs";
import path from "path";

const CARTRIDGE_DIR = path.join(process.cwd(), "cartridges");
const MANIFEST_PATH = path.join(CARTRIDGE_DIR, "_manifest.json");
const CONSOLE_PATH = path.join(CARTRIDGE_DIR, "_console.txt");

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

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(res);
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

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: "Console unpowered",
      detail: "ANTHROPIC_API_KEY is not set",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.BROBOTS_MODEL || "claude-sonnet-4-6",
        max_tokens: 700,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "Model provider error", detail: errText });
    }

    const data = await response.json();
    const reply = data.content?.find((b) => b.type === "text")?.text || "";

    return res.status(200).json({
      reply,
      seated: {
        slug: botSlug,
        name: identity.name,
        tagline: identity.tagline,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Console error", detail: String(err) });
  }
}
