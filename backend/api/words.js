// backend/routes/words.js
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "backend", ".env") });

import cookie from "cookie";
import jwt from "jsonwebtoken";

import Word from "../models/Word.js";
import User from "../models/User.js"; // <--- owner lookup
import { connectDB } from "../lib/mongodb.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment (backend/.env).");
  // jwt.verify will throw if secret missing — requests will be unauthorized.
}

/**
 * Module-level flag to avoid re-running index creation on every invocation
 * (important for serverless environments like Vercel).
 */
let indexEnsured = false;
async function ensureWordLowerIndexOnce() {
  if (indexEnsured) return;
  try {
    await Word.collection.createIndex({ wordLower: 1 }, { unique: true });
    indexEnsured = true;
  } catch (e) {
    console.warn(
      "Could not create unique index on wordLower (continuing):",
      e && e.message ? e.message : e
    );
    // don't set indexEnsured true so we may try again on next cold start
  }
}

async function getUserFromReq(req) {
  const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
  const token = cookies.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch (e) {
    return null;
  }
}

function normalizeList(items = []) {
  const cleaned = Array.isArray(items)
    ? items.map((s) => String(s || "").trim()).filter((s) => s !== "")
    : [];
  const lowers = cleaned.map((s) => s.toLowerCase());
  return { cleaned, lowers };
}

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

function normalizeDocs(docs = []) {
  return (docs || []).map((d) => ({
    _id: String(d._id),
    word: d.word,
    wordLower: d.wordLower,
    userId: d.userId ? String(d.userId) : undefined,
    addedAt: d.addedAt ? new Date(d.addedAt).toISOString() : null,
  }));
}

export default async function handler(req, res) {
  // ensure DB
  try {
    await connectDB();
  } catch (err) {
    console.error("Failed to connect to DB:", err);
    return res.status(500).json({ error: "DB connection failed" });
  }

  // ensure index once per cold start
  ensureWordLowerIndexOnce().catch(() => {});

  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Missing token" });

  // POST: validate or submit
  if (req.method === "POST") {
    const action = String(req.query?.action ?? "").toLowerCase();
    const items = Array.isArray(req.body?.words) ? req.body.words : [];
    const { cleaned, lowers } = normalizeList(items);

    if (cleaned.length !== 10) {
      return res.status(400).json({
        error: `Exactly 10 words required. Received ${cleaned.length}.`,
        conflicts: conflictsObj([], []),
      });
    }

    // in-batch duplicates
    const counts = new Map();
    lowers.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
    const inBatch = Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([k]) => k);

    // query DB for existing matches
    let existingLower = [];
    try {
      if (lowers.length > 0) {
        const found = await Word.find(
          { wordLower: { $in: lowers } },
          { wordLower: 1 }
        ).lean();
        existingLower = Array.from(
          new Set((found || []).map((d) => String(d.wordLower).toLowerCase()))
        );
      }
    } catch (err) {
      console.error("DB fetch failed:", err);
      return res.status(500).json({ error: "DB fetch failed" });
    }

    if (action === "validate") {
      if (existingLower.length === 0 && inBatch.length === 0) {
        return res.json({
          ok: true,
          message: "No conflicts",
          conflicts: conflictsObj([], []),
        });
      }
      return res.json({
        ok: false,
        message: "Conflicts found",
        conflicts: conflictsObj(existingLower, inBatch),
      });
    }

    if (inBatch.length > 0 || existingLower.length > 0) {
      return res.status(409).json({
        error: "Conflicts found. Fix duplicates before submitting.",
        conflicts: conflictsObj(existingLower, inBatch),
      });
    }

    const docs = cleaned.map((w) => ({
      userId: user.id,
      word: w,
      wordLower: w.toLowerCase(),
      addedAt: new Date(),
    }));

    try {
      const inserted = await Word.insertMany(docs, { ordered: true });
      return res.json({ added: inserted.length });
    } catch (err) {
      console.error("Insert failed:", err);
      const dupKey =
        err &&
        (err.code === 11000 ||
          (err.writeErrors && err.writeErrors.some((we) => we.code === 11000)));
      if (dupKey) {
        try {
          const nowExistingDocs = await Word.find(
            { wordLower: { $in: lowers } },
            { wordLower: 1 }
          ).lean();
          const nowExisting = Array.from(
            new Set(
              (nowExistingDocs || []).map((d) =>
                String(d.wordLower || "").toLowerCase()
              )
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

  // GET: return mine and all (with ownerName)
  if (req.method === "GET") {
    const { sort = "date-desc", from, to, q = "" } = req.query;

    const mineFilter = { userId: user.id };
    if (from)
      mineFilter.addedAt = { ...mineFilter.addedAt, $gte: new Date(from) };
    if (to)
      mineFilter.addedAt = {
        ...mineFilter.addedAt,
        $lte: new Date(String(to) + "T23:59:59"),
      };
    if (q)
      mineFilter.wordLower = { $regex: String(q).toLowerCase(), $options: "i" };

    const globalFilter = {};
    if (q)
      globalFilter.wordLower = {
        $regex: String(q).toLowerCase(),
        $options: "i",
      };

    let sortSpec = { addedAt: -1 };
    if (sort === "date-asc") sortSpec = { addedAt: 1 };
    if (sort === "alpha-asc") sortSpec = { wordLower: 1 };
    if (sort === "alpha-desc") sortSpec = { wordLower: -1 };

    try {
      const [mineDocs, allDocs] = await Promise.all([
        Word.find(mineFilter).sort(sortSpec).limit(2000).lean(),
        Word.find(globalFilter).sort(sortSpec).limit(5000).lean(),
      ]);

      // Build owner map
      const userIds = Array.from(
        new Set(
          (allDocs || []).map((w) => String(w.userId || "")).filter(Boolean)
        )
      );
      let ownerMap = {};
      if (userIds.length > 0) {
        const owners = await User.find(
          { _id: { $in: userIds } },
          { name: 1, email: 1 }
        ).lean();
        ownerMap = Object.fromEntries(
          owners.map((u) => {
            const displayName =
              u.name && u.name.trim() !== "" ? u.name : u.email;
            return [String(u._id), displayName];
          })
        );
      }

      const attachOwner = (docs) =>
        (docs || []).map((d) => ({
          _id: String(d._id),
          word: d.word,
          wordLower: d.wordLower,
          userId: d.userId ? String(d.userId) : undefined,
          addedAt: d.addedAt ? new Date(d.addedAt).toISOString() : null,
          ownerName: d.userId
            ? ownerMap[String(d.userId)] || "Unknown"
            : "Unknown",
        }));

      const mine = attachOwner(mineDocs);
      const all = attachOwner(allDocs);

      return res.json({ mine, all });
    } catch (err) {
      console.error("Failed to fetch words:", err);
      return res.status(500).json({ error: "Fetch failed" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
