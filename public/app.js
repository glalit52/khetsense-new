// KhetiSense frontend — no build step. All data comes from the local API (/api/*).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const SAMPLE_FARM = { lat: 29.6857, lon: 76.9905, place: "Karnal, Haryana", state: "Haryana", crop: "mustard", sowDate: "2026-10-05", sample: true };
let profile = { lang: "hi", ...SAMPLE_FARM, ...store.get("ks.profile", {}) };
let config = { ai: false, crops: [] };
let snapshot = null;
let chart = null;

// ---------------- i18n (UI chrome; AI answers follow the selected language) ----------------
const T = {
  en: {
    tagline: "AI farm advisor", setFarm: "Set your farm", heroTitle: "Your farm's live advisor",
    heroSub: "Ask by voice in your language, scan a leaf, and get alerts before weather, pests or prices hit your crop.",
    askPh: "Ask anything about your crop…", alerts: "Alerts", enableAlerts: "Turn on alerts", alertsOn: "Alerts on ✓", weather: "Weather",
    forecast48: "Next 48 hours", predictions: "Predictions", yieldRisk: "Yield risk", diseaseRisk: "Disease & pest risk (72 h)",
    irrigation: "Irrigation", spray: "Spray windows", aiBrief: "AI farm brief", genBrief: "Generate today's brief",
    briefIntro: "The AI agent reads every data source for your farm and predicts what will happen this week, with a day-by-day plan.",
    mandi: "Mandi prices", satellite: "Satellite crop health", soilAir: "Soil, air & flood", schemes: "Schemes & helplines",
    sources: "Live data sources", assistant: "KhetiSense assistant", yourFarm: "Your farm", searchPh: "Search village / town / district",
    useGps: "Use GPS", tapMap: "Tap the map to mark your field.", crop: "Crop", sowDate: "Sowing date", area: "Area (acres)",
    cancel: "Cancel", save: "Save", scanTitle: "Crop disease scan", scanHint: "Photograph one affected leaf in daylight, close up, in focus.",
    choosePhoto: "📷 Take or choose a photo", notePh: "Optional: what did you notice? (e.g. spreading since 3 days)", close: "Close",
    diagnose: "Diagnose", alertSetup: "Alert delivery", turnOff: "Turn off",
    alertSetupHint: "Your farm is checked every hour. Critical and warning alerts appear here as notifications and are sent to any channel below.",
    noAlerts: "No alerts right now — conditions look normal.", sample: "Showing a sample farm (Karnal, mustard). Set your farm for personal alerts.",
    noAI: "AI assistant, crop scan and AI brief need an Anthropic API key. Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart. Alerts, forecasts and prices work without it.",
    suggestions: ["Should I irrigate this week?", "Best time to spray today?", "Which mandi gives the best price?", "Yellow rust risk on my wheat?"],
    thinking: "Thinking", tools: { get_farm_snapshot: "Reading farm data", get_mandi_prices: "Checking mandi prices", search_place: "Finding place", get_crop_knowledge: "Crop reference", get_schemes_and_helplines: "Schemes", web_search: "Searching the web" },
  },
  hi: {
    tagline: "AI कृषि सलाहकार", setFarm: "अपना खेत चुनें", heroTitle: "आपके खेत का लाइव सलाहकार",
    heroSub: "अपनी भाषा में बोलकर पूछें, पत्ती का फोटो स्कैन करें, और मौसम, कीट या भाव से पहले चेतावनी पाएं।",
    askPh: "अपनी फसल के बारे में कुछ भी पूछें…", alerts: "चेतावनियाँ", enableAlerts: "अलर्ट चालू करें", alertsOn: "अलर्ट चालू ✓", weather: "मौसम",
    forecast48: "अगले 48 घंटे", predictions: "पूर्वानुमान", yieldRisk: "पैदावार जोखिम", diseaseRisk: "रोग व कीट जोखिम (72 घंटे)",
    irrigation: "सिंचाई", spray: "छिड़काव का समय", aiBrief: "AI खेत रिपोर्ट", genBrief: "आज की रिपोर्ट बनाएं",
    briefIntro: "AI एजेंट आपके खेत के सभी डेटा स्रोत पढ़कर इस सप्ताह का पूर्वानुमान और दिन-वार योजना देता है।",
    mandi: "मंडी भाव", satellite: "उपग्रह से फसल स्वास्थ्य", soilAir: "मिट्टी, हवा व बाढ़", schemes: "योजनाएं व हेल्पलाइन",
    sources: "लाइव डेटा स्रोत", assistant: "खेतीसेंस सहायक", yourFarm: "आपका खेत", searchPh: "गाँव / कस्बा / ज़िला खोजें",
    useGps: "GPS से", tapMap: "मानचित्र पर अपना खेत चिह्नित करें।", crop: "फसल", sowDate: "बुवाई की तारीख", area: "क्षेत्र (एकड़)",
    cancel: "रद्द करें", save: "सहेजें", scanTitle: "फसल रोग जांच", scanHint: "दिन की रोशनी में एक प्रभावित पत्ती का पास से साफ फोटो लें।",
    choosePhoto: "📷 फोटो लें या चुनें", notePh: "वैकल्पिक: आपने क्या देखा? (जैसे 3 दिन से फैल रहा है)", close: "बंद करें",
    diagnose: "जांच करें", alertSetup: "अलर्ट कैसे भेजें", turnOff: "बंद करें",
    alertSetupHint: "आपके खेत की हर घंटे जांच होती है। गंभीर चेतावनियाँ यहाँ सूचना के रूप में और नीचे दिए माध्यम पर भेजी जाती हैं।",
    noAlerts: "अभी कोई चेतावनी नहीं — स्थिति सामान्य है।", sample: "नमूना खेत दिखाया जा रहा है (करनाल, सरसों)। व्यक्तिगत अलर्ट के लिए अपना खेत चुनें।",
    noAI: "AI सहायक, फसल स्कैन और AI रिपोर्ट के लिए Anthropic API key चाहिए। <code>.env</code> में <code>ANTHROPIC_API_KEY</code> जोड़ें। अलर्ट, मौसम और भाव बिना key के काम करते हैं।",
    suggestions: ["क्या इस हफ्ते सिंचाई करूं?", "आज छिड़काव का सही समय?", "किस मंडी में सबसे अच्छा भाव है?", "गेहूं में पीला रतुआ का खतरा?"],
    thinking: "सोच रहा है", tools: { get_farm_snapshot: "खेत का डेटा पढ़ रहा है", get_mandi_prices: "मंडी भाव देख रहा है", search_place: "जगह खोज रहा है", get_crop_knowledge: "फसल जानकारी", get_schemes_and_helplines: "योजनाएं", web_search: "वेब पर खोज रहा है" },
  },
};
const ui = () => T[profile.lang === "hi" || profile.lang === "mr" ? "hi" : "en"];
const t = (k) => ui()[k] ?? T.en[k] ?? k;
function applyI18n() {
  document.documentElement.lang = profile.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $("#suggestions").innerHTML = ui().suggestions.map((s) => `<button class="chip" type="button">${esc(s)}</button>`).join("");
  $("#suggestions").querySelectorAll(".chip").forEach((b) => b.onclick = () => ask(b.textContent));
  updateFarmChip();
  updateSubBtn();
}

