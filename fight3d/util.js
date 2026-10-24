// fight3d/util.js: tiny shared helpers (query string flags, math, rng, DOM lookup). No game state.

// ==========================================
const qs = new URLSearchParams(location.search);
const AUTO = qs.has('auto');
const D2R = Math.PI / 180, clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rnd = Math.random;
const $ = id => document.getElementById(id);

export { $, AUTO, D2R, clamp, ease, lerp, qs, rnd };
