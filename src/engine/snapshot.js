// Builds the full "farm snapshot": fetches every data source in parallel, then runs the
// deterministic engine (alerts, disease risk, irrigation, spray windows, yield risk).
import * as src from "../services/sources.js";
import { getMandiPrices, summarisePrices, priceHistory } from "../services/mandi.js";
import { CROPS, cropStage } from "../data/crops.js";
import { safe, round } from "../util.js";
import { hourlyRows, dailyRows, diseaseRisk, sprayWindows, irrigationPlan, gddOutlook, yieldRisk, ndviSummary, buildAlerts } from "./alerts.js";

export async function buildSnapshot({ lat, lon, crop = "wheat", sowDate = null, state = null }) {
  const cropInfo = CROPS[crop];
  const [weather, air, flood, soil, normals, ndvi, fires, place] = await Promise.all([
    safe("Open-Meteo Forecast", () => src.getWeather(lat, lon)),
    safe("Open-Meteo Air Quality (CAMS)", () => src.getAirQuality(lat, lon)),
    safe("GloFAS Flood", () => src.getFlood(lat, lon)),
    safe("ISRIC SoilGrids", () => src.getSoil(lat, lon)),
    safe("NASA POWER Climatology", () => src.getClimateNormals(lat, lon)),
    safe("NASA MODIS NDVI", () => src.getNDVI(lat, lon)),
    safe("NASA FIRMS Fires", () => src.getFires(lat, lon)),
    safe("OpenStreetMap Nominatim", () => src.reverseGeocode(lat, lon)),
  ]);
  const st = state || (place.ok ? place.data.state : null);
  const prices = cropInfo?.commodity
    ? await safe("Agmarknet (data.gov.in)", async () => {
        const local = await getMandiPrices({ state: st, commodity: cropInfo.commodity });
        if (local.records.length || !st) return { ...local, scope: st || "India" };
        // No arrivals in the farmer's state today: show all-India markets instead of an empty table.
        return { ...(await getMandiPrices({ commodity: cropInfo.commodity })), scope: "India" };
      })
    : { ok: false, source: "Agmarknet (data.gov.in)", error: "No mandi commodity for crop" };

  if (!weather.ok) throw new Error(`Weather unavailable: ${weather.error}`);

  const rows = hourlyRows(weather.data);
  const days = dailyRows(weather.data);
  const stage = cropStage(crop, sowDate);
  const texture = soil.ok ? soil.data.texture : "unknown";
  const disease = diseaseRisk(rows, crop);
  const spray = sprayWindows(rows);
  const irrigation = irrigationPlan(rows, days, crop, stage, texture);
  const ndviS = ndvi.ok ? ndviSummary(ndvi.data, sowDate) : null;

  let priceBlock = null;
  if (prices.ok) {
    const hist = priceHistory(cropInfo.commodity, prices.data.scope === "India" ? null : st);
    const recent = hist.slice(-14);
    const trend = recent.length >= 2
      ? { days: recent.length, change_pct: round(((recent.at(-1).avg_modal - recent[0].avg_modal) / recent[0].avg_modal) * 100), series: recent }
      : { days: recent.length, change_pct: null, series: recent, note: "Trend builds as the app records daily prices." };
    priceBlock = { ...prices.data, summary: summarisePrices(prices.data.records, cropInfo.msp?.value), trend };
  }

  const ctx = {
    crop, stage, rows, days, disease, spray, irrigation,
    air: air.ok ? air.data : null, flood: flood.ok ? flood.data : null, fires: fires.ok ? fires.data : null,
    normals: normals.ok ? normals.data : null, ndvi: ndviS, prices: priceBlock,
  };
  const alerts = buildAlerts(ctx);
  const risk = yieldRisk({ days, disease, irrigation, stage, cropId: crop, ndvi: ndviS });

  return {
    generated_at: new Date().toISOString(),
    location: { lat, lon, ...(place.ok ? place.data : {}), elevation_m: weather.data.elevation, timezone: weather.data.timezone },
    crop: { id: crop, ...(cropInfo ? { en: cropInfo.en, hi: cropInfo.hi, msp: cropInfo.msp || null } : {}), sow_date: sowDate, stage },
    current: weather.data.current,
    daily: days,
    hourly_next_48: rows.slice(0, 48).map(({ time, t, rh, p, pp, wind, gust, sm3, lw }) => ({ time, t, rh, p, pp, wind, gust, sm3, lw })),
    alerts,
    predictions: { yield_risk: risk, disease_risk: disease, spray_windows: spray, irrigation, gdd: gddOutlook(days, crop, stage) },
    soil: soil.ok ? soil.data : null,
    vegetation: ndviS,
    air_quality: air.ok ? air.data.current : null,
    flood: flood.ok ? { daily: flood.data.daily } : null,
    fires: fires.ok ? fires.data : null,
    climate_normals: normals.ok ? normals.data : null,
    market: priceBlock,
    sources: [weather, air, flood, soil, normals, ndvi, fires, place, prices].map(({ ok, source, ms, error }) => ({ source, ok, ms, error })),
  };
}

// Compact version for the AI agent (keeps tokens low).
export function compactForAgent(s) {
  return {
    location: s.location, crop: s.crop, current: s.current,
    daily: s.daily.slice(0, 10),
    alerts: s.alerts.map(({ severity, category, title, message, action, when }) => ({ severity, category, title, message, action, when })),
    predictions: { ...s.predictions, disease_risk: s.predictions.disease_risk.slice(0, 5) },
    soil: s.soil && { ph: s.soil.ph, organic_carbon_g_per_kg: s.soil.organic_carbon_g_per_kg, nitrogen_g_per_kg: s.soil.nitrogen_g_per_kg, texture: s.soil.texture },
    vegetation: s.vegetation && { latest: s.vegetation.latest, delta: s.vegetation.delta, trend: s.vegetation.trend, health: s.vegetation.health },
    air_quality: s.air_quality, fires: s.fires,
    market: s.market && { summary: s.market.summary, trend: s.market.trend && { change_pct: s.market.trend.change_pct, days: s.market.trend.days } },
    data_gaps: s.sources.filter((x) => !x.ok).map((x) => `${x.source}: ${x.error}`),
  };
}