function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 3500); }
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------------- Weather helpers ----------------
const WMO = (c) => c === 0 ? "☀️" : c <= 2 ? "🌤️" : c === 3 ? "☁️" : c <= 48 ? "🌫️" : c <= 57 ? "🌦️" : c <= 67 ? "🌧️" : c <= 77 ? "🌨️" : c <= 82 ? "🌧️" : c <= 86 ? "🌨️" : "⛈️";
const dayName = (iso) => new Date(iso + "T00:00").toLocaleDateString(profile.lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short" });
const fmtClock = (iso) => new Date(iso).toLocaleTimeString(profile.lang === "hi" ? "hi-IN" : "en-IN", { hour: "numeric", minute: "2-digit" });
const fmtTime = (iso) => new Date(iso).toLocaleString(profile.lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" });

// ---------------- Dashboard ----------------
async function loadSnapshot() {
  $("#alertsList").innerHTML = `<div class="skeleton" style="height:120px"></div>`;
  const q = new URLSearchParams({ lat: profile.lat, lon: profile.lon, crop: profile.crop });
  if (profile.sowDate) q.set("sow", profile.sowDate);
  try {
    snapshot = await api(`/api/snapshot?${q}`);
    if (!profile.state && snapshot.location.state) profile.state = snapshot.location.state;
    render();
  } catch (e) {
    $("#alertsList").innerHTML = `<div class="empty">⚠️ ${esc(e.message)}</div>`;
  }
}

function render() {
  const s = snapshot;
  renderAlerts(s.alerts);
  renderWeather(s);
  renderPredictions(s);
  renderMandi(s.market, s.crop);
  renderNdvi(s.vegetation);
  renderSoilAir(s);
  $("#sources").innerHTML = s.sources.map((x) => `<span class="src ${x.ok ? "" : "bad"}" title="${esc(x.error || `${x.ms} ms`)}">${esc(x.source)}</span>`).join("");
  $("#updated").textContent = new Date(s.generated_at).toLocaleTimeString();
}

function renderAlerts(alerts) {
  const hi = profile.lang === "hi";
  $("#alertsList").innerHTML = alerts.length ? alerts.map((a) => `
    <div class="alert ${a.severity}">
      <div>
        <div class="top"><strong>${esc(hi && a.title_hi ? a.title_hi : a.title)}</strong><span class="tag">${esc(a.severity)}</span><span class="tag">${esc(a.category)}</span>${a.source ? `<span class="tag">${esc(a.source)}</span>` : ""}</div>
        <p>${esc(a.message)}</p>
        <p class="act">${esc(a.action)}</p>
      </div>
    </div>`).join("") : `<div class="empty">✅ ${t("noAlerts")}</div>`;
}

function renderWeather(s) {
  const c = s.current;
  $("#wxPlace").textContent = s.location.label || "";
  $("#wxNow").innerHTML = `
    <div class="icon">${WMO(c.weather_code)}</div>
    <div class="big">${Math.round(c.temperature_2m)}°</div>
    <div class="wx-meta">
      <span>💧 <b>${c.relative_humidity_2m}%</b></span><span>💨 <b>${Math.round(c.wind_speed_10m)}</b> km/h</span><span>☁️ <b>${c.cloud_cover}%</b></span>
      <span>🌡️ feels <b>${Math.round(c.apparent_temperature)}°</b></span><span>🌧️ <b>${c.precipitation}</b> mm</span><span>⛰️ <b>${s.location.elevation_m}</b> m</span>
    </div>`;
  $("#wxDays").innerHTML = s.daily.map((d) => `
    <div class="day"><div>${esc(dayName(d.date))}</div><div class="i">${WMO(d.code)}</div>
    <div><b>${Math.round(d.tmax)}°</b> / ${Math.round(d.tmin)}°</div><div class="r">${d.rain >= 0.5 ? `${Math.round(d.rain)} mm` : "—"}</div></div>`).join("");

  const h = s.hourly_next_48;
  const css = getComputedStyle(document.documentElement);
  const data = {
    labels: h.map((x) => x.time.slice(11, 16)),
    datasets: [
      { type: "line", label: "°C", data: h.map((x) => x.t), borderColor: css.getPropertyValue("--warn"), tension: .35, pointRadius: 0, yAxisID: "y" },
      { type: "line", label: "RH %", data: h.map((x) => x.rh), borderColor: css.getPropertyValue("--info"), borderDash: [4, 3], tension: .35, pointRadius: 0, yAxisID: "y2" },
      { type: "bar", label: "Rain mm", data: h.map((x) => x.p), backgroundColor: css.getPropertyValue("--info"), yAxisID: "y3" },
    ],
  };
  if (!window.Chart) return;
  chart?.destroy();
  chart = new Chart($("#hourChart"), {
    data, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { boxWidth: 10, color: css.getPropertyValue("--ink-2") } } },
      scales: { x: { ticks: { maxTicksLimit: 8, color: css.getPropertyValue("--ink-2") }, grid: { display: false } },
        y: { position: "left", ticks: { color: css.getPropertyValue("--ink-2") }, grid: { color: css.getPropertyValue("--line") } },
        y2: { position: "right", min: 0, max: 100, display: false }, y3: { position: "right", min: 0, suggestedMax: 5, display: false } } },
  });
}

