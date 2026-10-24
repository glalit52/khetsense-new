// All external data integrations. Every function returns plain JSON and throws on failure;
// callers wrap them in safe() so one broken source never breaks the dashboard.
import { fetchJSON, round, HOUR } from "../util.js";

// ---------- 1. Weather: Open-Meteo forecast (free, no key; blends IMD/ECMWF/GFS models) ----------
const HOURLY = [
  "temperature_2m", "relative_humidity_2m", "dew_point_2m", "precipitation", "precipitation_probability",
  "weather_code", "wind_speed_10m", "wind_gusts_10m", "vapour_pressure_deficit", "cape",
  "soil_moisture_0_to_1cm", "soil_moisture_3_to_9cm", "soil_moisture_9_to_27cm", "soil_temperature_6cm",
  "et0_fao_evapotranspiration", "leaf_wetness_probability",
].join(",");
const DAILY = [
  "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum", "precipitation_probability_max",
  "wind_speed_10m_max", "wind_gusts_10m_max", "et0_fao_evapotranspiration", "sunshine_duration", "uv_index_max",
].join(",");

export async function getWeather(lat, lon, days = 10) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,cloud_cover` +
    `&hourly=${HOURLY}&daily=${DAILY}&past_days=2&forecast_days=${days}&timezone=auto`;
  return fetchJSON(url, { ttlMs: 0.5 * HOUR });
}

// ---------- 2. Air quality: Open-Meteo CAMS (PM2.5, ozone, dust — stubble-burning season) ----------
export async function getAirQuality(lat, lon) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&current=pm2_5,pm10,ozone,dust,us_aqi&hourly=pm2_5,ozone&forecast_days=3&timezone=auto`;
  return fetchJSON(url, { ttlMs: HOUR });
}

// ---------- 3. Flood: GloFAS river discharge via Open-Meteo Flood API ----------
export async function getFlood(lat, lon) {
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}` +
    `&daily=river_discharge,river_discharge_median,river_discharge_max&past_days=30&forecast_days=14`;
  return fetchJSON(url, { ttlMs: 6 * HOUR });
}

// ---------- 4. Geocoding (Open-Meteo) + reverse geocoding (OpenStreetMap Nominatim) ----------
export async function searchPlace(q) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&countryCode=IN&language=en`;
  const d = await fetchJSON(url, { ttlMs: 24 * HOUR });
  return (d.results || []).map((r) => ({
    name: r.name, district: r.admin2 || r.admin3 || "", state: r.admin1 || "", lat: r.latitude, lon: r.longitude,
  }));
}

export async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=en`;
  const d = await fetchJSON(url, { ttlMs: 24 * HOUR });
  const a = d.address || {};
  return {
    label: [a.village || a.town || a.city || a.county, a.state_district || a.county, a.state].filter(Boolean).join(", "),
    district: (a.state_district || a.county || "").replace(/ District$/i, ""),
    state: a.state || "",
  };
}

// ---------- 5. Soil: ISRIC SoilGrids 250m (pH, organic carbon, N, texture, CEC) ----------
let soilDownUntil = 0; // SoilGrids is often overloaded; skip it for 30 min after a failure
export async function getSoil(lat, lon) {
  if (Date.now() < soilDownUntil) throw new Error("SoilGrids unavailable (retrying later)");
  const props = ["phh2o", "soc", "nitrogen", "clay", "sand", "silt", "cec", "bdod"].map((p) => `property=${p}`).join("&");
  const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&${props}&depth=0-5cm&depth=15-30cm&value=mean`;
  let d;
  try { d = await fetchJSON(url, { ttlMs: 30 * 24 * HOUR, timeoutMs: 12000 }); }
  catch (e) { soilDownUntil = Date.now() + 0.5 * HOUR; throw e; }
  const out = {};
  for (const layer of d.properties?.layers || []) {
    const div = layer.unit_measure?.d_factor || 1;
    out[layer.name] = Object.fromEntries(layer.depths.map((x) => [x.label, x.values.mean == null ? null : round(x.values.mean / div, 2)]));
  }
  const top = (k) => out[k]?.["0-5cm"];
  const clay = top("clay"), sand = top("sand");
  return {
    raw: out,
    ph: top("phh2o"),
    organic_carbon_g_per_kg: top("soc"),
    nitrogen_g_per_kg: top("nitrogen"),
    clay_pct: clay, // d_factor already converts g/kg → %
    sand_pct: sand,
    texture: textureClass(clay, sand),
  };
}

function textureClass(clay, sand) {
  if (clay == null || sand == null) return "unknown";
  if (clay >= 40) return "clay";
  if (sand >= 70) return "sandy";
  if (clay >= 27) return "clay loam";
  if (sand >= 50) return "sandy loam";
  return "loam";
}

// ---------- 6. Climate normals: NASA POWER (30-yr monthly climatology, agro community) ----------
export async function getClimateNormals(lat, lon) {
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
  const d = await fetchJSON(url, { ttlMs: 30 * 24 * HOUR, timeoutMs: 25000 });
  return d.properties?.parameter;
}

// ---------- 7. Vegetation health: NASA MODIS MOD13Q1 NDVI (250 m, 16-day) via ORNL DAAC ----------
export async function getNDVI(lat, lon) {
  const today = new Date();
  const start = new Date(today.getTime() - 120 * 24 * HOUR);
  const doy = (d) => `A${d.getUTCFullYear()}${String(Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / (24 * HOUR))).padStart(3, "0")}`;
  const url = `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=${lat}&longitude=${lon}&band=250m_16_days_NDVI` +
    `&startDate=${doy(start)}&endDate=${doy(today)}&kmAboveBelow=0&kmLeftRight=0`;
  const d = await fetchJSON(url, { ttlMs: 24 * HOUR, timeoutMs: 25000 });
  return (d.subset || []).map((s) => ({ date: s.calendar_date, ndvi: s.data?.[0] == null ? null : round(s.data[0] * 0.0001, 3) }))
    .filter((s) => s.ndvi != null && s.ndvi > -0.2);
}

// ---------- 8. Active fires: NASA FIRMS VIIRS (optional, needs free MAP_KEY) ----------
export async function getFires(lat, lon) {
  const key = process.env.NASA_FIRMS_MAP_KEY;
  if (!key) throw new Error("NASA_FIRMS_MAP_KEY not set");
  const box = [lon - 0.5, lat - 0.5, lon + 0.5, lat + 0.5].map((x) => round(x, 3)).join(",");
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${box}/2`;
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 15000);
  const text = await (await fetch(url, { signal: ctrl.signal })).text();
  const rows = text.trim().split("\n").slice(1).filter(Boolean);
  return { count_48h: rows.length, radius_km: 55 };
}
