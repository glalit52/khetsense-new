// Crop knowledge base for Indian field crops.
// Kc values: FAO-56 crop coefficients. GDD base temps and thresholds: standard agronomy references
// (ICAR / state agricultural university packages of practice). MSP values: GoI CACP announcements —
// always verify current season figures at https://cacp.dacnet.nic.in before quoting them as final.

export const CROPS = {
  wheat: {
    en: "Wheat", hi: "गेहूं", commodity: "Wheat", season: "rabi",
    sow: [10, 11, 12], harvest: [3, 4], duration: 135, gddBase: 0,
    stages: [
      { id: "initial", en: "Germination/CRI", days: [0, 25], kc: 0.4 },
      { id: "tillering", en: "Tillering", days: [25, 60], kc: 0.75 },
      { id: "jointing", en: "Jointing/Booting", days: [60, 90], kc: 1.15 },
      { id: "flowering", en: "Heading/Flowering", days: [90, 110], kc: 1.15 },
      { id: "grain", en: "Grain filling", days: [110, 135], kc: 0.4 },
    ],
    heatStress: 32, coldStress: 2, // °C — terminal heat above 32°C during grain filling cuts yield
    diseases: ["yellow_rust", "powdery_mildew", "aphid"],
    msp: { value: 2585, season: "Rabi 2026-27" },
  },
  rice: {
    en: "Paddy (Rice)", hi: "धान", commodity: "Paddy(Dhan)(Common)", season: "kharif",
    sow: [6, 7], harvest: [10, 11], duration: 130, gddBase: 10,
    stages: [
      { id: "initial", en: "Nursery/Transplant", days: [0, 30], kc: 1.05 },
      { id: "tillering", en: "Tillering", days: [30, 65], kc: 1.1 },
      { id: "flowering", en: "Panicle/Flowering", days: [65, 100], kc: 1.2 },
      { id: "grain", en: "Grain filling/Maturity", days: [100, 130], kc: 0.9 },
    ],
    heatStress: 35, coldStress: 15,
    diseases: ["rice_blast", "bacterial_blight", "brown_planthopper"],
    msp: { value: 2369, season: "Kharif 2025-26" },
  },
  cotton: {
    en: "Cotton", hi: "कपास", commodity: "Cotton", season: "kharif",
    sow: [4, 5, 6], harvest: [10, 11, 12], duration: 170, gddBase: 15.5,
    stages: [
      { id: "initial", en: "Emergence", days: [0, 30], kc: 0.35 },
      { id: "squaring", en: "Squaring", days: [30, 70], kc: 0.8 },
      { id: "flowering", en: "Flowering/Boll formation", days: [70, 130], kc: 1.15 },
      { id: "maturity", en: "Boll opening", days: [130, 170], kc: 0.7 },
    ],
    heatStress: 40, coldStress: 10,
    diseases: ["pink_bollworm", "whitefly", "cotton_leaf_curl"],
    msp: { value: 7710, season: "Kharif 2025-26 (medium staple)" },
  },
  mustard: {
    en: "Mustard", hi: "सरसों", commodity: "Mustard", season: "rabi",
    sow: [9, 10, 11], harvest: [2, 3], duration: 125, gddBase: 5,
    stages: [
      { id: "initial", en: "Emergence", days: [0, 25], kc: 0.35 },
      { id: "vegetative", en: "Rosette/Branching", days: [25, 55], kc: 0.8 },
      { id: "flowering", en: "Flowering", days: [55, 90], kc: 1.1 },
      { id: "pod", en: "Pod filling", days: [90, 125], kc: 0.4 },
    ],
    heatStress: 30, coldStress: 0,
    diseases: ["white_rust_alternaria", "aphid"],
    msp: { value: 6200, season: "Rabi 2026-27" },
  },
  soybean: {
    en: "Soybean", hi: "सोयाबीन", commodity: "Soyabean", season: "kharif",
    sow: [6, 7], harvest: [9, 10], duration: 105, gddBase: 10,
    stages: [
      { id: "initial", en: "Emergence", days: [0, 20], kc: 0.4 },
      { id: "vegetative", en: "Vegetative", days: [20, 45], kc: 0.8 },
      { id: "flowering", en: "Flowering/Pod", days: [45, 80], kc: 1.15 },
      { id: "maturity", en: "Maturity", days: [80, 105], kc: 0.5 },
    ],
    heatStress: 35, coldStress: 10,
    diseases: ["soybean_rust", "girdle_beetle"],
    msp: { value: 5328, season: "Kharif 2025-26" },
  },
  maize: {
    en: "Maize", hi: "मक्का", commodity: "Maize", season: "kharif/rabi",
    sow: [6, 7, 10, 11], harvest: [9, 10, 2, 3], duration: 110, gddBase: 10,
    stages: [
      { id: "initial", en: "Emergence", days: [0, 20], kc: 0.3 },
      { id: "vegetative", en: "Knee-high to tasseling", days: [20, 55], kc: 0.8 },
      { id: "flowering", en: "Tasseling/Silking", days: [55, 80], kc: 1.2 },
      { id: "grain", en: "Grain filling", days: [80, 110], kc: 0.6 },
    ],
    heatStress: 38, coldStress: 8,
    diseases: ["fall_armyworm", "turcicum_blight"],
    msp: { value: 2400, season: "Kharif 2025-26" },
  },
  chickpea: {
    en: "Chickpea (Gram)", hi: "चना", commodity: "Bengal Gram(Gram)(Whole)", season: "rabi",
    sow: [10, 11], harvest: [2, 3], duration: 120, gddBase: 5,
    stages: [
      { id: "initial", en: "Emergence", days: [0, 25], kc: 0.4 },
      { id: "vegetative", en: "Branching", days: [25, 60], kc: 0.7 },
      { id: "flowering", en: "Flowering/Pod", days: [60, 100], kc: 1.0 },
      { id: "maturity", en: "Maturity", days: [100, 120], kc: 0.35 },
    ],
    heatStress: 32, coldStress: 1,
    diseases: ["pod_borer", "botrytis_grey_mould"],
    msp: { value: 5875, season: "Rabi 2026-27" },
  },
  potato: {
    en: "Potato", hi: "आलू", commodity: "Potato", season: "rabi",
    sow: [10, 11], harvest: [1, 2, 3], duration: 100, gddBase: 7,
    stages: [
      { id: "initial", en: "Sprouting", days: [0, 25], kc: 0.5 },
      { id: "vegetative", en: "Vegetative", days: [25, 50], kc: 0.8 },
      { id: "tuber", en: "Tuber bulking", days: [50, 85], kc: 1.15 },
      { id: "maturity", en: "Maturity", days: [85, 100], kc: 0.75 },
    ],
    heatStress: 30, coldStress: 2,
    diseases: ["late_blight", "aphid"],
  },
  tomato: {
    en: "Tomato", hi: "टमाटर", commodity: "Tomato", season: "all",
    sow: [6, 7, 10, 11, 1, 2], harvest: [], duration: 120, gddBase: 10,
    stages: [
      { id: "initial", en: "Transplant/Establishment", days: [0, 25], kc: 0.6 },
      { id: "vegetative", en: "Vegetative", days: [25, 55], kc: 0.9 },
      { id: "flowering", en: "Flowering/Fruiting", days: [55, 100], kc: 1.15 },
      { id: "maturity", en: "Harvesting", days: [100, 120], kc: 0.8 },
    ],
    heatStress: 35, coldStress: 5,
    diseases: ["late_blight", "early_blight", "fruit_borer"],
  },
  onion: {
    en: "Onion", hi: "प्याज", commodity: "Onion", season: "rabi/kharif",
    sow: [10, 11, 12, 6, 7], harvest: [3, 4, 5, 10, 11], duration: 130, gddBase: 6,
    stages: [
      { id: "initial", en: "Establishment", days: [0, 20], kc: 0.7 },
      { id: "vegetative", en: "Vegetative", days: [20, 70], kc: 0.9 },
      { id: "bulb", en: "Bulb development", days: [70, 110], kc: 1.05 },
      { id: "maturity", en: "Maturity", days: [110, 130], kc: 0.75 },
    ],
    heatStress: 35, coldStress: 2,
    diseases: ["purple_blotch", "thrips"],
  },
  sugarcane: {
    en: "Sugarcane", hi: "गन्ना", commodity: "Sugarcane", season: "annual",
    sow: [2, 3, 10], harvest: [11, 12, 1, 2, 3], duration: 330, gddBase: 12,
    stages: [
      { id: "initial", en: "Germination", days: [0, 45], kc: 0.4 },
      { id: "tillering", en: "Tillering", days: [45, 120], kc: 0.9 },
      { id: "growth", en: "Grand growth", days: [120, 270], kc: 1.25 },
      { id: "maturity", en: "Ripening", days: [270, 330], kc: 0.75 },
    ],
    heatStress: 40, coldStress: 5,
    diseases: ["red_rot", "top_borer"],
    msp: { value: 355, season: "FRP 2025-26 (₹/qtl)" },
  },
  bajra: {
    en: "Pearl Millet (Bajra)", hi: "बाजरा", commodity: "Bajra(Pearl Millet/Cumbu)", season: "kharif",
    sow: [6, 7], harvest: [9, 10], duration: 85, gddBase: 10,
    stages: [
      { id: "initial", en: "Emergence", days: [0, 15], kc: 0.35 },
      { id: "vegetative", en: "Tillering", days: [15, 40], kc: 0.7 },
      { id: "flowering", en: "Flowering", days: [40, 65], kc: 1.0 },
      { id: "grain", en: "Grain filling", days: [65, 85], kc: 0.3 },
    ],
    heatStress: 42, coldStress: 10,
    diseases: ["downy_mildew_bajra"],
    msp: { value: 2775, season: "Kharif 2025-26" },
  },
  groundnut: {
    en: "Groundnut", hi: "मूंगफली", commodity: "Groundnut", season: "kharif",
    sow: [6, 7], harvest: [10, 11], duration: 120, gddBase: 10,
    stages: [
      { id: "initial", en: "Emergence", days: [0, 25], kc: 0.4 },
      { id: "vegetative", en: "Pegging", days: [25, 60], kc: 0.8 },
      { id: "pod", en: "Pod development", days: [60, 100], kc: 1.15 },
      { id: "maturity", en: "Maturity", days: [100, 120], kc: 0.6 },
    ],
    heatStress: 38, coldStress: 12,
    diseases: ["tikka_leaf_spot"],
    msp: { value: 7263, season: "Kharif 2025-26" },
  },
};