function riskColor(score) { return score >= 70 ? "var(--crit)" : score >= 40 ? "var(--adv)" : "var(--ok)"; }

function renderPredictions(s) {
  const p = s.predictions, st = s.crop.stage;
  $("#stageTxt").textContent = `${profile.lang === "hi" ? s.crop.hi : s.crop.en}${st ? (st.planned ? ` · sowing in ${st.days_to_sowing} days` : ` · ${st.en} · day ${st.das}`) : ""}`;
  const yr = p.yield_risk;
  $("#riskGauge").innerHTML = yr ? `<span class="n">${yr.score}</span><span class="lvl ${yr.level}">${yr.level}</span>` : "—";
  $("#riskFactors").innerHTML = yr ? Object.entries(yr.factors).filter(([, v]) => v > 0).map(([k, v]) => `<span>${esc(k)} +${v}</span>`).join("") || `<span>no stress factors</span>` : "";
  if (!st) $("#riskFactors").insertAdjacentHTML("beforeend", `<span>add sowing date for stage-aware risk</span>`);

  $("#diseaseBars").innerHTML = p.disease_risk.map((d) => `
    <div class="bar"><div class="l"><span>${esc(profile.lang === "hi" ? d.name_hi : d.name)}</span><b>${d.score}</b></div>
    <div class="t"><div class="f" style="width:${d.score}%;background:${riskColor(d.score)}"></div></div></div>`).join("");

  const ir = p.irrigation;
  const dep = ir.depletion_pct ?? 0;
  $("#irrigation").innerHTML = `
    <div class="kv"><span>Root-zone depletion</span><b>${ir.depletion_pct ?? "—"}%</b></div>
    <div class="meter"><div style="width:${dep}%;background:${dep >= 60 ? "var(--crit)" : dep >= 45 ? "var(--adv)" : "var(--ok)"}"></div></div>
    <div class="kv"><span>Crop need (7 d)</span><b>${ir.crop_water_need_7d_mm} mm</b></div>
    <div class="kv"><span>Useful rain (7 d)</span><b>${ir.effective_rain_7d_mm} mm</b></div>
    <p class="small" style="margin:6px 0 0">${esc(ir.advice)}</p>`;

  $("#sprayList").innerHTML = p.spray_windows.length
    ? p.spray_windows.slice(0, 4).map((w) => `<div class="spray">✅ ${esc(fmtTime(w.start))} → ${esc(fmtClock(w.end))}<br><span class="muted small">${w.hours} h · wind ${w.avg_wind_kmh} km/h</span></div>`).join("")
    : `<div class="spray">⛔ No safe window in 72 h</div>`;
}

