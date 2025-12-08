// api/words.js
import dotenv from "dotenv";
import path from "path";

// load backend/.env reliably when running from repo root
dotenv.config({ path: path.resolve(process.cwd(), "backend", ".env") });

import cookie from "cookie";
import jwt from "jsonwebtoken";

// IMPORTANT: include the .js extension and correct relative path for ESM
// Adjust these paths if your models/lib live elsewhere.
import Word from "../models/Word.js";
import { connectToDatabase } from "../lib/mongodb.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment (backend/.env).");
  // continue — jwt.verify will throw later and we return 401
}

async function getUserFromReq(req) {
  const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
  const token = cookies.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: payload.sub, email: payload.email };
  } catch (e) {
    return null;
  }
}

/**
 * Helper: normalize an incoming word to trimmed string and lower-case key
 */
function normalizeList(items = []) {
  const cleaned = items
    .map((s) => String(s || "").trim())
    .filter((s) => s !== "");
  // keep original-case strings for returns, but compute lower keys
  const lowers = cleaned.map((s) => s.toLowerCase());
  return { cleaned, lowers };
}

/**
 * Build conflicts object shape:
 * { db: string[], inBatch: string[] }
 */
function conflictsObj(db = [], inBatch = []) {
  return {
    db: db.map((s) => s.toLowerCase()),
    inBatch: inBatch.map((s) => s.toLowerCase()),
  };
}

export default async function handler(req, res) {
  try {
    await connectToDatabase();
  } catch (err) {
    console.error("Failed to connect to DB:", err);
    return res.status(500).json({ error: "DB connection failed" });
  }

  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Missing token" });

  // Only POST is used for validate/submit flows
  if (req.method === "POST") {
    const action = String(req.query?.action ?? "").toLowerCase(); // "validate" or "submit" (or empty)
    const items = Array.isArray(req.body?.words) ? req.body.words : [];
    const { cleaned, lowers } = normalizeList(items);

    // Always require exactly 10 words for both validate and submit
    if (cleaned.length !== 10) {
      // return conflicts with inBatch if there are duplicates in provided list as well
      // but primary error is length
      return res.status(400).json({
        error: `Exactly 10 words required. You provided ${cleaned.length}.`,
      });
    }

    // detect in-batch duplicates (lower-cased)
    const counts = new Map();
    lowers.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
    const inBatchDupKeys = Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([k]) => k);

    // Query DB for any existing wordLower for this user
    let dbExisting = [];
    try {
      if (lowers.length > 0) {
        // distinct to avoid duplicates in returned list
        dbExisting = await Word.find(
          { userId: user.id, wordLower: { $in: lowers } },
          { wordLower: 1, _id: 0 }
        )
          .lean()
          .then((docs) =>
            (docs || []).map((d) => (d && d.wordLower ? d.wordLower : ""))
          )
          .then((arr) => Array.from(new Set(arr.filter(Boolean))));
      }
    } catch (err) {
      console.error("DB lookup failed:", err);
      return res.status(500).json({ error: "DB lookup failed" });
    }

    // If user requested validation-only, return conflicts (if any) without inserting
    if (action === "validate") {
      const hasDb = Array.isArray(dbExisting) && dbExisting.length > 0;
      const hasBatch = inBatchDupKeys.length > 0;

      if (!hasDb && !hasBatch) {
        return res.json({
          ok: true,
          message: "No conflicts",
          conflicts: { db: [], inBatch: [] },
        });
      }

      return res.status(200).json({
        ok: false,
        message: "Conflicts found",
        conflicts: conflictsObj(dbExisting, inBatchDupKeys),
      });
    }

    // --- submit flow ---
    // Re-check: do not allow in-batch duplicates on server
    if (inBatchDupKeys.length > 0) {
      return res.status(400).json({
        error: "Duplicate words in submitted batch",
        conflicts: conflictsObj([], inBatchDupKeys),
      });
    }

    // Re-check DB: if any exist, return 409 with conflicts so frontend can ask for replacements
    if (dbExisting.length > 0) {
      return res.status(409).json({
        error: "One or more words already exist",
        conflicts: conflictsObj(dbExisting, []),
      });
    }

    // Build docs and attempt insert
    const docs = cleaned.map((w) => ({
      userId: user.id,
      word: w,
      wordLower: w.toLowerCase(),
      addedAt: new Date(),
    }));

    try {
      // Use ordered:true so insert fails fast on a duplicate key (shouldn't happen because we checked),
      // but we also handle duplicate key error by returning conflicts via a fresh DB query.
      const inserted = await Word.insertMany(docs, { ordered: true });
      return res.json({ added: inserted.length });
    } catch (err) {
      console.error("Insert failed:", err);

      // If duplicate key error occurs, try to produce a useful conflicts list
      // Mongo duplicate key error code is 11000
      if (err && err.code === 11000) {
        // re-query which of the lowers now exist
        try {
          const nowExisting = await Word.find(
            { userId: user.id, wordLower: { $in: lowers } },
            { wordLower: 1, _id: 0 }
          )
            .lean()
            .then((docs) => (docs || []).map((d) => d.wordLower))
            .then((arr) => Array.from(new Set(arr.filter(Boolean))));
          return res.status(409).json({
            error: "One or more words already exist (race condition)",
            conflicts: conflictsObj(nowExisting, []),
          });
        } catch (err2) {
          console.error(
            "Failed to fetch existing words after duplicate error:",
            err2
          );
          return res.status(500).json({ error: "Insert failed (duplicate)" });
        }
      }

      return res.status(500).json({ error: "Insert failed" });
    }
  }

  if (req.method === "GET") {
    const { sort = "date-desc", from, to, q = "" } = req.query;
    const filter = { userId: user.id };
    if (from) filter.addedAt = { ...filter.addedAt, $gte: new Date(from) };
    if (to)
      filter.addedAt = { ...filter.addedAt, $lte: new Date(to + "T23:59:59") };
    if (q) filter.wordLower = { $regex: q.toLowerCase(), $options: "i" };
    let sortSpec = { addedAt: -1 };
    if (sort === "date-asc") sortSpec = { addedAt: 1 };
    if (sort === "alpha-asc") sortSpec = { wordLower: 1 };
    if (sort === "alpha-desc") sortSpec = { wordLower: -1 };

    try {
      const docs = await Word.find(filter).sort(sortSpec).limit(2000).lean();
      return res.json(docs);
    } catch (err) {
      console.error("Failed to fetch words:", err);
      return res.status(500).json({ error: "Fetch failed" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
