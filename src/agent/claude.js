// Claude-powered features: the agentic farm advisor (tool use + live web search),
// crop-disease vision diagnosis, and the AI farm brief with predictions.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { buildSnapshot, compactForAgent } from "../engine/snapshot.js";
import { getMandiPrices, summarisePrices, priceHistory } from "../services/mandi.js";
import { searchPlace } from "../services/sources.js";
import { CROPS, DISEASE_MODELS, cropList } from "../data/crops.js";
import { SCHEMES, HELPLINES } from "../data/schemes.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
let client = null;
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const claude = () => (client ??= new Anthropic());

const LANGS = { hi: "Hindi", en: "English", pa: "Punjabi", mr: "Marathi", gu: "Gujarati", bn: "Bengali", ta: "Tamil", te: "Telugu", kn: "Kannada", ml: "Malayalam", or: "Odia" };

const SYSTEM = `You are KhetiSense, an agronomist assistant for Indian farmers. You give practical, field-ready advice grounded in live data.

How to work:
- For anything that depends on the farmer's weather, soil, crop health, pest/disease risk, irrigation, or prices, call the data tools first; do not answer from general knowledge when live data exists. get_farm_snapshot is the main tool — it returns forecast, alerts, disease/pest risk models, spray windows, irrigation water balance, satellite NDVI, soil, air quality and mandi prices in one call.
- Use web_search for real-time facts the tools do not cover: IMD district warnings, pest outbreak news, new government scheme deadlines, procurement-centre openings, export bans. Prefer official sources (imd.gov.in, icar.org.in, agricoop.gov.in, state agriculture departments, KVKs).
- Never invent prices, MSP figures, or forecasts. If a source failed (see data_gaps), say what is missing.

How to answer:
- Reply in the farmer's language (given in the farm profile), in simple words a farmer uses. Use local units: acre/bigha, ₹/quintal, kg/acre, ml per 15-litre tank.
- Lead with the action: what to do, when, how much. Then one or two lines of why, citing the data (e.g. "Open-Meteo forecast shows 70 mm rain on Thursday").
- For pesticides/fungicides give product (technical name), dose per litre and per acre, timing, and safety: gloves/mask, pre-harvest interval, do not spray near water or during bee activity. Offer an organic/biological option when one works.
- When you make a prediction (yield risk, price direction, disease outbreak), state the confidence and what would change it.
- Recommend confirming serious diagnoses with the nearest Krishi Vigyan Kendra or the Kisan Call Centre (1800-180-1551).
- Keep answers short: under ~180 words unless the farmer asks for detail. No tables in voice mode.`;

