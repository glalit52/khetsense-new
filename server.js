import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { buildSnapshot } from "./src/engine/snapshot.js";
import { searchPlace, reverseGeocode } from "./src/services/sources.js";
import {
  getMandiPrices,
  summarisePrices,
  priceHistory,
} from "./src/services/mandi.js";
import { CROPS, cropList } from "./src/data/crops.js";
import { SCHEMES, HELPLINES } from "./src/data/schemes.js";
import {
  aiEnabled,
  chatTurn,
  diagnoseImage,
  farmBrief,
} from "./src/agent/claude.js";
import {
  upsertSubscription,
  deleteSubscription,
  feed,
  startWatcher,
  stopWatcher,
  channelsConfigured,
} from "./src/notify.js";
import { parseLatLon } from "./src/util.js";
import authRouter from "./src/routes/auth.js";
import profileRouter from "./src/routes/profile.js";
import {
  authenticate,
  optionalAuth,
  requirePageAuth,
  redirectIfLoggedIn,
} from "./src/middleware/auth.js";

// Minimal .env loader (no dependency).
const here = path.dirname(fileURLToPath(import.meta.url));
try {
  for (const line of fs
    .readFileSync(path.join(here, ".env"), "utf8")
    .split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env */
}

// Ensure data directory exists for persistent storage
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(here, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Connect to MongoDB
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/khetisense";
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("[mongo] Connected to MongoDB"))
  .catch((e) =>
    console.warn(
      "[mongo] MongoDB connection failed:",
      e.message,
      "— auth features will be unavailable.",
    ),
  );

const app = express();
app.set("trust proxy", 1);

// Standard security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use(express.static(path.join(here, "public"), { index: false }));

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (e) {
    console.error(e);
    res.status(e.status || 400).json({ error: e.message });
  }
};
const requireAI = () => {
  if (!aiEnabled()) {
    const e = new Error("AI is not configured: set ANTHROPIC_API_KEY in .env");
    e.status = 503;
    throw e;
  }
};

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
function parseImage(img) {
  if (!img) return null;
  if (!IMAGE_TYPES.has(img.mediaType) || typeof img.data !== "string")
    throw new Error("Unsupported image");
  if (img.data.length > 10_000_000)
    throw new Error("Image too large (max ~7 MB)");
  return { mediaType: img.mediaType, data: img.data };
}

// ------------ Auth & Profile routes ------------
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);

// Health check endpoint for uptime monitors, containers, and load balancers
const healthHandler = (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    ai: aiEnabled(),
    channels: channelsConfigured(),
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
};
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

app.get(
  "/api/config",
  wrap(() => ({
    ai: aiEnabled(),
    crops: cropList(),
    channels: channelsConfigured(),
    mandi_key: Boolean(process.env.DATA_GOV_IN_API_KEY),
    firms_key: Boolean(process.env.NASA_FIRMS_MAP_KEY),
  })),
);

app.get(
  "/api/geo/search",
  wrap((req) => searchPlace(String(req.query.q || ""))),
);
app.get(
  "/api/geo/reverse",
  wrap((req) => {
    const { lat, lon } = parseLatLon(req.query);
    return reverseGeocode(lat, lon);
  }),
);

app.get(
  "/api/snapshot",
  optionalAuth,
  wrap((req) => {
    const { lat, lon } = parseLatLon(req.query);
    const crop = CROPS[req.query.crop] ? req.query.crop : "wheat";
    return buildSnapshot({ lat, lon, crop, sowDate: req.query.sow || null });
  }),
);

app.get(
  "/api/mandi",
  wrap(async (req) => {
    const crop = CROPS[req.query.crop];
    const commodity = crop ? crop.commodity : req.query.commodity;
    const d = await getMandiPrices({
      state: req.query.state,
      district: req.query.district,
      commodity,
      limit: 100,
    });
    return {
      ...d,
      commodity,
      summary: summarisePrices(d.records, crop?.msp?.value),
      history: priceHistory(commodity, req.query.state),
    };
  }),
);

app.get(
  "/api/schemes",
  wrap(() => ({ schemes: SCHEMES, helplines: HELPLINES })),
);

// --- AI ---
app.post("/api/chat", async (req, res) => {
  if (!aiEnabled())
    return res
      .status(503)
      .json({ error: "AI is not configured: set ANTHROPIC_API_KEY in .env" });
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const emit = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const { conversationId, text, image, profile = {} } = req.body;
    if (!text?.trim() && !image) throw new Error("Empty message");
    await chatTurn(
      {
        conversationId,
        text: text || "Please look at this photo.",
        image: parseImage(image),
        profile,
      },
      emit,
    );
  } catch (e) {
    console.error(e);
    emit("error", { error: e.message });
  }
  res.end();
});

app.post(
  "/api/scan",
  wrap(async (req) => {
    requireAI();
    return diagnoseImage({
      image: parseImage(req.body.image),
      profile: req.body.profile || {},
      note: req.body.note,
    });
  }),
);
app.post(
  "/api/brief",
  wrap(async (req) => {
    requireAI();
    const p = req.body.profile || {};
    parseLatLon(p);
    return farmBrief({ profile: p });
  }),
);

// --- Alert subscriptions ---
app.post(
  "/api/subscriptions",
  wrap((req) => {
    parseLatLon(req.body);
    return upsertSubscription(req.body);
  }),
);
app.delete(
  "/api/subscriptions/:id",
  wrap((req) => {
    deleteSubscription(req.params.id);
    return { ok: true };
  }),
);
app.get(
  "/api/subscriptions/:id/feed",
  wrap((req) => feed(req.params.id, req.query.since) ?? []),
);

// --- Public Auth Web Pages ---
app.get("/login", redirectIfLoggedIn, (_req, res) =>
  res.sendFile(path.join(here, "public", "login.html")),
);
app.get("/signup", redirectIfLoggedIn, (_req, res) =>
  res.sendFile(path.join(here, "public", "login.html")),
);

// --- Protected App Pages (Mandatory Login) ---
app.get("/", requirePageAuth, (_req, res) =>
  res.sendFile(path.join(here, "public", "index.html")),
);
app.get("/index.html", requirePageAuth, (_req, res) =>
  res.sendFile(path.join(here, "public", "index.html")),
);
app.get("/profile", requirePageAuth, (_req, res) =>
  res.sendFile(path.join(here, "public", "profile.html")),
);
app.get("/profile.html", requirePageAuth, (_req, res) =>
  res.sendFile(path.join(here, "public", "profile.html")),
);
app.get("/analysis", requirePageAuth, (_req, res) =>
  res.sendFile(path.join(here, "public", "analysis.html")),
);
app.get("/analysis.html", requirePageAuth, (_req, res) =>
  res.sendFile(path.join(here, "public", "analysis.html")),
);

// --- SPA fallback — serve index.html for unknown routes if authenticated ---
app.get(/^\/(?!api|health).*/, requirePageAuth, (_req, res) => {
  res.sendFile(path.join(here, "public", "index.html"));
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(
    `KhetiSense running on http://${HOST}:${PORT}  (AI ${aiEnabled() ? "enabled" : "disabled — set ANTHROPIC_API_KEY"})`,
  );
  startWatcher();
});

// Graceful shutdown handling for container orchestrators (SIGTERM) and terminal (SIGINT)
const shutdown = (signal) => {
  console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);
  stopWatcher();
  mongoose.connection.close();
  server.close(() => {
    console.log("[server] HTTP server closed. Clean exit.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("[server] Forced exit after timeout.");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
