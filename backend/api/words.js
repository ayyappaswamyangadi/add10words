// api/words.js
import cookie from "cookie";
import jwt from "jsonwebtoken";
import Word from "../backend/models/Word.js";
import { connectToDatabase } from "../backend/lib/mongodb.js";

const JWT_SECRET = process.env.JWT_SECRET;

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

export default async function handler(req, res) {
  await connectToDatabase();
  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Missing token" });

  if (req.method === "POST") {
    const items = Array.isArray(req.body.words) ? req.body.words : [];
    const cleaned = items.map((s) => String(s).trim()).filter(Boolean);
    if (cleaned.length === 0)
      return res.status(400).json({ error: "No words provided" });
    if (cleaned.length > 10)
      return res.status(400).json({ error: "Max 10 words per request" });

    const lowers = cleaned.map((s) => s.toLowerCase());
    const dupBatch = lowers.filter((v, i) => lowers.indexOf(v) !== i);
    if (dupBatch.length)
      return res.status(400).json({
        error: "Duplicate in batch: " + [...new Set(dupBatch)].join(", "),
      });

    const docs = cleaned.map((w) => ({
      userId: user.id,
      word: w,
      wordLower: w.toLowerCase(),
      addedAt: new Date(),
    }));

    try {
      const inserted = await Word.insertMany(docs, { ordered: false });
      return res.json({ added: inserted.length });
    } catch (err) {
      if (err.code === 11000)
        return res
          .status(409)
          .json({ error: "One or more words already exist" });
      console.error(err);
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

    const docs = await Word.find(filter).sort(sortSpec).limit(2000).lean();
    return res.json(docs);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
