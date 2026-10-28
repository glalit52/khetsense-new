import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "khetisense-secret-change-in-prod-2024";
const JWT_EXPIRES = "30d";

export function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function setAuthCookie(res, token) {
  res.cookie("ks_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

export function clearAuthCookie(res) {
  res.clearCookie("ks_token");
}

export async function authenticate(req, res, next) {
  try {
    const token =
      req.cookies?.ks_token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null);
    if (!token) {
      return res.status(401).json({ error: "Not authenticated. Please log in." });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ error: "User not found." });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }
}

// Optional auth — does not block, attaches user if token present
export async function optionalAuth(req, res, next) {
  try {
    const token =
      req.cookies?.ks_token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null);
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (user) req.user = user;
    }
  } catch { /* ignore */ }
  next();
}

// Middleware to protect HTML pages (mandatory login — redirects to /login)
export function requirePageAuth(req, res, next) {
  const token =
    req.cookies?.ks_token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    const redirectUrl =
      req.originalUrl && req.originalUrl !== "/" && !req.originalUrl.startsWith("/login")
        ? `?redirect=${encodeURIComponent(req.originalUrl)}`
        : "";
    return res.redirect(`/login${redirectUrl}`);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.clearCookie("ks_token");
    const redirectUrl =
      req.originalUrl && req.originalUrl !== "/" && !req.originalUrl.startsWith("/login")
        ? `?redirect=${encodeURIComponent(req.originalUrl)}`
        : "";
    return res.redirect(`/login${redirectUrl}`);
  }
}

// Middleware for /login and /signup pages: if already logged in, redirect to /
export function redirectIfLoggedIn(req, res, next) {
  const token =
    req.cookies?.ks_token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);

  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect("/");
    } catch {
      res.clearCookie("ks_token");
    }
  }
  next();
}
