// backend/lib/mongodb.js
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI");
}

// use global to cache across lambda invocations
const globalAny = global;
globalAny._mongoPromise = globalAny._mongoPromise || null;

export async function connectToDatabase() {
  if (mongoose.connection.readyState) {
    return mongoose;
  }
  if (!globalAny._mongoPromise) {
    globalAny._mongoPromise = mongoose.connect(MONGODB_URI, {
      /* options optional */
    });
  }
  await globalAny._mongoPromise;
  return mongoose;
}