function renderMandi(m, crop) {
  if (!m) { $("#mandiSummary").innerHTML = `<div class="empty" style="grid-column:1/-1">Mandi data unavailable for this crop.</div>`; $("#mandiTable").innerHTML = ""; return; }
  const sm = m.summary;
  $("#mandiMeta").textContent = `${crop.en} · ${m.scope === "India" && profile.state ? `All India (none in ${profile.state} today)` : m.scope || profile.state || ""}${m.limited_by_sample_key ? " · sample key (10 markets)" : ""}`;
  if (!sm) { $("#mandiSummary").innerHTML = `<div class="empty" style="grid-column:1/-1">No arrivals reported today in ${esc(profile.state || "this state")}.</div>`; $("#mandiTable").innerHTML = ""; return; }
  const tr = m.trend?.change_pct;
  $("#mandiSummary").innerHTML = `
    <div class="stat"><small>Average modal</small><b>₹${sm.avg_modal.toLocaleString("en-IN")}</b><div class="sub">per quintal · ${sm.markets} markets</div></div>
    <div class="stat"><small>Best market</small><b>₹${sm.best.modal.toLocaleString("en-IN")}</b><div class="sub">${esc(sm.best.market)}</div></div>
    <div class="stat"><small>MSP</small><b>${crop.msp ? `₹${crop.msp.value.toLocaleString("en-IN")}` : "—"}</b><div class="sub">${esc(crop.msp?.season || "no MSP")}</div></div>
    <div class="stat"><small>Trend</small><b>${tr == null ? "—" : `${tr > 0 ? "▲" : "▼"} ${Math.abs(tr)}%`}</b><div class="sub">${m.trend?.days || 0} days recorded</div></div>`;
  const rows = [...m.records].sort((a, b) => b.modal - a.modal);
  $("#mandiTable").innerHTML = `<thead><tr><th>Market</th><th>District</th><th>Variety</th><th class="num">Min</th><th class="num">Max</th><th class="num">Modal</th><th>Date</th></tr></thead><tbody>` +
    rows.map((r, i) => `<tr class="${i === 0 ? "best" : ""}"><td>${esc(r.market)}</td><td>${esc(r.district)}</td><td>${esc(r.variety)}</td><td class="num">${r.min}</td><td class="num">${r.max}</td><td class="num"><b>${r.modal}</b></td><td>${esc(r.date)}</td></tr>`).join("") + "</tbody>";
}

function renderNdvi(v) {
  if (!v) { $("#ndvi").innerHTML = `<div class="empty">Satellite data unavailable.</div>`; return; }
  const pts = v.series, W = 300, H = 70, mn = 0, mx = 1;
  const x = (i) => (i / Math.max(1, pts.length - 1)) * (W - 10) + 5, y = (n) => H - 5 - ((n - mn) / (mx - mn)) * (H - 10);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.ndvi).toFixed(1)}`).join("");
  $("#ndvi").innerHTML = `
    <div class="kv"><span>Latest NDVI (${esc(v.latest.date)})</span><b>${v.latest.ndvi}</b></div>
    <div class="kv"><span>Canopy</span><b>${esc(v.health)}</b></div>
    <div class="kv"><span>Trend</span><b>${esc(v.trend)}${v.delta != null ? ` (${v.delta > 0 ? "+" : ""}${v.delta})` : ""}</b></div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="NDVI trend" style="margin-top:8px">
      <path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2.5"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.ndvi)}" r="3" fill="var(--brand)"><title>${p.date}: ${p.ndvi}</title></circle>`).join("")}
    </svg>
    <p class="muted small">${esc(v.note || "NASA MODIS 250 m, 16-day composite. 0.2 = bare soil, 0.6+ = dense healthy crop.")}</p>`;
}