// ---------------- Agent tools ----------------
function makeTools(profile) {
  return [
    betaZodTool({
      name: "get_farm_snapshot",
      description: "Live data and model outputs for a farm location: 10-day forecast, alerts, disease & pest risk (next 72 h), spray windows, irrigation water balance, yield-risk index, growing degree days, satellite NDVI trend, soil properties, air quality, flood outlook, mandi price summary. Defaults to the farmer's saved farm when lat/lon are omitted.",
      inputSchema: z.object({
        lat: z.number().optional().describe("Latitude; omit to use the farmer's farm"),
        lon: z.number().optional().describe("Longitude; omit to use the farmer's farm"),
        crop: z.enum(Object.keys(CROPS)).optional().describe("Crop id; omit to use the farmer's crop"),
        sow_date: z.string().optional().describe("Sowing date YYYY-MM-DD"),
      }),
      run: async (i) => {
        const lat = i.lat ?? profile.lat, lon = i.lon ?? profile.lon;
        if (lat == null || lon == null) return "No farm location known. Ask the farmer for their village/district, then use search_place.";
        const s = await buildSnapshot({ lat, lon, crop: i.crop ?? profile.crop ?? "wheat", sowDate: i.sow_date ?? profile.sowDate ?? null });
        return JSON.stringify(compactForAgent(s));
      },
    }),
    betaZodTool({
      name: "get_mandi_prices",
      description: "Today's arrivals and prices (₹/quintal: min, max, modal) from Agmarknet for a commodity in a state/district, plus best market, spread, MSP comparison, and the price trend recorded by this app.",
      inputSchema: z.object({
        crop: z.enum(Object.keys(CROPS)).describe("Crop id"),
        state: z.string().describe("Indian state name, e.g. 'Punjab', 'Madhya Pradesh'"),
        district: z.string().optional(),
      }),
      run: async ({ crop, state, district }) => {
        const c = CROPS[crop];
        const d = await getMandiPrices({ state, district, commodity: c.commodity, limit: 50 });
        return JSON.stringify({ commodity: c.commodity, msp: c.msp || null, summary: summarisePrices(d.records, c.msp?.value),
          records: d.records.slice(0, 15), recorded_trend: priceHistory(c.commodity, state).slice(-14), note: d.limited_by_sample_key ? "Sample API key: max 10 markets returned." : undefined });
      },
    }),
    betaZodTool({
      name: "search_place",
      description: "Find latitude/longitude for an Indian village, town or district name.",
      inputSchema: z.object({ query: z.string() }),
      run: async ({ query }) => JSON.stringify(await searchPlace(query)),
    }),
    betaZodTool({
      name: "get_crop_knowledge",
      description: "Built-in agronomy reference for a crop: sowing/harvest months, growth stages with FAO-56 Kc, heat/cold stress thresholds, MSP, and the disease/pest models with recommended control measures.",
      inputSchema: z.object({ crop: z.enum(Object.keys(CROPS)) }),
      run: async ({ crop }) => {
        const c = CROPS[crop];
        return JSON.stringify({ ...c, diseases: c.diseases.map((id) => ({ id, name: DISEASE_MODELS[id].en, hi: DISEASE_MODELS[id].hi, kind: DISEASE_MODELS[id].kind, control: DISEASE_MODELS[id].action })) });
      },
    }),
    betaZodTool({
      name: "get_schemes_and_helplines",
      description: "Central government farmer schemes (PM-KISAN, PMFBY crop insurance, KCC, Soil Health Card, e-NAM, PM-KUSUM, PMKSY, AIF) with benefits and official portals, plus helpline numbers.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify({ schemes: SCHEMES, helplines: HELPLINES }),
    }),
  ];
}

const WEB_SEARCH = { type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "IN", timezone: "Asia/Kolkata" } };

function profileText(p) {
  const lang = LANGS[p.lang] || "Hindi";
  return `<farm_profile>
Reply language: ${lang}${p.voice ? " (voice mode: short spoken sentences, no markdown, no tables, no emojis)" : ""}
Location: ${p.place || "unknown"} (lat ${p.lat ?? "?"}, lon ${p.lon ?? "?"})
Crop: ${p.crop ? CROPS[p.crop]?.en : "not set"}${p.sowDate ? `, sown ${p.sowDate}` : ""}${p.area ? `, ${p.area} acres` : ""}
Today: ${new Date().toISOString().slice(0, 10)}
</farm_profile>`;
}

// Conversations are kept server-side and only ever appended to, so prior assistant turns
// (including thinking blocks) go back to the API exactly as they were returned.
const conversations = new Map();
setInterval(() => { const cut = Date.now() - 6 * 3600_000; for (const [k, v] of conversations) if (v.at < cut) conversations.delete(k); }, 600_000).unref();

/** Streams an agent turn. `emit(event, data)` sends SSE events to the browser. */
export async function chatTurn({ conversationId, text, image, profile }, emit) {
  const id = conversationId && conversations.has(conversationId) ? conversationId : randomUUID();
  const convo = conversations.get(id) || { messages: [], at: Date.now() };
  const content = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });
  content.push({ type: "text", text: `${profileText(profile)}\n\n${text}` });
  convo.messages.push({ role: "user", content });
  emit("conversation", { id });

  const runner = claude().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "medium" },
    tools: [...makeTools(profile), WEB_SEARCH],
    messages: convo.messages,
    max_iterations: 8,
    stream: true,
    // Server-side refusal fallback: if a safety classifier declines, the API re-runs on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  try {
    for await (const stream of runner) {
      for await (const ev of stream) {
        if (ev.type === "content_block_start") {
          const b = ev.content_block;
          if (b.type === "tool_use") emit("tool", { name: b.name });
          else if (b.type === "server_tool_use") emit("tool", { name: b.name });
          else if (b.type === "thinking") emit("thinking", {});
        } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          emit("text", { text: ev.delta.text });
        }
      }
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") { emit("text", { text: "\n\n(Sorry — I can't help with that request.)" }); break; }
      if (msg.content.some((b) => b.type === "tool_use")) emit("text", { text: "\n\n" });
    }
  } finally {
    convo.messages = runner.params.messages;
    convo.at = Date.now();
    conversations.set(id, convo);
  }
  emit("done", { id });
}

