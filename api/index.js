import express from "express";
import serverless from "serverless-http";

const app = express();
app.use(express.json());

// 🔴 Minimal proof route
app.post("/auth/login", (req, res) => {
  return res.status(200).json({ ok: "EXPRESS LOGIN HIT" });
});

app.get("/health", (req, res) => {
  return res.json({ ok: true });
});

export default serverless(app);

// /api/index.js
// import dotenv from "dotenv";
// dotenv.config();

// import express from "express";
// import cors from "cors";
// import helmet from "helmet";
// import rateLimit from "express-rate-limit";
// import cookieParser from "cookie-parser";
// import serverless from "serverless-http";
// //routes
// import { connectDB } from "../backend/lib/mongodb.js";
// import authRoutes from "../backend/routes/auth.js";
// import wordsRoutes from "../backend/routes/words.js";

// const app = express();
// app.use(helmet());
// app.use(express.json());
// app.use(cookieParser());

// // // Allow frontend dev (Vite) origin and cookies
// const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// // app.use(
// //   cors({
// //     origin: CLIENT_URL,
// //     credentials: true,
// //   })
// // );

// app.use(
//   cors({
//     origin: CLIENT_URL,
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );

// app.options("*", cors());

// // app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));
// app.use(
//   rateLimit({
//     windowMs: 60 * 1000,
//     max: 120,
//     skip: (req) => req.method === "OPTIONS",
//   })
// );

// const MONGODB_URI = process.env.MONGODB_URI;
// if (!MONGODB_URI) {
//   throw new Error("Missing MONGODB_URI in environment variables");
// }

// await connectDB(MONGODB_URI);
// app.use("/auth", authRoutes);
// app.use("/words", wordsRoutes);

// app.get("/health", (req, res) => res.json({ ok: true }));

// // if (process.env.NODE_ENV !== "production") {
// //   const PORT = process.env.PORT || 4000;
// //   app.listen(PORT, () =>
// //     console.log(`Backend running on http://localhost:${PORT}`)
// //   );
// // }
// app.post("/auth/login", (req, res) => {
//   res.json({ ok: "DIRECT LOGIN ROUTE HIT" });
// });
// // Export app for Vercel serverless functions
// export default serverless(app);