function renderSoilAir(s) {
  const so = s.soil, aq = s.air_quality, fl = s.flood?.daily;
  const today = new Date().toISOString().slice(0, 10);
  let floodTxt = "—";
  if (fl?.river_discharge_max) {
    const i = fl.time.findIndex((d) => d >= today);
    const peak = Math.max(...fl.river_discharge_max.slice(i));
    const med = fl.river_discharge_median?.[i];
    floodTxt = `${Math.round(peak)} m³/s peak${med ? ` (${(peak / med).toFixed(1)}× normal)` : ""}`;
  }
  $("#soilAir").innerHTML = `
    ${so ? `<div class="kv"><span>Soil pH</span><b>${so.ph ?? "—"}</b></div>
      <div class="kv"><span>Organic carbon</span><b>${so.organic_carbon_g_per_kg ?? "—"} g/kg</b></div>
      <div class="kv"><span>Nitrogen</span><b>${so.nitrogen_g_per_kg ?? "—"} g/kg</b></div>
      <div class="kv"><span>Texture</span><b>${esc(so.texture)} (clay ${so.clay_pct ?? "—"}%, sand ${so.sand_pct ?? "—"}%)</b></div>`
    : `<div class="kv"><span>Soil (SoilGrids)</span><b>temporarily unavailable</b></div>`}
    <div class="kv"><span>Root-zone moisture</span><b>${s.predictions.irrigation.root_zone_moisture ?? "—"} m³/m³</b></div>
    <div class="kv"><span>Air quality (US AQI)</span><b>${aq?.us_aqi ?? "—"}</b></div>
    <div class="kv"><span>PM2.5 / Ozone</span><b>${aq ? `${Math.round(aq.pm2_5)} / ${Math.round(aq.ozone)} µg/m³` : "—"}</b></div>
    <div class="kv"><span>River discharge (14 d)</span><b>${floodTxt}</b></div>
    <div class="kv"><span>Fires within 55 km (48 h)</span><b>${s.fires ? s.fires.count_48h : "add NASA FIRMS key"}</b></div>`;
}

async function loadSchemes() {
  const d = await api("/api/schemes");
  const hi = profile.lang === "hi";
  $("#schemes").innerHTML = d.helplines.map((h) => `<div class="scheme helpline"><b>📞 ${esc(hi ? h.hi : h.name)}</b><br><a href="tel:${esc(h.number)}">${esc(h.number)}</a><br><span class="muted small">${esc(h.note)}</span></div>`).join("") +
    d.schemes.map((s) => `<div class="scheme"><b>${esc(hi ? s.hi : s.name)}</b><p style="margin:4px 0">${esc(s.benefit)}</p><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(new URL(s.url).host)} ↗</a></div>`).join("");
}

