// Rule-based alert & prediction engine. Pure functions over the data snapshot, so it runs
// without any AI key and is cheap enough to re-evaluate every hour for every subscribed farm.
import { CROPS, DISEASE_MODELS } from "../data/crops.js";
import { round, sum, max, min } from "../util.js";

const SOIL_WATER = { // volumetric m³/m³: field capacity, wilting point
  sandy: [0.15, 0.06], "sandy loam": [0.21, 0.09], loam: [0.27, 0.12], "clay loam": [0.32, 0.17], clay: [0.36, 0.2], unknown: [0.27, 0.12],
};
const SENSITIVE_STAGES = new Set(["flowering", "grain", "pod", "tuber", "bulb", "squaring"]);
const RANK = { critical: 0, warning: 1, advisory: 2, info: 3 };

// Convert Open-Meteo hourly arrays into row objects starting at the current hour.
export function hourlyRows(weather) {
  const h = weather.hourly;
  const nowKey = (weather.current?.time || "").slice(0, 13);
  let start = h.time.findIndex((t) => t.slice(0, 13) >= nowKey);
  if (start < 0) start = 0;
  const rows = [];
  for (let i = start; i < h.time.length; i++) {
    rows.push({
      time: h.time[i], hour: Number(h.time[i].slice(11, 13)),
      t: h.temperature_2m[i], rh: h.relative_humidity_2m[i], p: h.precipitation[i] ?? 0,
      pp: h.precipitation_probability[i] ?? 0, code: h.weather_code[i], wind: h.wind_speed_10m[i],
      gust: h.wind_gusts_10m[i], vpd: h.vapour_pressure_deficit[i], cape: h.cape[i],
      sm1: h.soil_moisture_0_to_1cm[i], sm2: h.soil_moisture_3_to_9cm[i], sm3: h.soil_moisture_9_to_27cm[i],
      lw: h.leaf_wetness_probability?.[i] ?? 0, et0: h.et0_fao_evapotranspiration[i],
    });
  }
  return rows;
}

export function dailyRows(weather) {
  const d = weather.daily;
  const today = (weather.current?.time || "").slice(0, 10);
  return d.time.map((date, i) => ({
    date, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], rain: d.precipitation_sum[i] ?? 0,
    pp: d.precipitation_probability_max[i] ?? 0, gust: d.wind_gusts_10m_max[i], code: d.weather_code[i],
    et0: d.et0_fao_evapotranspiration[i], uv: d.uv_index_max[i], sun_h: round((d.sunshine_duration[i] || 0) / 3600),
  })).filter((r) => r.date >= today);
}

// ---- Disease & pest risk (next 72 h) ----
export function diseaseRisk(rows, cropId) {
  const crop = CROPS[cropId];
  const ids = crop ? crop.diseases : Object.keys(DISEASE_MODELS);
  const window = rows.slice(0, 72);
  return ids.map((id) => {
    const m = DISEASE_MODELS[id];
    let streak = 0, best = 0, count = 0, firstHit = null;
    for (const r of window) {
      if (m.test(r)) { streak++; count++; best = Math.max(best, streak); firstHit ??= r.time; } else streak = 0;
    }
    // Fungal infection needs a continuous wet period; insects respond to cumulative favourable hours.
    const driver = m.kind === "pest" || m.kind === "viral" ? count : best;
    const score = Math.min(100, Math.round((driver / m.hoursForHigh) * 75 + (count / window.length) * 25));
    return { id, name: m.en, name_hi: m.hi, kind: m.kind, score, level: score >= 70 ? "high" : score >= 40 ? "moderate" : "low",
      favourable_hours: count, longest_wet_spell_h: best, onset: firstHit, action: m.action };
  }).sort((a, b) => b.score - a.score);
}

