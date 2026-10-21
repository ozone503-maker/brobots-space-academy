// /api/commentary.js
// Vercel Serverless Function — The Voice (STATIC) live play-by-play lines.
// POST { event, p1, p2, hp1, hp2, pot, round, extra, styleNotes? } → { line }
//
// One-sentence ringside lines for BROBOTSvsHUMANSvsALIENS v4.
// The persona (STATIC — 1940s radio baseball announcer) lives in
// announcer-profile.js beside the game; its styleNotes ride along
// with each request so Jessie can red-pen the voice in one place.
// Talks through the Vercel AI Gateway using the platform's OIDC
// token, exactly like api/chat.js / api/tutor.js. No API keys.
// If the gateway is unreachable the function still answers with a
// neutral fallback line — the game never stalls on commentary.

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
// Fast, inexpensive default. Override with the COMMENTARY_MODEL setting.
const DEFAULT_MODEL = "openai/gpt-4.1-mini";
const MAX_TOKENS = 70;
const TIMEOUT_MS = 8000;

const DEFAULT_STYLE =
  "You are STATIC — a battered vintage tabletop radio on the booth desk, a 1940s HAWAIIAN radio BASEBALL announcer (never boxing). " +
  "Your natural register is HAWAIʻI PIDGIN — mother tongue, not seasoning: real pidgin grammar and vocabulary throughout (da kine, eh, brah, shoots), " +
  "1940s island pidgin, warm not caricature, thickening at peak excitement. Golden-age cadence and gravelly sponsor-patter warmth; " +
  "'bottom of the 9th' stakes language. Warm folksy scene-painting between beats; a swelling home-run call for supers and K.O.s; " +
  "a pennant-race stretch call when the pot grows; signal crackle (—kzzzt—) is your excitement. Work an in-universe sponsor aside " +
  "(kudokens, Moon Tea, Fruity Puppy) into roughly 1 in 4 lines, never over a K.O. call. You never break kayfabe, and you think your " +
  "partner Dinny — the mute frog with the sign cards — is the strong, silent professional holding the broadcast together.";

const HARD_RULES =
  "Hard rules: reply with ONE sentence (two at the very most), play-by-play only. " +
  "Name the fighters involved. No profanity beyond mild island slang. " +
  "Never mention being an AI, a model, or a prompt. No quotation marks, no stage directions, no emojis.";

/* SPONSOR POOL — mirrored allowlist of announcer-profile.js
   (SPONSOR-BOOK.md). A sponsor aside may ONLY name an ENABLED pool
   entry, verbatim. No invented sponsors, ever. Friends & clients
   are weight ZERO / disabled until Jessie confirms. */
const SPONSORS = [
  { name: "Fruity Puppy", weight: 3, enabled: true },
  { name: "Moon Tea", weight: 4, enabled: true },
  { name: "Thorny Toad Face Juice", weight: 3, enabled: true },
  { name: "Desert Squirt", weight: 3, enabled: true },
  { name: "Lava-Guava Bomb Balm", weight: 3, enabled: true },
  { name: "Kudoken", weight: 3, enabled: true },
  { name: "BROBOTS", weight: 3, enabled: true },
  { name: "FlashTown", weight: 3, enabled: true },
  { name: "Biorama", weight: 3, enabled: true },
  { name: "Rooster Island", weight: 2, enabled: true },
  { name: "Eden Nova", weight: 2, enabled: true },
  { name: "Tropical Ts", weight: 2, enabled: true },
  { name: "Punahele Plant Market / I Ship My Plants", weight: 2, enabled: true },
  { name: "Metal Dick's Robot Lounge", weight: 2, enabled: true },
  { name: "GOONDOCKS Bistro", weight: 2, enabled: true },
  { name: "ReBella Botanicals", weight: 0, enabled: false },
  { name: "Rhodes Herbs", weight: 0, enabled: false },
  { name: "Cassidy Silva Insurance", weight: 0, enabled: false },
];
function pickSponsor(requested, event) {
  if (event === "super_spent" || event === "super_whiffed" || event === "ko") return "";
  const pool = SPONSORS.filter((s) => s.enabled && s.weight > 0);
  if (typeof requested === "string" && requested) {
    const hit = pool.find((s) => s.name === requested);
    if (hit) return hit.name;
  }
  if (Math.random() >= 0.25) return "";
  let tot = 0;
  for (const s of pool) tot += s.weight;
  let r = Math.random() * tot;
  for (const s of pool) { r -= s.weight; if (r <= 0) return s.name; }
  return pool[pool.length - 1].name;
}

function fallbackLine(b) {
  const a = b.extra || b.p1 || "The fighter";
  const map = {
    first_hit: `Eh, ${b.p1 || "one of dem"} wen draw first blood, brah!`,
    combo: `${a} stay putting da kine together out hea!`,
    drop_claim: `${a} wen snatch da drop — da pot stay growing!`,
    pot_milestone: `Ho, da pot stay up to ${b.pot || 0} kudoken now!`,
    super_spent: `${a} — ho, how about dat one, folks!`,
    super_whiffed: `Auwe, dat one only wen hit da air!`,
    low_health: `${a} stay hanging by one thread, eh!`,
    match_end: `${a} wen take em all — winner takes everything, shoots!`,
  };
  return map[b.event] || "What a fight we have here, folks!";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST for commentary." });
  }
  const b = req.body || {};
  const event = String(b.event || "").slice(0, 40);
  if (!event) return res.status(400).json({ error: "event is required" });

  const style = (typeof b.styleNotes === "string" && b.styleNotes.trim())
    ? b.styleNotes.trim().slice(0, 1200)
    : DEFAULT_STYLE;
  const system = style + "\n" + HARD_RULES;
  const sponsor = pickSponsor(b.sponsor, event);
  const sponsorNote = sponsor
    ? ` Work in ONE smooth old-time-radio sponsor aside naming "${sponsor}" — that exact name, verbatim. Never name any other sponsor; never invent sponsors.`
    : ` Do not name any sponsor in this line.`;
  const user =
    `Event: ${event}. Fighters: ${String(b.p1 || "?").slice(0, 30)} (${Number(b.hp1) || 100}% HP) vs ` +
    `${String(b.p2 || "?").slice(0, 30)} (${Number(b.hp2) || 100}% HP). ` +
    `Round ${Number(b.round) || 1}. Pot: ${Number(b.pot) || 0} kudoken. ` +
    `Beat detail: ${String(b.extra || "").slice(0, 80)}. Call it.` + sponsorNote;

  const token = req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return res.status(200).json({ line: fallbackLine(b) });

  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: process.env.COMMENTARY_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.9,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    clearTimeout(to);
    if (!response.ok) return res.status(200).json({ line: fallbackLine(b) });
    const data = await response.json();
    let line = data?.choices?.[0]?.message?.content?.trim() || "";
    line = line.replace(/^["']|["']$/g, "").slice(0, 220);
    return res.status(200).json({ line: line || fallbackLine(b) });
  } catch {
    clearTimeout(to);
    return res.status(200).json({ line: fallbackLine(b) });
  }
}
