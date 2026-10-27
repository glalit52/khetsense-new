import express from "express";
import User from "../models/User.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All profile routes require auth
router.use(authenticate);

// GET /api/profile — get current user's profile
router.get("/", async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

// PUT /api/profile — update user profile & farm settings
router.put("/", async (req, res) => {
  try {
    const { name, phone, lang, farm, alertChannels } = req.body;
    const user = await User.findById(req.user._id);

    if (name?.trim()) user.name = name.trim();
    if (phone !== undefined) user.phone = phone;
    if (lang) user.lang = lang;
    if (alertChannels) {
      user.alertChannels = {
        phone: alertChannels.phone ?? user.alertChannels?.phone,
        whatsapp: alertChannels.whatsapp ?? user.alertChannels?.whatsapp,
        telegramChatId: alertChannels.telegramChatId ?? user.alertChannels?.telegramChatId,
      };
    }
    if (farm) {
      user.farm = {
        ...user.farm?.toObject?.() ?? {},
        ...farm,
      };
    }

    await user.save();
    res.json({ ok: true, user: user.toSafeObject() });
  } catch (e) {
    console.error("[profile/put]", e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/profile/farm — update only the farm settings
router.put("/farm", async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.farm = { ...user.farm?.toObject?.() ?? {}, ...req.body };
    await user.save();
    res.json({ ok: true, farm: user.farm });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/profile/password — change password
router.put("/password", async (req, res) => {
  try {
    const { current, next: nextPwd } = req.body;
    if (!current || !nextPwd) return res.status(400).json({ error: "Both current and new password are required." });
    if (nextPwd.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters." });

    const user = await User.findById(req.user._id);
    const ok = await user.comparePassword(current);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect." });

    user.password = nextPwd;
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/profile/analysis — save analysis result to history
router.post("/analysis", async (req, res) => {
  try {
    const { type, crop, place, summary, riskLevel, riskScore } = req.body;
    const user = await User.findById(req.user._id);
    user.analysisHistory.unshift({ type, crop, place, summary, riskLevel, riskScore });
    // Keep last 50 entries
    if (user.analysisHistory.length > 50) user.analysisHistory = user.analysisHistory.slice(0, 50);
    await user.save();
    res.json({ ok: true, entry: user.analysisHistory[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/profile/analysis — get analysis history
router.get("/analysis", async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("analysisHistory");
    res.json({ history: user.analysisHistory });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/profile/analysis/:id — delete a specific history entry
router.delete("/analysis/:id", async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.analysisHistory = user.analysisHistory.filter((h) => h._id.toString() !== req.params.id);
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