// ---- Spray windows (next 72 h, daylight) ----
export function sprayWindows(rows) {
  const ok = rows.slice(0, 72).map((r, i, a) => {
    const next4 = a.slice(i, i + 4);
    const dry = next4.every((x) => x.p < 0.1 && x.pp < 35);
    return r.hour >= 6 && r.hour <= 18 && r.wind < 12 && r.gust < 22 && r.t < 32 && r.rh >= 40 && r.rh <= 90 && dry;
  });
  const windows = [];
  for (let i = 0; i < ok.length; i++) {
    if (!ok[i]) continue;
    let j = i;
    while (j + 1 < ok.length && ok[j + 1]) j++;
    if (j - i + 1 >= 2) windows.push({ start: rows[i].time, end: rows[j].time, hours: j - i + 1,
      avg_wind_kmh: round(sum(rows.slice(i, j + 1).map((r) => r.wind)) / (j - i + 1)) });
    i = j;
  }
  return windows;
}

// ---- Irrigation (FAO-56 water balance + root-zone soil moisture) ----
export function irrigationPlan(rows, days, cropId, stage, texture = "unknown") {
  const kc = stage?.kc ?? 0.8;
  const next7 = days.slice(0, 7);
  const etc = sum(next7.map((d) => (d.et0 || 0) * kc));
  const effRain = sum(next7.map((d) => (d.rain > 5 ? d.rain * 0.8 : 0)));
  const [fc, wp] = SOIL_WATER[texture] || SOIL_WATER.unknown;
  const sm = rows[0]?.sm3 ?? null;
  const depletion = sm == null ? null : Math.max(0, Math.min(100, Math.round(((fc - sm) / (fc - wp)) * 100)));
  const deficit = Math.max(0, etc - effRain);
  let advice;
  if (cropId === "rice") advice = depletion > 30 ? "Field is drying — restore 5 cm standing water." : "Maintain 2–5 cm standing water; drain 7–10 days before harvest.";
  else if (depletion != null && depletion >= 60) advice = `Irrigate within 24 h — root zone is ${depletion}% depleted.`;
  else if (depletion != null && depletion >= 45) advice = `Plan irrigation in 2–3 days unless rain arrives (${depletion}% depleted).`;
  else if (deficit < 5) advice = "No irrigation needed this week — forecast rain covers crop water demand.";
  else advice = `Soil moisture adequate now; expect to apply ~${round(deficit, 0)} mm over the week.`;
  return { kc, crop_water_need_7d_mm: round(etc), effective_rain_7d_mm: round(effRain), deficit_mm: round(deficit),
    root_zone_moisture: sm, field_capacity: fc, wilting_point: wp, depletion_pct: depletion, texture, advice };
}

// ---- Growing degree days & harvest estimate ----
export function gddOutlook(days, cropId, stage) {
  const c = CROPS[cropId];
  if (!c) return null;
  const gdd = days.map((d) => Math.max(0, (d.tmax + d.tmin) / 2 - c.gddBase));
  return { base_c: c.gddBase, next_days_gdd: round(sum(gdd)), avg_daily_gdd: round(sum(gdd) / (gdd.length || 1)),
    est_harvest_in_days: stage?.harvest_in_days ?? null };
}

// ---- Yield risk index: combines stress signals into 0–100 ----
export function yieldRisk({ days, disease, irrigation, stage, cropId, ndvi }) {
  const c = CROPS[cropId];
  if (!c) return null;
  if (stage?.planned) return { score: 0, level: "low", factors: {}, stage_sensitive: false, note: "Crop not sown yet" };
  const sensitive = stage && SENSITIVE_STAGES.has(stage.id);
  const heatDays = days.slice(0, 7).filter((d) => d.tmax >= c.heatStress + (sensitive ? 0 : 3)).length;
  const coldDays = days.slice(0, 7).filter((d) => d.tmin <= c.coldStress).length;
  const factors = {
    heat: Math.min(30, heatDays * (sensitive ? 8 : 4)),
    cold: Math.min(25, coldDays * (sensitive ? 8 : 4)),
    disease: Math.round((disease[0]?.score || 0) * 0.25),
    water: irrigation?.depletion_pct >= 60 ? 15 : irrigation?.depletion_pct >= 45 ? 7 : 0,
    vegetation: ndvi?.trend === "falling" ? 10 : 0,
  };
  const score = Math.min(100, sum(Object.values(factors)));
  return { score, level: score >= 50 ? "high" : score >= 25 ? "moderate" : "low", factors, stage_sensitive: !!sensitive };
}

