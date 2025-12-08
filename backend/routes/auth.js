// api/auth.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import User from "../models/User.js";
import { connectToDatabase } from "../lib/mongodb.js";

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // seconds

function setTokenCookie(res, token) {
  // Vercel serverless response uses standard node res
  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    })
  );
}

function clearTokenCookie(res) {
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(0),
      path: "/",
    })
  );
}

// Export default for Vercel (handler)
export default async function handler(req, res) {
  await connectToDatabase();
  const { method } = req;
  // route by method + path (query.action optional)
  const action = req.query.action || "";

  try {
    if (method === "POST" && action === "signup") {
      const { email, password } = req.body || {};
      if (!email || !password)
        return res.status(400).json({ error: "Email and password required" });
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing)
        return res.status(409).json({ error: "Email already registered" });
      const hash = await bcrypt.hash(password, 10);
      const user = await User.create({
        email: email.toLowerCase(),
        passwordHash: hash,
      });
      const token = jwt.sign(
        { sub: user._id.toString(), email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      setTokenCookie(res, token);
      return res.json({ user: { id: user._id.toString(), email: user.email } });
    }

    if (method === "POST" && action === "login") {
      const { email, password } = req.body || {};
      if (!email || !password)
        return res.status(400).json({ error: "Email and password required" });
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });
      const token = jwt.sign(
        { sub: user._id.toString(), email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      setTokenCookie(res, token);
      return res.json({ user: { id: user._id.toString(), email: user.email } });
    }

    if (method === "GET" && action === "me") {
      const cookies = req.headers.cookie
        ? cookie.parse(req.headers.cookie)
        : {};
      const token = cookies[COOKIE_NAME];
      if (!token) return res.status(200).json({ user: null });
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        return res.json({ user: { id: payload.sub, email: payload.email } });
      } catch (e) {
        clearTokenCookie(res);
        return res.status(200).json({ user: null });
      }
    }

    if (method === "POST" && action === "logout") {
      clearTokenCookie(res);
      return res.json({ ok: true });
    }

    res.status(404).json({ error: "Not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