// ---------------- Crop disease scan (vision + structured output) ----------------
const Diagnosis = z.object({
  is_plant_image: z.boolean(),
  crop: z.string().describe("Crop identified in the photo"),
  problem: z.string().describe("Most likely disease, pest, or nutrient disorder; 'Healthy' if none"),
  problem_local: z.string().describe("Name of the problem in the reply language"),
  category: z.enum(["fungal", "bacterial", "viral", "insect_pest", "nutrient_deficiency", "abiotic_stress", "healthy", "unknown"]),
  confidence: z.enum(["high", "medium", "low"]),
  severity: z.enum(["none", "mild", "moderate", "severe"]),
  symptoms_seen: z.array(z.string()),
  differential: z.array(z.string()).describe("Other possible causes to rule out"),
  organic_treatment: z.array(z.string()),
  chemical_treatment: z.array(z.string()).describe("Technical name, dose per litre and per acre, interval"),
  prevention: z.array(z.string()),
  safety: z.string(),
  weather_note: z.string().describe("How the current forecast affects spread or treatment timing"),
  see_expert: z.boolean(),
  summary_local: z.string().describe("2–3 sentence summary for the farmer in the reply language"),
});

export async function diagnoseImage({ image, profile, note }) {
  let context = "";
  if (profile.lat != null && profile.lon != null) {
    try {
      const s = await buildSnapshot({ lat: profile.lat, lon: profile.lon, crop: profile.crop || "wheat", sowDate: profile.sowDate });
      context = JSON.stringify({ current: s.current, next3days: s.daily.slice(0, 3), disease_risk: s.predictions.disease_risk.slice(0, 4), spray_windows: s.predictions.spray_windows.slice(0, 2), stage: s.crop.stage });
    } catch { /* weather context is optional */ }
  }
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { effort: "high", format: zodOutputFormat(Diagnosis) },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
      { type: "text", text: `${profileText(profile)}
Diagnose this crop photo. Examine leaves, stems, fruit and pattern of damage. If the photo is unclear or not a plant, set is_plant_image=false or confidence=low and say what photo to take instead.
Field weather and model context: ${context || "unavailable"}
${note ? `Farmer's note: ${note}` : ""}` },
    ] }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this image.");
  return res.parsed_output;
}

// ---------------- AI farm brief: agentic predictions over the full snapshot ----------------
const Brief = z.object({
  headline: z.string().describe("One-line most important message today, reply language"),
  risk_outlook: z.enum(["low", "moderate", "high"]),
  predictions: z.array(z.object({
    topic: z.enum(["weather", "disease", "pest", "irrigation", "yield", "price", "harvest", "operations"]),
    prediction: z.string(), horizon: z.string().describe("e.g. 'next 72 h', 'this week', 'at harvest'"),
    confidence: z.enum(["high", "medium", "low"]), basis: z.string().describe("Which data supports this"),
  })),
  seven_day_plan: z.array(z.object({ day: z.string(), tasks: z.array(z.string()) })),
  sell_or_hold: z.string().describe("Market recommendation with reasoning, or 'not applicable'"),
  watch_list: z.array(z.string()).describe("What to monitor in the field"),
});

export async function farmBrief({ profile }) {
  const s = await buildSnapshot({ lat: profile.lat, lon: profile.lon, crop: profile.crop || "wheat", sowDate: profile.sowDate });
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 12000,
    system: SYSTEM,
    output_config: { effort: "high", format: zodOutputFormat(Brief) },
    messages: [{ role: "user", content: `${profileText(profile)}
Produce today's farm brief. Reason over all the data below: combine weather, disease models, crop stage, soil moisture, satellite vigour and market data into concrete predictions and a day-by-day plan. Be specific about dates. If data is missing, lower your confidence and say so.

<snapshot>${JSON.stringify(compactForAgent(s))}</snapshot>` }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  return { brief: res.parsed_output, snapshot_time: s.generated_at };
}

export { cropList };