export function ndviSummary(series, sowDate) {
  if (!series?.length) return null;
  const last = series[series.length - 1], prev = series[series.length - 2];
  const delta = prev ? round(last.ndvi - prev.ndvi, 3) : null;
  const health = last.ndvi >= 0.6 ? "dense healthy" : last.ndvi >= 0.4 ? "moderate" : last.ndvi >= 0.2 ? "sparse / stressed or fallow" : "bare soil";
  const ageDays = Math.round((Date.now() - new Date(last.date).getTime()) / 86400000);
  // MODIS composites lag ~2–5 weeks; a reading older than 40 days or from before sowing says nothing about this crop.
  const stale = ageDays > 40 || (sowDate && last.date < sowDate);
  const trend = stale || delta == null ? "n/a" : delta <= -0.08 ? "falling" : delta >= 0.08 ? "rising" : "stable";
  return { latest: last, delta, trend, health, age_days: ageDays, stale: !!stale,
    note: stale ? "Latest satellite composite predates the current crop or is >40 days old." : null, series };
}

// ---- The main alert builder ----
export function buildAlerts(s) {
  const A = [];
  const add = (a) => A.push({ confidence: "medium", ...a });
  const crop = CROPS[s.crop];
  const { rows, days, stage } = s;

  for (const d of days.slice(0, 7)) {
    if (d.rain >= 115.6) add({ id: `rain-xh-${d.date}`, severity: "critical", category: "weather", when: d.date,
      title: "Very heavy rain forecast", title_hi: "अति भारी वर्षा की चेतावनी",
      message: `${round(d.rain, 0)} mm expected on ${d.date}.`, action: "Open field drains, postpone fertiliser/spray, move harvested produce to covered storage." });
    else if (d.rain >= 64.5) add({ id: `rain-h-${d.date}`, severity: "warning", category: "weather", when: d.date,
      title: "Heavy rain forecast", title_hi: "भारी वर्षा की चेतावनी",
      message: `${round(d.rain, 0)} mm expected on ${d.date} (probability ${d.pp}%).`, action: "Clear drainage channels; avoid irrigation and urea top-dressing 48 h before." });
    else if (d.rain >= 10 && stage && stage.harvest_in_days <= 10) add({ id: `rain-harv-${d.date}`, severity: "advisory", category: "weather", when: d.date,
      title: "Rain near harvest", title_hi: "कटाई के समय बारिश",
      message: `${round(d.rain, 0)} mm on ${d.date} while crop is ready for harvest.`, action: "Harvest before the rain if grain moisture allows, or cover cut produce." });

    if (d.tmax >= 45) add({ id: `heat-x-${d.date}`, severity: "critical", category: "weather", when: d.date,
      title: "Severe heatwave", title_hi: "भीषण लू", message: `Max ${round(d.tmax)}°C on ${d.date}.`,
      action: "Irrigate in evening, mulch, avoid field work 11 AM–4 PM, provide shade/water to livestock." });
    else if (crop && d.tmax >= crop.heatStress + (SENSITIVE_STAGES.has(stage?.id) ? 0 : 3)) add({ id: `heat-${d.date}`, severity: SENSITIVE_STAGES.has(stage?.id) ? "warning" : "advisory",
      category: "weather", when: d.date, title: `Heat stress for ${crop.en}`, title_hi: `${crop.hi} में गर्मी का तनाव`,
      message: `Max ${round(d.tmax)}°C exceeds the ${crop.heatStress}°C stress limit${stage ? ` at ${stage.en} stage` : ""}.`,
      action: "Light irrigation to cool canopy; spray 2% KNO₃ or 0.5% ZnSO₄ to reduce heat injury." });

    if (d.tmin <= 0) add({ id: `frost-x-${d.date}`, severity: "critical", category: "weather", when: d.date,
      title: "Ground frost likely", title_hi: "पाला पड़ने की संभावना", message: `Min ${round(d.tmin)}°C on ${d.date}.`,
      action: "Irrigate the evening before, smoke the field edges at night, spray thiourea 0.1% or sulphuric acid 0.1%." });
    else if (crop && d.tmin <= crop.coldStress) add({ id: `cold-${d.date}`, severity: "warning", category: "weather", when: d.date,
      title: `Cold injury risk for ${crop.en}`, title_hi: `${crop.hi} में ठंड से नुकसान`,
      message: `Min ${round(d.tmin)}°C is at/below the crop's ${crop.coldStress}°C limit.`, action: "Light evening irrigation; cover nurseries with polythene." });

    if (d.gust >= 50) add({ id: `wind-x-${d.date}`, severity: "critical", category: "weather", when: d.date,
      title: "Damaging winds", title_hi: "तेज़ आंधी", message: `Gusts up to ${round(d.gust, 0)} km/h.`,
      action: "Do not irrigate tall crops (lodging risk); stake banana/sugarcane; secure polyhouses." });
    else if (d.gust >= 40) add({ id: `wind-${d.date}`, severity: "warning", category: "weather", when: d.date,
      title: "Strong winds", title_hi: "तेज़ हवा", message: `Gusts up to ${round(d.gust, 0)} km/h.`, action: "No spraying; avoid irrigation in lodging-prone crops." });

    if ([96, 99].includes(d.code)) add({ id: `hail-${d.date}`, severity: "critical", category: "weather", when: d.date,
      title: "Thunderstorm with hail", title_hi: "ओलावृष्टि की चेतावनी", message: `Hail-producing storm forecast on ${d.date}.`,
      action: "Harvest mature produce early, cover nurseries; document damage for PMFBY claim within 72 h (call 14447)." });
    else if (d.code === 95) add({ id: `ts-${d.date}`, severity: "warning", category: "weather", when: d.date,
      title: "Thunderstorm & lightning", title_hi: "आकाशीय बिजली", message: `Thunderstorms likely on ${d.date}.`,
      action: "Stay away from open fields, trees and water bodies during storms; keep livestock sheltered." });
  }

  // Dry spell during kharif.
  const month = new Date().getMonth() + 1;
  if (month >= 6 && month <= 9 && days.length >= 10 && days.slice(0, 10).every((d) => d.rain < 2.5)) add({
    id: "dry-spell", severity: "warning", category: "weather", title: "Monsoon dry spell", title_hi: "सूखे का दौर",
    message: "No significant rain expected for the next 10 days.", action: "Protective irrigation at critical stages; hoeing to conserve moisture; mulch." });

  // Climate anomaly vs NASA POWER 30-year monthly mean temperature.
  const normalT = s.normals?.T2M?.[["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][month - 1]];
  if (normalT != null && days.length >= 5) {
    const wk = days.slice(0, 7);
    const avg = sum(wk.map((d) => (d.tmax + d.tmin) / 2)) / wk.length;
    const anom = round(avg - normalT);
    if (Math.abs(anom) >= 3) add({ id: "anomaly", severity: "advisory", category: "climate",
      title: anom > 0 ? "Warmer than normal week" : "Cooler than normal week", title_hi: anom > 0 ? "सामान्य से अधिक गर्म सप्ताह" : "सामान्य से ठंडा सप्ताह",
      message: `Forecast mean temperature ${round(avg)}°C vs 30-year normal ${round(normalT)}°C (${anom > 0 ? "+" : ""}${anom}°C).`,
      action: anom > 0 ? "Expect faster crop development and higher water demand; advance irrigation." : "Crop development slows; watch for fungal disease in humid spells.", source: "NASA POWER" });
  }

  // Before sowing: sowing-window advice instead of crop disease/pest alerts.
  if (stage?.planned) {
    const wk = days.slice(0, 7);
    const meanT = round(sum(wk.map((d) => (d.tmax + d.tmin) / 2)) / (wk.length || 1));
    const rain = round(sum(wk.map((d) => d.rain)), 0);
    const topSoil = rows[0]?.sm2;
    add({ id: "pre-sowing", severity: "info", category: "operations", title: `Sowing in ${stage.days_to_sowing} days`, title_hi: `${stage.days_to_sowing} दिन में बुवाई`,
      message: `Next 7 days: mean ${meanT}°C, ${rain} mm rain; topsoil moisture ${topSoil ?? "n/a"} m³/m³.`,
      action: `${crop?.en || "Crop"} germinates best when the field is at proper moisture (wattar). Treat seed before sowing and apply basal fertiliser per soil test.` });
  }

  // Disease / pest (only once the crop is in the field).
  for (const r of s.disease.filter((d) => !stage?.planned).filter((d) => d.level !== "low").slice(0, 4)) add({ id: `dz-${r.id}`,
    severity: r.level === "high" ? "warning" : "advisory", category: r.kind === "pest" ? "pest" : "disease", when: r.onset,
    title: `${r.name} risk ${r.level}`, title_hi: `${r.name_hi} का ${r.level === "high" ? "उच्च" : "मध्यम"} खतरा`,
    message: `${r.favourable_hours} favourable hours in next 72 h (longest humid spell ${r.longest_wet_spell_h} h). Risk score ${r.score}/100.`,
    action: r.action, confidence: r.level === "high" ? "high" : "medium" });

  // Spray window.
  if (s.spray.length) {
    const w = s.spray[0];
    add({ id: "spray", severity: "info", category: "operations", when: w.start, title: "Best spray window", title_hi: "छिड़काव का सही समय",
      message: `${w.start.slice(5, 16).replace("T", " ")} → ${w.end.slice(11, 16)} (${w.hours} h, wind ${w.avg_wind_kmh} km/h, no rain).`,
      action: "Spray in this window for best uptake; avoid noon heat." });
  } else add({ id: "no-spray", severity: "advisory", category: "operations", title: "No safe spray window in 72 h", title_hi: "72 घंटे में छिड़काव न करें",
    message: "Wind, rain or heat make spraying ineffective for the next 3 days.", action: "Postpone pesticide/foliar sprays; recheck tomorrow." });

  // Irrigation.
  if (s.irrigation?.depletion_pct >= 45 && s.crop !== "rice") add({ id: "irrigate", severity: s.irrigation.depletion_pct >= 60 ? "warning" : "advisory",
    category: "irrigation", title: "Irrigation needed", title_hi: "सिंचाई की आवश्यकता", message: s.irrigation.advice,
    action: `Crop needs ~${s.irrigation.crop_water_need_7d_mm} mm this week; forecast rain gives ${s.irrigation.effective_rain_7d_mm} mm.` });

  // Flood (GloFAS).
  const fl = s.flood?.daily;
  if (fl?.river_discharge_max) {
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < fl.time.length; i++) {
      if (fl.time[i] < today) continue;
      const q = fl.river_discharge_max[i], med = fl.river_discharge_median?.[i];
      if (q > 50 && med > 0 && q / med >= 2.5) {
        add({ id: "flood", severity: q / med >= 4 ? "critical" : "warning", category: "flood", when: fl.time[i],
          title: "River flood risk", title_hi: "बाढ़ का खतरा", message: `Nearby river discharge forecast ${round(q, 0)} m³/s on ${fl.time[i]} — ${round(q / med)}× normal.`,
          action: "Move livestock, seed and fertiliser stocks to higher ground; follow district disaster authority advisories.", source: "GloFAS" });
        break;
      }
    }
  }

  // Air quality & fires.
  const aq = s.air?.current;
  if (aq?.pm2_5 >= 120) add({ id: "aqi", severity: "advisory", category: "air", title: "Very poor air quality", title_hi: "खराब वायु गुणवत्ता",
    message: `PM2.5 at ${round(aq.pm2_5, 0)} µg/m³ (AQI ${aq.us_aqi}). Haze reduces sunlight for crops.`, action: "Wear a mask for field work; avoid stubble burning — use Happy Seeder / bio-decomposer (Pusa)." });
  if (aq?.ozone >= 120) add({ id: "ozone", severity: "advisory", category: "air", title: "High ground-level ozone", title_hi: "ओज़ोन स्तर उच्च",
    message: `Ozone ${round(aq.ozone, 0)} µg/m³ can cause leaf injury in wheat/rice.`, action: "Maintain adequate irrigation; ozone damage is worse in water-stressed plants." });
  if (s.fires?.count_48h >= 15) add({ id: "fires", severity: "advisory", category: "air", title: "Crop-residue fires nearby", title_hi: "पराली जलाने की घटनाएं",
    message: `${s.fires.count_48h} active fires detected by satellite within ~55 km in 48 h.`, action: "Residue burning is punishable and harms soil; use in-situ management or ex-situ baling.", source: "NASA FIRMS" });

  // Satellite crop health.
  if (s.ndvi?.trend === "falling") add({ id: "ndvi-drop", severity: "warning", category: "vegetation", title: "Crop vigour falling (satellite)", title_hi: "फसल की हरियाली घट रही है",
    message: `NDVI fell ${s.ndvi.delta} to ${s.ndvi.latest.ndvi} (${s.ndvi.latest.date}). Could be water stress, pest damage, or normal senescence near harvest.`,
    action: "Walk the field and check for patchy yellowing, pests or waterlogging.", source: "NASA MODIS" });

  // Market.
  const pr = s.prices;
  if (pr?.summary) {
    const m = pr.summary;
    if (m.msp && m.avg_modal < m.msp) add({ id: "below-msp", severity: "warning", category: "market", title: "Mandi price below MSP", title_hi: "मंडी भाव MSP से नीचे",
      message: `Average modal ₹${m.avg_modal}/qtl vs MSP ₹${m.msp} across ${m.markets} markets.`, action: "Register for government procurement at the nearest centre; consider storing under warehouse receipt (e-NWR) loans." });
    // Only suggest markets inside the farmer's state; all-India fallback markets can be far away.
    if (pr.scope !== "India" && m.markets > 1 && m.spread >= 0.1 * m.avg_modal) add({ id: "best-market", severity: "info", category: "market", title: `Best price: ${m.best.market}`, title_hi: `सबसे अच्छा भाव: ${m.best.market}`,
      message: `₹${m.best.modal}/qtl at ${m.best.market} (${m.best.district}) vs lowest ₹${m.worst.modal} — difference ₹${m.spread}.`, action: "Compare transport cost before choosing the mandi; check e-NAM for online bids." });
  }
  if (pr?.trend?.change_pct != null && Math.abs(pr.trend.change_pct) >= 8) add({ id: "price-trend", severity: "info", category: "market",
    title: pr.trend.change_pct > 0 ? "Prices rising" : "Prices falling", title_hi: pr.trend.change_pct > 0 ? "भाव बढ़ रहे हैं" : "भाव गिर रहे हैं",
    message: `${pr.trend.change_pct > 0 ? "+" : ""}${pr.trend.change_pct}% over ${pr.trend.days} days of recorded arrivals.`, action: pr.trend.change_pct > 0 ? "Holding stock may pay off if storage is safe." : "Consider selling sooner or using warehouse storage." });

  return mergeDaily(A).sort((a, b) => RANK[a.severity] - RANK[b.severity] || String(a.when || "").localeCompare(String(b.when || "")));
}

// Collapse per-day alerts of the same type (e.g. 6 heat days) into one alert listing all dates.
function mergeDaily(alerts) {
  const groups = new Map();
  for (const a of alerts) {
    const key = a.id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  return [...groups.values()].map((g) => {
    if (g.length === 1) return g[0];
    const worst = [...g].sort((a, b) => RANK[a.severity] - RANK[b.severity])[0];
    const dates = g.map((a) => a.when).filter(Boolean);
    return { ...worst, id: worst.id.replace(/-\d{4}-\d{2}-\d{2}$/, ""), when: dates[0], dates,
      message: `${worst.message} Affects ${g.length} days: ${dates.map((d) => d.slice(5)).join(", ")}.` };
  });
}
