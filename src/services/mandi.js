// Mandi prices from Agmarknet via data.gov.in (Ministry of Agriculture "Current Daily Price" dataset).
// Every successful fetch is appended to data/price-history.jsonl so the app builds its own
// price-trend dataset over time (the live API only exposes today's arrivals).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJSON, HOUR } from "../util.js";

const RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070";
// data.gov.in's documented public sample key is capped at 10 records per call.
// Register free at https://data.gov.in for a personal key (1000+ records).
const SAMPLE_KEY = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b";
const HISTORY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/price-history.jsonl");

export async function getMandiPrices({ state, district, commodity, limit = 100 } = {}) {
  const key = process.env.DATA_GOV_IN_API_KEY || SAMPLE_KEY;
  const params = new URLSearchParams({ "api-key": key, format: "json", limit: String(limit) });
  if (state) params.set("filters[state.keyword]", state);
  if (district) params.set("filters[district]", district);
  if (commodity) params.set("filters[commodity]", commodity);
  const url = `https://api.data.gov.in/resource/${RESOURCE}?${params}`;
  const d = await fetchJSON(url, { ttlMs: 2 * HOUR, timeoutMs: 20000 });
  const records = (d.records || []).map((r) => ({
    state: r.state, district: r.district, market: r.market, commodity: r.commodity, variety: r.variety,
    date: r.arrival_date, min: Number(r.min_price), max: Number(r.max_price), modal: Number(r.modal_price),
  }));
  recordHistory(records);
  return { total: Number(d.total) || records.length, limited_by_sample_key: !process.env.DATA_GOV_IN_API_KEY, records };
}

const seen = new Set();
function recordHistory(records) {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    const lines = [];
    for (const r of records) {
      const id = `${r.date}|${r.market}|${r.commodity}|${r.variety}`;
      if (seen.has(id)) continue;
      seen.add(id);
      lines.push(JSON.stringify(r));
    }
    if (lines.length) fs.appendFileSync(HISTORY_FILE, lines.join("\n") + "\n");
  } catch { /* history is best-effort */ }
}

// Load prior history into the de-dup set at startup.
try {
  for (const line of fs.readFileSync(HISTORY_FILE, "utf8").split("\n")) {
    if (!line) continue;
    const r = JSON.parse(line);
    seen.add(`${r.date}|${r.market}|${r.commodity}|${r.variety}`);
  }
} catch { /* no history yet */ }

// Daily average modal price for a commodity from the locally accumulated dataset.
export function priceHistory(commodity, state) {
  let lines = [];
  try { lines = fs.readFileSync(HISTORY_FILE, "utf8").split("\n").filter(Boolean); } catch { return []; }
  const byDate = new Map();
  for (const line of lines) {
    const r = JSON.parse(line);
    if (r.commodity !== commodity || (state && r.state !== state) || !r.modal) continue;
    const [dd, mm, yyyy] = r.date.split("/");
    const iso = `${yyyy}-${mm}-${dd}`;
    const e = byDate.get(iso) || { s: 0, n: 0 };
    e.s += r.modal; e.n += 1;
    byDate.set(iso, e);
  }
  return [...byDate.entries()].sort().map(([date, e]) => ({ date, avg_modal: Math.round(e.s / e.n), markets: e.n }));
}

// Summarise a set of records: best market to sell, spread, comparison with MSP.
export function summarisePrices(records, msp) {
  const valid = records.filter((r) => r.modal > 0);
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => b.modal - a.modal);
  const avg = Math.round(valid.reduce((s, r) => s + r.modal, 0) / valid.length);
  return {
    markets: valid.length,
    avg_modal: avg,
    best: sorted[0],
    worst: sorted[sorted.length - 1],
    spread: sorted[0].modal - sorted[sorted.length - 1].modal,
    msp: msp || null,
    below_msp_markets: msp ? valid.filter((r) => r.modal < msp).length : null,
  };
}
