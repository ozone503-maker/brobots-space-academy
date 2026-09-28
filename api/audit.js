// /api/audit.js
// Vercel Serverless Function — triggers an SAO audit.
// POST {url, niche?} → {job_id} | {error}
// The audit itself runs in GitHub Actions; the frontend polls for the result JSON.

const OWNER = "ozone503-maker";
const REPO = "brobots-space-academy";
const WORKFLOW = "sao-audit.yml";
const RESULTS_BASE =
  "https://raw.githubusercontent.com/ozone503-maker/brobots-space-academy/audit-results/audits";

const DEFAULT_BRAND = {
  name: "BROBOTS",
  tagline: "people helping robots helping people",
  url: "https://brobots.space",
  logo_url: "https://brobots.space/apple-touch-icon.png",
  cta_url: "https://brobots.space/services.html",
  colors: {
    bg: "#0a0a0c",
    ink: "#f5efe0",
    muted: "#a8a29a",
    accent: "#4f8ff7",
    accent2: "#a06ff7",
  },
};

function blockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (["localhost", "::1"].includes(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  if (h === "[::1]") return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  let body = req.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return res.status(400).json({ error: "bad request" });
  }

  const rawUrl = String(body?.url || "").trim();
  const niche = String(body?.niche || "").trim().toLowerCase().replace(/[^a-z-]/g, "");
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "That's not a valid URL." });
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    return res.status(400).json({ error: "URL must start with http:// or https://" });
  }
  if (blockedHost(u.hostname)) {
    return res.status(400).json({ error: "That host can't be audited." });
  }
  const target = u.toString();

  // Liveness check: fail fast on dead URLs before spending an audit run.
  try {
    const tryFetch = async (method) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        return await fetch(target, {
          method,
          redirect: "follow",
          signal: ctrl.signal,
          headers: { "user-agent": "BROBOTS-SAO-Audit/1.0" },
        });
      } finally {
        clearTimeout(t);
      }
    };
    let r = await tryFetch("HEAD");
    if (!r.ok) r = await tryFetch("GET");
    if (!r.ok) return res.status(400).json({ error: "Couldn't reach that site. Check the URL." });
  } catch {
    return res.status(400).json({ error: "Couldn't reach that site. Check the URL." });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Audit service isn't configured yet." });
  }

  const jobId =
    "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const brandB64 = Buffer.from(JSON.stringify(DEFAULT_BRAND)).toString("base64");

  const disp = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          url: target,
          job_id: jobId,
          niche: niche || "",
          brand_b64: brandB64,
        },
      }),
    }
  );
  if (!disp.ok) {
    return res.status(502).json({ error: "Couldn't start the audit. Try again in a minute." });
  }
  return res.status(200).json({ job_id: jobId, results_url: `${RESULTS_BASE}/${jobId}.json` });
}
