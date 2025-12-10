// api/auth.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import crypto from "crypto";
import nodemailer from "nodemailer";

import User from "../models/User.js";
import { connectToDatabase } from "../lib/mongodb.js";

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // seconds

// Email config (set in environment)
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;
const FRONTEND_BASE =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  "http://localhost:5173";

if (!JWT_SECRET) {
  console.warn("JWT_SECRET not set — tokens will not be valid.");
}

if (!JWT_SECRET) {
  console.warn("JWT_SECRET not set — tokens will not be valid.");
}

/* helper to set cookie */
function setTokenCookie(res, token) {
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

/* Nodemailer transport helper — change to your provider if needed */
function createTransport() {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn(
      "SMTP not fully configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in env."
    );
    return null;
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

/* send verification link to user */
async function sendVerificationEmail({ to, token, name }) {
  const transport = createTransport();
  if (!transport) {
    console.warn(
      "Skipping sending verification email because transport is not configured."
    );
    return;
  }

  // Build verification link pointing to frontend verify page
  const verifyUrl = FRONTEND_BASE
    ? `${FRONTEND_BASE.replace(
        /\/+$/,
        ""
      )}/verify-email?token=${encodeURIComponent(token)}`
    : `/verify-email?token=${encodeURIComponent(token)}`;

  const displayName = name || to;

  const mail = {
    from: FROM_EMAIL,
    to,
    subject: "Verify your email",
    text:
      `Hello ${displayName},\n\n` +
      `Please verify your email by clicking the link below:\n\n` +
      `${verifyUrl}\n\n` +
      `If you did not sign up, you can ignore this message.\n\n` +
      `Thanks,\n` +
      `The Team`,
    html:
      `<p>Hello ${displayName},</p>` +
      `<p>Please verify your email by clicking the link below:</p>` +
      `<p><a href="${verifyUrl}">Verify email</a></p>` +
      `<p>If you did not sign up, you can ignore this message.</p>` +
      `<p>Thanks,<br/>The Team</p>`,
  };

  await transport.sendMail(mail);
}

/* parse user cookie to return basic user object */
function getUserFromReq(req) {
  const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  await connectToDatabase();
  const { method } = req;
  const action = String(req.query.action || "");

  try {
    // ---------------------------
    // SIGNUP: create user but DO NOT sign in until verified
    // ---------------------------
    // SIGNUP: do NOT create a DB user yet — create a signed verification token instead
    if (method === "POST" && action === "signup") {
      const { email, password, name } = req.body || {};
      if (!email || !password || !name) {
        return res
          .status(400)
          .json({ error: "Name, email and password required" });
      }

      const lowerEmail = String(email).toLowerCase();

      // quick duplicate check
      const existing = await User.findOne({ email: lowerEmail });
      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Hash the password now (we will store the hash only when user verifies)
      const passwordHash = await bcrypt.hash(password, 10);

      // Build a signed verification token (contains email, name, passwordHash).
      // The token is short-lived so it can't be reused later.
      const verificationPayload = {
        email: lowerEmail,
        name: String(name).trim(),
        passwordHash,
      };

      // TTL: 24h
      const verificationToken = jwt.sign(verificationPayload, JWT_SECRET, {
        expiresIn: "24h",
      });

      // Attempt to send verification email BEFORE creating any DB record
      try {
        await sendVerificationEmail({
          to: lowerEmail,
          token: verificationToken,
          name: verificationPayload.name,
        });
      } catch (err) {
        console.error(
          "Failed to send verification email (no user created):",
          err
        );
        return res
          .status(500)
          .json({ error: "Failed to send verification email" });
      }

      // Email sent successfully — tell client to check inbox
      return res.json({
        ok: true,
        message:
          "Signup initiated. Check your email and click the verification link to complete registration.",
      });
    }

    // ---------------------------
    // EMAIL VERIFICATION endpoint
    // GET /api/auth?action=verifyEmail&token=...
    // (used by frontend /verify-email page)
    // ---------------------------
    // VERIFY: token contains email, name, passwordHash — create user now
    if (method === "GET" && action === "verifyEmail") {
      const token = String(req.query.token || "");
      if (!token) return res.status(400).json({ error: "Token required" });

      let payload;
      try {
        // Verify the signed verification token
        payload = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        // invalid or expired
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      const {
        email: tokenEmail,
        name: tokenName,
        passwordHash,
      } = payload || {};
      if (!tokenEmail || !passwordHash) {
        return res.status(400).json({ error: "Invalid token payload" });
      }

      const lowerEmail = String(tokenEmail).toLowerCase();

      // Re-check for an existing user (race condition: another actor may have created this email)
      const existing = await User.findOne({ email: lowerEmail });
      if (existing) {
        // If user already exists and is verified, just sign them in.
        if (existing.isVerified) {
          const jwtToken = jwt.sign(
            {
              sub: existing._id.toString(),
              email: existing.email,
              name: existing.name,
            },
            JWT_SECRET,
            { expiresIn: "7d" }
          );
          setTokenCookie(res, jwtToken);
          return res.json({
            ok: true,
            user: {
              id: existing._id.toString(),
              email: existing.email,
              name: existing.name,
            },
          });
        }

        // If a non-verified user exists (unlikely in this flow), mark verified
        existing.isVerified = true;
        await existing.save();

        const jwtToken = jwt.sign(
          {
            sub: existing._id.toString(),
            email: existing.email,
            name: existing.name,
          },
          JWT_SECRET,
          { expiresIn: "7d" }
        );
        setTokenCookie(res, jwtToken);
        return res.json({
          ok: true,
          user: {
            id: existing._id.toString(),
            email: existing.email,
            name: existing.name,
          },
        });
      }

      // Create the user now that token is valid and email was proven
      try {
        const user = await User.create({
          name: tokenName || "",
          email: lowerEmail,
          passwordHash,
          isVerified: true,
          // verificationToken fields not used because we did not create user before
          verificationToken: null,
          verificationExpires: null,
          createdAt: new Date(),
        });

        const jwtToken = jwt.sign(
          { sub: user._id.toString(), email: user.email, name: user.name },
          JWT_SECRET,
          { expiresIn: "7d" }
        );
        setTokenCookie(res, jwtToken);

        return res.json({
          ok: true,
          user: { id: user._id.toString(), email: user.email, name: user.name },
        });
      } catch (err) {
        console.error("Failed to create user during verification:", err);
        // Duplicate error if race at create time
        if (
          err &&
          (err.code === 11000 || (err.keyPattern && err.keyPattern.email))
        ) {
          return res.status(409).json({ error: "Email already registered" });
        }
        return res.status(500).json({ error: "Failed to create user" });
      }
    }

    // ---------------------------
    // LOGIN: block if not verified
    // ---------------------------
    if (method === "POST" && action === "login") {
      const { email, password } = req.body || {};
      if (!email || !password)
        return res.status(400).json({ error: "Email and password required" });

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      if (!user.isVerified) {
        return res
          .status(403)
          .json({ error: "Email not verified. Please check your inbox." });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        { sub: user._id.toString(), email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      setTokenCookie(res, token);
      return res.json({
        user: { id: user._id.toString(), email: user.email, name: user.name },
      });
    }

    // ---------------------------
    // ME: return user info (including isVerified)
    // ---------------------------
    if (method === "GET" && action === "me") {
      const cookies = req.headers.cookie
        ? cookie.parse(req.headers.cookie)
        : {};
      const token = cookies[COOKIE_NAME];
      if (!token) return res.status(200).json({ user: null });
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        // Add isVerified by reading DB (optional)
        const dbUser = await User.findById(payload.sub).lean();
        return res.json({
          user: dbUser
            ? {
                id: String(dbUser._id),
                email: dbUser.email,
                name: dbUser.name,
                isVerified: !!dbUser.isVerified,
              }
            : null,
        });
      } catch (e) {
        clearTokenCookie(res);
        return res.status(200).json({ user: null });
      }
    }

    // ---------------------------
    // LOGOUT
    // ---------------------------
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
