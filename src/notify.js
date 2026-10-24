// Alert subscriptions + background watcher. Every ALERT_INTERVAL_MIN minutes each subscribed farm
// is re-evaluated; new critical/warning alerts are pushed via the configured channels
// (Telegram, Twilio SMS/WhatsApp, generic webhook) and kept in an in-app feed the browser polls.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { buildSnapshot } from "./engine/snapshot.js";

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/subscriptions.json");
const PUSH_SEVERITIES = new Set(["critical", "warning"]);
let subs = load();

function load() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; } }
function save() { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(subs, null, 2)); }

export function channelsConfigured() {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    sms: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
    whatsapp: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM),
    webhook: Boolean(process.env.ALERT_WEBHOOK_URL),
    in_app: true,
  };
}

export function upsertSubscription(body) {
  const id = body.id && subs[body.id] ? body.id : randomUUID();
  const prev = subs[id] || { sent: {}, feed: [] };
  subs[id] = {
    ...prev, id,
    lat: Number(body.lat), lon: Number(body.lon), crop: body.crop, sowDate: body.sowDate || null,
    place: body.place || "", lang: body.lang || "hi",
    telegramChatId: body.telegramChatId || null, phone: body.phone || null, whatsapp: Boolean(body.whatsapp),
    updated_at: new Date().toISOString(),
  };
  save();
  checkOne(subs[id]).catch(() => {});
  return { id, channels: channelsConfigured() };
}

export function deleteSubscription(id) { delete subs[id]; save(); }

export function feed(id, since) {
  const s = subs[id];
  if (!s) return null;
  return s.feed.filter((f) => !since || f.at > since);
}

async function checkOne(s) {
  const snap = await buildSnapshot({ lat: s.lat, lon: s.lon, crop: s.crop, sowDate: s.sowDate });
  const now = Date.now();
  const fresh = snap.alerts.filter((a) => PUSH_SEVERITIES.has(a.severity) && (!s.sent[a.id] || now - s.sent[a.id] > 24 * 3600_000));
  for (const a of fresh) {
    s.sent[a.id] = now;
    const item = { at: new Date().toISOString(), ...a };
    s.feed.unshift(item);
    await deliver(s, a);
  }
  s.feed = s.feed.slice(0, 50);
  s.last_checked = new Date().toISOString();
  save();
  return fresh.length;
}

function formatAlert(s, a) {
  const icon = a.severity === "critical" ? "🔴" : "🟠";
  const title = s.lang === "hi" && a.title_hi ? a.title_hi : a.title;
  return `${icon} KhetiSense — ${title}\n${s.place}\n${a.message}\n👉 ${a.action}`;
}

async function deliver(s, a) {
  const text = formatAlert(s, a);
  const jobs = [];
  if (process.env.TELEGRAM_BOT_TOKEN && s.telegramChatId) {
    jobs.push(fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: s.telegramChatId, text }),
    }));
  }
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_FROM, TWILIO_WHATSAPP_FROM } = process.env;
  if (sid && tok && s.phone) {
    const from = s.whatsapp ? TWILIO_WHATSAPP_FROM && `whatsapp:${TWILIO_WHATSAPP_FROM}` : TWILIO_FROM;
    if (from) jobs.push(fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: from, To: s.whatsapp ? `whatsapp:${s.phone}` : s.phone, Body: text.slice(0, 1500) }),
    }));
  }
  if (process.env.ALERT_WEBHOOK_URL) {
    jobs.push(fetch(process.env.ALERT_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: s.id, place: s.place, crop: s.crop, alert: a, text }) }));
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.warn("[notify] delivery failed:", r.reason?.message);
}

let watcherTimer = null;

export function startWatcher() {
  if (watcherTimer) clearInterval(watcherTimer);
  const minutes = Number(process.env.ALERT_INTERVAL_MIN || 60);
  const run = async () => {
    for (const s of Object.values(subs)) {
      try { const n = await checkOne(s); if (n) console.log(`[watcher] ${n} new alert(s) for ${s.place || s.id}`); }
      catch (e) { console.warn(`[watcher] ${s.id}: ${e.message}`); }
    }
  };
  watcherTimer = setInterval(run, minutes * 60_000);
  watcherTimer.unref();
  console.log(`[watcher] checking ${Object.keys(subs).length} subscribed farm(s) every ${minutes} min`);
}

export function stopWatcher() {
  if (watcherTimer) {
    clearInterval(watcherTimer);
    watcherTimer = null;
    console.log("[watcher] stopped.");
  }
}

