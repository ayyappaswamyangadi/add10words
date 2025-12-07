import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export default function authMiddleware(req, res, next) {
  try {
    let token = null;

    // Prefer cookie
    if (req.cookies && req.cookies.token) token = req.cookies.token;

    // Fallback to Authorization header: Bearer <token>
    const authHeader = req.headers.authorization;
    if (!token && authHeader) token = authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Missing token" });

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
