# KhetiSense — AI farm advisor for Indian farmers

An improved take on the voice + crop-scan + weather advisory model: more live data sources, a
rule-based alert engine that runs without AI, and a Claude agent that reasons over all of it.

## Run

```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY (and optional keys)
npm start                # http://localhost:3000
```

Without `ANTHROPIC_API_KEY` the dashboard, alerts, predictions, mandi prices and notifications all
work; the assistant, crop scan and AI brief turn on once the key is set.

For end-to-end production deployment on Render, Fly.io, Railway, Docker, or Ubuntu VPS (PM2/Nginx/SSL), see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Live data integrations

| # | Source | What it gives | Key |
|---|---|---|---|
| 1 | Open-Meteo Forecast | 10-day hourly weather, gusts, CAPE, VPD, leaf wetness, ET₀, soil moisture at 3 depths, soil temp | none |
| 2 | Open-Meteo Air Quality (CAMS) | PM2.5, PM10, ozone, dust, AQI | none |
| 3 | GloFAS (Open-Meteo Flood) | River discharge forecast vs. median → flood risk | none |
| 4 | ISRIC SoilGrids 250 m | pH, organic carbon, nitrogen, clay/sand/silt, CEC, bulk density | none |
| 5 | NASA POWER | 30-year monthly climate normals → anomaly alerts | none |
| 6 | NASA MODIS MOD13Q1 (ORNL DAAC) | 250 m NDVI time series → crop-vigour alerts | none |
| 7 | NASA FIRMS VIIRS | Active fires within 55 km (stubble burning) | free MAP_KEY |
| 8 | Agmarknet via data.gov.in | Daily mandi min/max/modal prices across markets | sample key built in; free personal key recommended |
| 9 | OpenStreetMap Nominatim + Open-Meteo Geocoding | Village search, reverse geocoding | none |
| 10 | Claude web search | Real-time IMD warnings, pest outbreaks, scheme deadlines (agent only) | Anthropic key |

Built-in datasets: 13 crops with FAO-56 Kc by growth stage, stress thresholds, GDD bases and MSP;
25 weather-driven disease/pest risk models with control measures; central schemes and helplines.
Each mandi fetch is appended to `data/price-history.jsonl`, building a local price-trend dataset.

## Alerts (rule engine — `src/engine/alerts.js`)

Heavy/very heavy rain (IMD thresholds), rain at harvest, heatwave & crop-specific heat stress by stage,
frost / cold injury, damaging wind, hail & lightning, monsoon dry spell, climate anomaly vs. 30-yr normal,
fungal/bacterial/pest risk (72 h infection-period models), spray windows, irrigation need (FAO-56 water
balance + root-zone soil moisture), river flood, air quality & ozone injury, nearby residue fires,
satellite NDVI drop, price below MSP, best-market spread, price trend.

Subscribed farms are re-checked every `ALERT_INTERVAL_MIN` minutes; new critical/warning alerts go to
browser notifications, Telegram, Twilio SMS/WhatsApp, or a generic webhook.

## AI (Claude Opus 5.5 — `src/agent/claude.js`)

- **Agent chat** (`POST /api/chat`, SSE): tool-use loop over `get_farm_snapshot`, `get_mandi_prices`,
  `search_place`, `get_crop_knowledge`, `get_schemes_and_helplines` + live web search. Replies in 11
  Indian languages; voice in/out via the browser Web Speech API.
- **Crop scan** (`POST /api/scan`): vision diagnosis with structured output (problem, confidence,
  organic + chemical treatment with doses, prevention, safety, weather-aware timing).
- **AI farm brief** (`POST /api/brief`): agentic predictions over the full snapshot → headline,
  dated predictions with confidence and basis, 7-day plan, sell/hold call.

The server-side refusal fallback (`fallbacks: "default"`) is enabled on the agent chat.

## API

`GET /api/snapshot?lat&lon&crop&sow` · `GET /api/mandi?crop&state&district` · `GET /api/geo/search?q` ·
`GET /api/schemes` · `POST /api/chat` · `POST /api/scan` · `POST /api/brief` · `POST /api/subscriptions` ·
`GET /api/subscriptions/:id/feed`

Disease and pest scores flag favourable weather, not confirmed infection — always scout the field.
MSP values in `src/data/crops.js` should be updated each season from cacp.dacnet.nic.in.
