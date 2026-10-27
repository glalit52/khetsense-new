import express from "express";
import User from "../models/User.js";
import { signToken, setAuthCookie, clearAuthCookie, authenticate } from "../middleware/auth.js";

const router = express.Router();

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, phone, lang } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required." });
    if (!email?.trim()) return res.status(400).json({ error: "Email is required." });
    if (!password || password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters." });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "An account with this email already exists." });

    const user = await User.create({ name: name.trim(), email: email.trim(), password, phone: phone || "", lang: lang || "hi" });
    const token = signToken(user._id);
    setAuthCookie(res, token);
    res.status(201).json({ ok: true, token, user: user.toSafeObject() });
  } catch (e) {
    console.error("[auth/signup]", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: "Invalid email or password." });

    const token = signToken(user._id);
    setAuthCookie(res, token);
    res.json({ ok: true, token, user: user.toSafeObject() });
  } catch (e) {
    console.error("[auth/login]", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me — returns current user
router.get("/me", authenticate, (req, res) => {
  res.json({ ok: true, user: req.user.toSafeObject() });
});

export default router;
