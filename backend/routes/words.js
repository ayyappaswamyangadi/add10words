// backend/api/words.js
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "backend", ".env") });

import cookie from "cookie";
import jwt from "jsonwebtoken";

import Word from "../models/Word.js";
import { connectToDatabase } from "../lib/mongodb.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment (backend/.env).");
  // We'll continue — jwt.verify will throw and the request will be unauthorized.
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
 * normalizeList: given an array of arbitrary values, return
 * - cleaned: trimmed non-empty strings (preserving original casing)
 * - lowers: matching lower-cased strings (for comparisons)
 */
function normalizeList(items = []) {
  const cleaned = Array.isArray(items)
    ? items.map((s) => String(s || "").trim()).filter((s) => s !== "")
    : [];
  const lowers = cleaned.map((s) => s.toLowerCase());
  return { cleaned, lowers };
}

/**
 * Helper to produce conflicts object expected by frontend
 */
function conflictsObj(db = [], inBatch = []) {
  return {
    db: Array.from(
      new Set((db || []).map((s) => String(s).toLowerCase()).filter(Boolean))
    ),
    inBatch: Array.from(
      new Set(
        (inBatch || []).map((s) => String(s).toLowerCase()).filter(Boolean)
      )
    ),
  };
}

export default async function handler(req, res) {
  // ensure DB connection
  try {
    await connectToDatabase();
  } catch (err) {
    console.error("Failed to connect to DB:", err);
    return res.status(500).json({ error: "DB connection failed" });
  }

  // attempt to create unique index on wordLower (global uniqueness)
  // This is best-effort and will log an error if existing duplicates prevent index creation.
  // If you already added the index in your schema or via migration, this will be no-op.
  try {
    // createIndex is idempotent if index exists.
    // If duplicates exist, this will throw; we catch and log.
    await Word.collection
      .createIndex({ wordLower: 1 }, { unique: true })
      .catch((e) => {
        // Log but don't stop the handler because we can still function without the index (DB race still possible).
        if (e && e.codeName === "IndexOptionsConflict") {
          // harmless in many upgrade cases
          console.warn(
            "Index options conflict when creating wordLower unique index:",
            e.message || e
          );
        } else {
          // possible duplicate key conflict or other issue
          console.warn(
            "Could not create unique index on wordLower (you may need to dedupe existing docs):",
            e.message || e
          );
        }
      });
  } catch (err) {
    // swallow any unexpected error creating index; continue
    console.warn(
      "Index creation attempt failed (continuing):",
      err && err.message ? err.message : err
    );
  }

  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Missing token" });

  if (req.method === "POST") {
    const action = String(req.query?.action ?? "").toLowerCase(); // "validate" or "submit"
    const items = Array.isArray(req.body?.words) ? req.body.words : [];
    const { cleaned, lowers } = normalizeList(items);

    // enforce exact 10 words
    if (cleaned.length !== 10) {
      return res.status(400).json({
        error: `Exactly 10 words required. Received ${cleaned.length}.`,
        conflicts: conflictsObj([], []),
      });
    }

    // detect in-batch duplicates
    const counts = new Map();
    lowers.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
    const inBatch = Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([k]) => k);

    // fetch ALL saved words (global) and build a lower-case set/array
    let savedLower = [];
    try {
      // We ask only for the wordLower field to reduce payload
      const savedDocs = await Word.find({}, { wordLower: 1 }).lean();
      savedLower = Array.from(
        new Set(
          (savedDocs || [])
            .map((d) =>
              d && d.wordLower ? String(d.wordLower).toLowerCase() : ""
            )
            .filter(Boolean)
        )
      );
    } catch (err) {
      console.error("DB fetch failed:", err);
      return res.status(500).json({ error: "DB fetch failed" });
    }

    // compute dbMatches = submitted lowers that are present in global savedLower
    const dbMatches = Array.from(
      new Set(lowers.filter((l) => savedLower.includes(l)))
    );

    // If validate action, just return conflicts (200 OK with conflicts)
    if (action === "validate") {
      if (dbMatches.length === 0 && inBatch.length === 0) {
        return res.json({
          ok: true,
          message: "No conflicts",
          conflicts: conflictsObj([], []),
        });
      }
      return res.json({
        ok: false,
        message: "Conflicts found",
        conflicts: conflictsObj(dbMatches, inBatch),
      });
    }

    // Submit workflow: disallow if any conflicts present (in-batch or db)
    if (inBatch.length > 0 || dbMatches.length > 0) {
      return res.status(409).json({
        error: "Conflicts found. Fix duplicates before submitting.",
        conflicts: conflictsObj(dbMatches, inBatch),
      });
    }

    // Build docs and insert
    const docs = cleaned.map((w) => ({
      userId: user.id,
      word: w,
      wordLower: w.toLowerCase(),
      addedAt: new Date(),
    }));

    try {
      // ordered:true ensures we stop on first duplicate (should be none because we pre-checked)
      const inserted = await Word.insertMany(docs, { ordered: true });
      return res.json({ added: inserted.length });
    } catch (err) {
      console.error("Insert failed:", err);

      // if duplicate key error occurs (race), return 409 with conflicts produced by re-querying DB
      if (
        err &&
        (err.code === 11000 ||
          (err.writeErrors && err.writeErrors.some((we) => we.code === 11000)))
      ) {
        try {
          const nowExistingDocs = await Word.find(
            { wordLower: { $in: lowers } },
            { wordLower: 1 }
          ).lean();
          const nowExisting = Array.from(
            new Set(
              (nowExistingDocs || []).map((d) => d.wordLower.toLowerCase())
            )
          );
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

  // GET: same as before — list the current user's words (for frontend saved words table)
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
