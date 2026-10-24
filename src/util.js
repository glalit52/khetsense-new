// Shared helpers: fetch with timeout, in-memory TTL cache, small math utils.

const cache = new Map();

export async function fetchJSON(url, { timeoutMs = 15000, headers = {}, ttlMs = 0 } = {}) {
  if (ttlMs) {
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) return hit.value;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "KhetiSense/1.0 (farmer advisory)", Accept: "application/json", ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    const value = await res.json();
    if (ttlMs) cache.set(url, { value, expires: Date.now() + ttlMs });
    return value;
  } finally {
    clearTimeout(timer);
  }
}

// Run a data source and never throw: returns { ok, data } or { ok:false, error }.
export async function safe(name, fn) {
  const t0 = Date.now();
  try {
    const data = await fn();
    return { ok: true, source: name, ms: Date.now() - t0, data };
  } catch (err) {
    return { ok: false, source: name, ms: Date.now() - t0, error: String(err?.message || err) };
  }
}

export const round = (n, d = 1) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
export const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
export const max = (a) => Math.max(...a.filter((x) => x != null));
export const min = (a) => Math.min(...a.filter((x) => x != null));

export function parseLatLon(q) {
  const lat = Number(q.lat);
  const lon = Number(q.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error("Valid lat and lon are required");
  }
  return { lat: round(lat, 4), lon: round(lon, 4) };
}

export const HOUR = 3600_000;