// ---------------- AI brief ----------------
$("#briefBtn").onclick = async () => {
  if (!config.ai) return toast("Set ANTHROPIC_API_KEY to enable AI");
  const btn = $("#briefBtn");
  btn.disabled = true; btn.textContent = "…";
  $("#briefOut").innerHTML = `<div class="skeleton" style="height:160px;margin-top:10px"></div>`;
  try {
    const { brief } = await api("/api/brief", { method: "POST", body: JSON.stringify({ profile }) });
    $("#briefIntro").classList.add("hidden");
    $("#briefOut").innerHTML = `
      <div class="brief-head">${esc(brief.headline)} <span class="lvl ${brief.risk_outlook}">· ${esc(brief.risk_outlook)}</span></div>
      <div class="brief-cols">
        <div>${brief.predictions.map((p) => `<div class="predline"><b>${esc(p.topic)}</b> — ${esc(p.prediction)}<div class="meta">${esc(p.horizon)} · confidence ${esc(p.confidence)} · ${esc(p.basis)}</div></div>`).join("")}
          <div class="predline"><b>💰</b> ${esc(brief.sell_or_hold)}</div>
          <div class="predline"><b>👀</b> ${brief.watch_list.map(esc).join(" · ")}</div></div>
        <div>${brief.seven_day_plan.map((d) => `<div class="plan-day"><b>${esc(d.day)}</b><ul>${d.tasks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div>
      </div>`;
  } catch (e) { $("#briefOut").innerHTML = `<div class="empty">⚠️ ${esc(e.message)}</div>`; }
  btn.disabled = false; btn.textContent = t("genBrief");
};

// ---------------- Chat agent (SSE stream) ----------------
let conversationId = null;
let speakReplies = store.get("ks.speak", false);
const md = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/^#{1,4}\s*(.+)$/gm, "<b>$1</b>")
  .replace(/^\s*[-•*]\s+(.+)$/gm, "<li>$1</li>")
  .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>")
  .split(/\n{2,}/).map((p) => p.startsWith("<ul>") ? p : `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

function openChat() { $("#chat").classList.add("open"); $("#chat").setAttribute("aria-hidden", "false"); $("#chatInput").focus(); }
$("#fab").onclick = openChat;
$("#closeChat").onclick = () => { $("#chat").classList.remove("open"); $("#chat").setAttribute("aria-hidden", "true"); };
$("#newChat").onclick = () => { conversationId = null; $("#messages").innerHTML = ""; };
$("#speakToggle").onclick = () => { speakReplies = !speakReplies; store.set("ks.speak", speakReplies); updateSpeak(); if (!speakReplies) speechSynthesis.cancel(); };
function updateSpeak() { $("#speakToggle").textContent = speakReplies ? "🔊" : "🔈"; $("#speakToggle").setAttribute("aria-pressed", String(speakReplies)); }

function addMsg(role, html) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = html;
  $("#messages").appendChild(el);
  $("#messages").scrollTop = 1e9;
  return el;
}

async function ask(text, { image = null, voice = false } = {}) {
  openChat();
  if (!config.ai) { addMsg("bot", t("noAI")); return; }
  addMsg("user", `${image ? `<img src="data:${image.mediaType};base64,${image.data}" alt="">` : ""}${esc(text)}`);
  const bot = addMsg("bot", `<div class="status"><span>${t("thinking")}…</span></div><div class="body"></div>`);
  const status = bot.querySelector(".status"), body = bot.querySelector(".body");
  let full = "";
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, text, image, profile: { ...profile, voice: voice || speakReplies } }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = chunk.match(/^event: (.+)$/m)?.[1], data = JSON.parse(chunk.match(/^data: (.+)$/m)?.[1] || "{}");
        if (ev === "conversation") conversationId = data.id;
        else if (ev === "tool") status.insertAdjacentHTML("beforeend", `<span>🔧 ${esc(ui().tools[data.name] || data.name)}</span>`);
        else if (ev === "text") { full += data.text; body.innerHTML = md(full); $("#messages").scrollTop = 1e9; }
        else if (ev === "error") throw new Error(data.error);
      }
    }
    status.firstElementChild?.remove();
    if (!status.children.length) status.remove();
    const say = document.createElement("button");
    say.className = "say"; say.textContent = "🔊"; say.onclick = () => speak(full);
    bot.appendChild(say);
    if (voice || speakReplies) speak(full);
  } catch (e) { body.innerHTML = `⚠️ ${esc(e.message)}`; }
}

$("#askForm").onsubmit = (e) => { e.preventDefault(); const v = $("#askInput").value.trim(); if (v) { $("#askInput").value = ""; ask(v); } };
$("#chatForm").onsubmit = (e) => { e.preventDefault(); const v = $("#chatInput").value.trim(); if (v) { $("#chatInput").value = ""; ask(v); } };

