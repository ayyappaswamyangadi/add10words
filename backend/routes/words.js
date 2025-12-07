import express from "express";
import Word from "../models/Word.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// POST /api/words  -> add up to 10 words
router.post("/", auth, async (req, res) => {
  try {
    const items = Array.isArray(req.body.words) ? req.body.words : [];
    const cleaned = items.map((s) => String(s).trim()).filter(Boolean);

    if (cleaned.length === 0)
      return res.status(400).json({ error: "No words provided" });
    if (cleaned.length > 10)
      return res.status(400).json({ error: "Max 10 words per request" });

    // duplicates inside batch
    const lowers = cleaned.map((s) => s.toLowerCase());
    const dupBatch = lowers.filter((v, i) => lowers.indexOf(v) !== i);
    if (dupBatch.length)
      return res.status(400).json({
        error: "Duplicate in batch: " + [...new Set(dupBatch)].join(", "),
      });

    const userId = req.user.id;
    const now = new Date();

    const docs = cleaned.map((w) => ({
      userId,
      word: w,
      wordLower: w.toLowerCase(),
      addedAt: now,
    }));

    try {
      const inserted = await Word.insertMany(docs, { ordered: false });
      res.json({ added: inserted.length });
    } catch (err) {
      if (err.code === 11000) {
        return res
          .status(409)
          .json({ error: "One or more words already exist" });
      }
      console.error(err);
      return res.status(500).json({ error: "Insert failed" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/words -> list with filters
router.get("/", auth, async (req, res) => {
  try {
    const { sort = "date-desc", from, to, q = "" } = req.query;
    const filter = { userId: req.user.id };

    if (from) filter.addedAt = { ...filter.addedAt, $gte: new Date(from) };
    if (to)
      filter.addedAt = { ...filter.addedAt, $lte: new Date(to + "T23:59:59") };
    if (q) filter.wordLower = { $regex: q.toLowerCase(), $options: "i" };

    let sortSpec = { addedAt: -1 }; // date-desc
    if (sort === "date-asc") sortSpec = { addedAt: 1 };
    if (sort === "alpha-asc") sortSpec = { wordLower: 1 };
    if (sort === "alpha-desc") sortSpec = { wordLower: -1 };

    const docs = await Word.find(filter).sort(sortSpec).limit(2000).lean();
    res.json(docs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
