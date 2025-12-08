// backend/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

//routes
import authRoutes from "./routes/auth.js";
import wordsRoutes from "./routes/words.js";

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Allow frontend dev (Vite) origin and cookies
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in env");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error", err);
    process.exit(1);
  });

/*
  Mount API routes under /api so frontend dev/proxy and production serverless
  can both use the same URLs: /api/auth, /api/words
*/
app.use("/api/auth", authRoutes);
app.use("/api/words", wordsRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Backend running on http://localhost:${PORT}`)
);