// ---------------- Voice (Web Speech API) ----------------
const SPEECH_LANG = { hi: "hi-IN", en: "en-IN", pa: "pa-IN", mr: "mr-IN", gu: "gu-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN", kn: "kn-IN", ml: "ml-IN", or: "or-IN" };
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(btn) {
  if (!Recognition) return toast("Voice input is not supported in this browser — try Chrome.");
  const rec = new Recognition();
  rec.lang = SPEECH_LANG[profile.lang] || "hi-IN";
  rec.interimResults = false;
  btn.classList.add("listening");
  rec.onresult = (e) => { const text = e.results[0][0].transcript; if (text) ask(text, { voice: true }); };
  rec.onerror = (e) => toast(`Mic: ${e.error}`);
  rec.onend = () => btn.classList.remove("listening");
  rec.start();
}
$("#micBtn").onclick = () => listen($("#micBtn"));
$("#micBtn2").onclick = () => listen($("#micBtn2"));

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const clean = text.replace(/[*#_`>|]/g, "").replace(/\n+/g, ". ");
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = SPEECH_LANG[profile.lang] || "hi-IN";
  const v = speechSynthesis.getVoices().find((x) => x.lang === u.lang) || speechSynthesis.getVoices().find((x) => x.lang.startsWith(u.lang.slice(0, 2)));
  if (v) u.voice = v;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

// ---------------- Crop scan ----------------
let scanImage = null;
$("#camBtn").onclick = () => { $("#scanOut").innerHTML = ""; $("#scanDlg").showModal(); };
$("#closeScan").onclick = () => $("#scanDlg").close();
$("#fileIn").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  scanImage = await resizeImage(f);
  $("#preview").src = `data:${scanImage.mediaType};base64,${scanImage.data}`;
  $("#preview").hidden = false; $("#dropTxt").hidden = true; $("#runScan").disabled = false;
};
function resizeImage(file, maxSide = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve({ mediaType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
$("#runScan").onclick = async () => {
  if (!config.ai) { $("#scanOut").innerHTML = `<div class="notice">${t("noAI")}</div>`; return; }
  const btn = $("#runScan"); btn.disabled = true; btn.textContent = "…";
  $("#scanOut").innerHTML = `<div class="skeleton" style="height:120px"></div>`;
  try {
    const d = await api("/api/scan", { method: "POST", body: JSON.stringify({ image: scanImage, profile, note: $("#scanNote").value }) });
    const list = (arr) => arr?.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p class='muted'>—</p>";
    $("#scanOut").innerHTML = `<div class="diag">
      <div class="h">${esc(d.problem_local || d.problem)} <span class="tag">${esc(d.category)}</span> <span class="tag">${esc(d.confidence)} confidence</span> <span class="tag">${esc(d.severity)}</span></div>
      <div>${esc(d.crop)} · ${esc(d.problem)}</div>
      <div class="notice">${esc(d.summary_local)}</div>
      <div class="sec"><b>Symptoms seen</b>${list(d.symptoms_seen)}</div>
      <div class="sec"><b>🌿 Organic</b>${list(d.organic_treatment)}</div>
      <div class="sec"><b>🧪 Chemical</b>${list(d.chemical_treatment)}</div>
      <div class="sec"><b>🛡️ Prevention</b>${list(d.prevention)}</div>
      <div class="sec"><b>🌦️ Weather</b><p>${esc(d.weather_note)}</p></div>
      <div class="sec"><b>⚠️ Safety</b><p>${esc(d.safety)}</p></div>
      ${d.differential?.length ? `<div class="sec"><b>Also rule out</b>${list(d.differential)}</div>` : ""}
      ${d.see_expert ? `<div class="notice">👨‍🔬 Confirm with your nearest KVK or call Kisan Call Centre 1800-180-1551.</div>` : ""}
      <button class="btn ghost" id="askAbout">💬 Ask a follow-up</button></div>`;
    $("#askAbout").onclick = () => { $("#scanDlg").close(); ask(`${d.problem} on my ${d.crop}: what should I do first?`, { image: scanImage }); };
    speakReplies && speak(d.summary_local);
  } catch (e) { $("#scanOut").innerHTML = `<div class="empty">⚠️ ${esc(e.message)}</div>`; }
  btn.disabled = false; btn.textContent = t("diagnose");
};

// ---------------- Farm setup ----------------
let map, marker, pending = null;
function updateFarmChip() {
  const crop = config.crops.find((c) => c.id === profile.crop);
  const name = crop ? (profile.lang === "hi" ? crop.hi : crop.en) : "";
  $("#farmChipText").textContent = profile.sample ? t("setFarm") : `${profile.place?.split(",")[0] || "Farm"} · ${name}`;
  $("#farmChip").classList.toggle("set", !profile.sample);
}
$("#farmChip").onclick = openFarm;
function openFarm() {
  pending = { lat: profile.lat, lon: profile.lon, place: profile.place, state: profile.state };
  $("#cropSel").innerHTML = config.crops.map((c) => `<option value="${c.id}">${esc(c.hi)} — ${esc(c.en)}</option>`).join("");
  $("#cropSel").value = profile.crop; $("#sowDate").value = profile.sowDate || ""; $("#area").value = profile.area || "";
  $("#pickedPlace").textContent = profile.sample ? t("tapMap") : `📍 ${profile.place}`;
  $("#farmDlg").showModal();
  setTimeout(() => {
    if (!window.L) return;
    if (!map) {
      map = L.map("map").setView([profile.lat, profile.lon], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
      map.on("click", (e) => pick(e.latlng.lat, e.latlng.lng));
    }
    map.invalidateSize();
    marker ??= L.marker([profile.lat, profile.lon]).addTo(map);
    marker.setLatLng([profile.lat, profile.lon]);
    map.setView([profile.lat, profile.lon], profile.sample ? 6 : 12);
  }, 50);
}
async function pick(lat, lon, label) {
  pending = { lat: +lat.toFixed(4), lon: +lon.toFixed(4), place: label || "", state: "" };
  marker?.setLatLng([lat, lon]); map?.setView([lat, lon], Math.max(map.getZoom(), 12));
  $("#pickedPlace").textContent = `📍 ${lat.toFixed(4)}, ${lon.toFixed(4)}…`;
  try { const r = await api(`/api/geo/reverse?lat=${lat}&lon=${lon}`); pending.place = r.label || label; pending.state = r.state; } catch { /* keep coords */ }
  $("#pickedPlace").textContent = `📍 ${pending.place || `${pending.lat}, ${pending.lon}`}`;
}
let searchT;
$("#placeSearch").oninput = (e) => {
  clearTimeout(searchT);
  const q = e.target.value.trim();
  if (q.length < 3) { $("#placeResults").innerHTML = ""; return; }
  searchT = setTimeout(async () => {
    const r = await api(`/api/geo/search?q=${encodeURIComponent(q)}`).catch(() => []);
    $("#placeResults").innerHTML = r.map((p, i) => `<button type="button" data-i="${i}">${esc(p.name)}, ${esc(p.district)} ${esc(p.state)}</button>`).join("");
    $("#placeResults").querySelectorAll("button").forEach((b) => b.onclick = () => { const p = r[b.dataset.i]; $("#placeResults").innerHTML = ""; pick(p.lat, p.lon, `${p.name}, ${p.state}`); });
  }, 300);
};
$("#gpsBtn").onclick = () => navigator.geolocation?.getCurrentPosition((p) => pick(p.coords.latitude, p.coords.longitude), (e) => toast(e.message), { enableHighAccuracy: true });
$("#farmForm").onsubmit = (e) => {
  if (e.submitter?.value !== "ok") return;
  Object.assign(profile, pending, { crop: $("#cropSel").value, sowDate: $("#sowDate").value || null, area: Number($("#area").value) || null, sample: false });
  store.set("ks.profile", profile);
  conversationId = null;
  updateFarmChip(); loadSnapshot();
  if (profile.subId) saveSubscription(store.get("ks.channels", {}));
};

// ---------------- Alert subscriptions + notifications ----------------
function updateSubBtn() { $("#subscribeBtn").textContent = profile.subId ? t("alertsOn") : t("enableAlerts"); }
$("#subscribeBtn").onclick = () => {
  if (profile.sample) { toast(t("setFarm")); return openFarm(); }
  const ch = store.get("ks.channels", {});
  $("#subPhone").value = ch.phone || ""; $("#subWa").checked = !!ch.whatsapp; $("#subTg").value = ch.telegramChatId || "";
  const c = config.channels || {};
  $("#channelInfo").textContent = `Server channels: SMS ${c.sms ? "✓" : "✗"} · WhatsApp ${c.whatsapp ? "✓" : "✗"} · Telegram ${c.telegram ? "✓" : "✗"} · Browser ✓`;
  $("#unsubBtn").hidden = !profile.subId;
  $("#subDlg").showModal();
};
$("#subForm").onsubmit = async (e) => {
  if (e.submitter?.id === "unsubBtn") {
    if (profile.subId) await api(`/api/subscriptions/${profile.subId}`, { method: "DELETE" }).catch(() => {});
    delete profile.subId; store.set("ks.profile", profile); updateSubBtn(); return;
  }
  if (e.submitter?.value !== "ok") return;
  const ch = { phone: $("#subPhone").value.trim() || null, whatsapp: $("#subWa").checked, telegramChatId: $("#subTg").value.trim() || null };
  store.set("ks.channels", ch);
  if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
  await saveSubscription(ch);
};
async function saveSubscription(ch) {
  try {
    const r = await api("/api/subscriptions", { method: "POST", body: JSON.stringify({ id: profile.subId, ...profile, ...ch }) });
    profile.subId = r.id; store.set("ks.profile", profile); updateSubBtn(); toast("✓");
  } catch (e) { toast(e.message); }
}
async function pollFeed() {
  if (!profile.subId) return;
  const since = store.get("ks.feedSince", null);
  const items = await api(`/api/subscriptions/${profile.subId}/feed${since ? `?since=${encodeURIComponent(since)}` : ""}`).catch(() => []);
  if (!items.length) return;
  store.set("ks.feedSince", items[0].at);
  if ("Notification" in window && Notification.permission === "granted") {
    for (const a of items.slice(0, 3)) new Notification(profile.lang === "hi" && a.title_hi ? a.title_hi : a.title, { body: `${a.message}\n${a.action}`, tag: a.id });
  }
}

// ---------------- Boot ----------------
$("#langSel").value = profile.lang;
$("#langSel").onchange = (e) => { profile.lang = e.target.value; store.set("ks.profile", profile); applyI18n(); conversationId = null; snapshot && render(); loadSchemes(); };
updateSpeak();
(async () => {
  config = await api("/api/config").catch(() => config);
  applyI18n();
  const notes = [];
  if (profile.sample) notes.push(t("sample"));
  if (!config.ai) notes.push(t("noAI"));
  if (notes.length) { $("#setupNotice").innerHTML = notes.map((n) => `<div>${n}</div>`).join(""); $("#setupNotice").classList.remove("hidden"); }
  loadSnapshot();
  loadSchemes();
  pollFeed(); setInterval(pollFeed, 5 * 60_000);
  setInterval(loadSnapshot, 30 * 60_000);
})();