// Weather-driven disease / pest risk models. Each rule inspects hourly forecast rows and
// returns a 0–100 risk score. These are simplified versions of published infection-period models
// (e.g. Hutton criteria for late blight) — they flag conditions, not confirmed infections.
export const DISEASE_MODELS = {
  late_blight: { en: "Late blight", hi: "पछेती झुलसा", kind: "fungal",
    test: (h) => h.t >= 10 && h.t <= 25 && h.rh >= 90, hoursForHigh: 11,
    action: "Spray mancozeb 75 WP @ 2.5 g/L preventively; switch to cymoxanil+mancozeb if symptoms appear. Avoid evening irrigation." },
  early_blight: { en: "Early blight", hi: "अगेती झुलसा", kind: "fungal",
    test: (h) => h.t >= 20 && h.t <= 30 && (h.rh >= 85 || h.lw >= 60), hoursForHigh: 10,
    action: "Remove lower infected leaves; spray chlorothalonil or mancozeb @ 2 g/L." },
  yellow_rust: { en: "Wheat yellow (stripe) rust", hi: "पीला रतुआ", kind: "fungal",
    test: (h) => h.t >= 8 && h.t <= 18 && (h.rh >= 85 || h.lw >= 60), hoursForHigh: 8,
    action: "Scout for yellow stripes on leaves. On first sight spray propiconazole 25 EC @ 1 ml/L (200 ml/acre)." },
  powdery_mildew: { en: "Powdery mildew", hi: "चूर्णिल आसिता", kind: "fungal",
    test: (h) => h.t >= 15 && h.t <= 27 && h.rh >= 50 && h.rh <= 85 && h.p === 0, hoursForHigh: 30,
    action: "Spray wettable sulphur 80 WP @ 2.5 g/L or hexaconazole @ 1 ml/L." },
  rice_blast: { en: "Rice blast", hi: "झोंका रोग", kind: "fungal",
    test: (h) => h.t >= 20 && h.t <= 28 && h.rh >= 90, hoursForHigh: 12,
    action: "Avoid excess nitrogen. Spray tricyclazole 75 WP @ 0.6 g/L at first lesions." },
  bacterial_blight: { en: "Bacterial leaf blight", hi: "जीवाणु पत्ती झुलसा", kind: "bacterial",
    test: (h) => h.t >= 25 && h.t <= 34 && h.rh >= 80 && h.gust >= 25, hoursForHigh: 10,
    action: "Drain field, stop nitrogen top-dressing; spray streptocycline 0.15 g + copper oxychloride 2.5 g/L." },
  white_rust_alternaria: { en: "White rust / Alternaria blight", hi: "सफेद रतुआ / झुलसा", kind: "fungal",
    test: (h) => h.t >= 10 && h.t <= 20 && (h.rh >= 90 || h.lw >= 70), hoursForHigh: 10,
    action: "Spray mancozeb 75 WP @ 2 g/L; repeat after 15 days if humid weather continues." },
  soybean_rust: { en: "Soybean rust", hi: "सोयाबीन गेरुआ", kind: "fungal",
    test: (h) => h.t >= 18 && h.t <= 28 && (h.rh >= 90 || h.lw >= 70), hoursForHigh: 10,
    action: "Spray hexaconazole 5 EC @ 1 ml/L or propiconazole at first pustules." },
  turcicum_blight: { en: "Turcicum leaf blight", hi: "पत्ती झुलसा", kind: "fungal",
    test: (h) => h.t >= 18 && h.t <= 27 && h.rh >= 90, hoursForHigh: 10,
    action: "Spray mancozeb 75 WP @ 2.5 g/L." },
  botrytis_grey_mould: { en: "Botrytis grey mould", hi: "धूसर फफूंद", kind: "fungal",
    test: (h) => h.t >= 15 && h.t <= 25 && h.rh >= 95, hoursForHigh: 10,
    action: "Improve aeration, avoid dense canopy; spray carbendazim + mancozeb @ 2 g/L." },
  purple_blotch: { en: "Purple blotch", hi: "बैंगनी धब्बा", kind: "fungal",
    test: (h) => h.t >= 20 && h.t <= 30 && h.rh >= 80, hoursForHigh: 12,
    action: "Spray mancozeb @ 2.5 g/L with sticker; repeat at 10–15 day interval." },
  tikka_leaf_spot: { en: "Tikka leaf spot", hi: "टिक्का रोग", kind: "fungal",
    test: (h) => h.t >= 25 && h.t <= 30 && h.rh >= 85, hoursForHigh: 12,
    action: "Spray carbendazim 0.1% or chlorothalonil 0.2%." },
  red_rot: { en: "Red rot", hi: "लाल सड़न", kind: "fungal",
    test: (h) => h.t >= 25 && h.t <= 32 && h.rh >= 90 && h.p > 0, hoursForHigh: 12,
    action: "Uproot and burn affected clumps; use resistant varieties and sett treatment." },
  downy_mildew_bajra: { en: "Downy mildew (green ear)", hi: "हरित बाली रोग", kind: "fungal",
    test: (h) => h.t >= 20 && h.t <= 30 && h.rh >= 90, hoursForHigh: 10,
    action: "Rogue infected plants; spray metalaxyl-M + mancozeb @ 2.5 g/L." },
  // Insect pests: favoured by warm, humid, low-rain spells.
  aphid: { en: "Aphids", hi: "माहू / चेपा", kind: "pest",
    test: (h) => h.t >= 15 && h.t <= 25 && h.rh >= 60 && h.rh <= 85 && h.p === 0, hoursForHigh: 40,
    action: "Check 10 plants; if >20 aphids/plant spray imidacloprid 17.8 SL @ 0.3 ml/L or neem oil 5 ml/L." },
  pink_bollworm: { en: "Pink bollworm", hi: "गुलाबी सुंडी", kind: "pest",
    test: (h) => h.t >= 25 && h.t <= 35 && h.rh >= 60, hoursForHigh: 40,
    action: "Install pheromone traps (5/acre). If >8 moths/trap/night for 3 nights, spray profenofos 50 EC @ 2 ml/L." },
  whitefly: { en: "Whitefly", hi: "सफेद मक्खी", kind: "pest",
    test: (h) => h.t >= 28 && h.t <= 36 && h.rh >= 50 && h.rh <= 80 && h.p === 0, hoursForHigh: 40,
    action: "Use yellow sticky traps; spray neem oil 1500 ppm @ 5 ml/L, then flonicamid if above ETL." },
  cotton_leaf_curl: { en: "Cotton leaf curl virus (via whitefly)", hi: "पत्ती मरोड़ रोग", kind: "viral",
    test: (h) => h.t >= 28 && h.t <= 36 && h.rh >= 50 && h.p === 0, hoursForHigh: 50,
    action: "Control whitefly vector; uproot infected plants early." },
  brown_planthopper: { en: "Brown planthopper", hi: "भूरा फुदका", kind: "pest",
    test: (h) => h.t >= 25 && h.t <= 30 && h.rh >= 80, hoursForHigh: 30,
    action: "Drain field for 3–4 days; spray pymetrozine 50 WG @ 0.6 g/L at base of plants." },
  fall_armyworm: { en: "Fall armyworm", hi: "फॉल आर्मीवर्म", kind: "pest",
    test: (h) => h.t >= 22 && h.t <= 32 && h.rh >= 60, hoursForHigh: 40,
    action: "Check whorls for frass; spray emamectin benzoate 5 SG @ 0.4 g/L into whorl." },
  girdle_beetle: { en: "Girdle beetle", hi: "चक्र भृंग", kind: "pest",
    test: (h) => h.t >= 25 && h.t <= 32 && h.rh >= 75, hoursForHigh: 40,
    action: "Remove girdled plants; spray thiacloprid 21.7 SC @ 0.75 ml/L." },
  pod_borer: { en: "Pod borer (Helicoverpa)", hi: "फली छेदक", kind: "pest",
    test: (h) => h.t >= 20 && h.t <= 30 && h.rh >= 50, hoursForHigh: 50,
    action: "Install pheromone traps & bird perches; spray NPV 250 LE/ha or emamectin benzoate @ 0.4 g/L." },
  fruit_borer: { en: "Fruit borer", hi: "फल छेदक", kind: "pest",
    test: (h) => h.t >= 22 && h.t <= 32, hoursForHigh: 60,
    action: "Pick and destroy bored fruits; pheromone traps; spray spinosad @ 0.3 ml/L." },
  thrips: { en: "Thrips", hi: "थ्रिप्स", kind: "pest",
    test: (h) => h.t >= 25 && h.t <= 35 && h.rh <= 70 && h.p === 0, hoursForHigh: 40,
    action: "Blue sticky traps; spray fipronil 5 SC @ 1.5 ml/L with sticker." },
  top_borer: { en: "Top borer", hi: "चोटी बेधक", kind: "pest",
    test: (h) => h.t >= 25 && h.t <= 35 && h.rh >= 60, hoursForHigh: 50,
    action: "Release Trichogramma; apply chlorantraniliprole 0.4 G @ 7.5 kg/acre." },
};

export function cropStage(crop, sowDate) {
  const c = CROPS[crop];
  if (!c || !sowDate) return null;
  const das = Math.floor((Date.now() - new Date(sowDate).getTime()) / 86400000);
  if (!Number.isFinite(das)) return null;
  if (das < 0) return { planned: true, days_to_sowing: -das, id: "pre_sowing", en: "Pre-sowing", kc: 0, das, harvest_in_days: c.duration - das };
  const stage = c.stages.find((s) => das >= s.days[0] && das < s.days[1]) || c.stages[c.stages.length - 1];
  return { das, ...stage, harvest_in_days: Math.max(0, c.duration - das) };
}

export function cropList() {
  return Object.entries(CROPS).map(([id, c]) => ({ id, en: c.en, hi: c.hi, season: c.season, msp: c.msp || null }));
}
