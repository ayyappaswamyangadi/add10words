// backend/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import serverless from "serverless-http";
import { connectDB } from "../lib/mongodb.js";

//routes
import authRoutes from "./auth.js";
import wordsRoutes from "./words.js";

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// // Allow frontend dev (Vite) origin and cookies
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
// app.use(
//   cors({
//     origin: CLIENT_URL,
//     credentials: true,
//   })
// );
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

// // Allowed client origin (must be exact: https://your-app.vercel.app)
// const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
// const allowedOrigins = [CLIENT_URL];

// // CORS: allow explicit origin or allow non-browser (e.g. same-origin) requests
// app.use(
//   cors({
//     origin: (origin, callback) => {
//       // `origin` is undefined for same-origin requests (or tools like curl)
//       if (!origin) return callback(null, true);
//       if (allowedOrigins.includes(origin)) return callback(null, true);
//       return callback(new Error("CORS policy: origin not allowed"));
//     },
//     credentials: true,
//   })
// );

// app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    skip: (req) => req.method === "OPTIONS",
  })
);

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI in environment variables");
}

await connectDB(MONGODB_URI);
// mongoose
//   .connect(MONGODB_URI)
//   .then(() => console.log("MongoDB connected"))
//   .catch((err) => {
//     console.error("MongoDB connection error", err);
//     process.exit(1);
//   });

/*
  Mount API routes under /api so frontend dev/proxy and production serverless
  can both use the same URLs: /api/auth, /api/words
*/
app.use("/api/auth", authRoutes);
app.use("/api/words", wordsRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// const PORT = process.env.PORT || 4000;
// app.listen(PORT, () =>
//   console.log(`Backend running on http://localhost:${PORT}`)
// );
// Export app for Vercel serverless functions
export default serverless(app);
