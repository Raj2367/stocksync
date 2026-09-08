import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET =
  process.env.JWT_SECRET || "stocksync-dev-secret-change-in-production";

// In-memory user store. In production, use a database.
const users: Map<
  string,
  { userId: string; email: string; password: string; role: string }
> = new Map();

router.post("/register", (req, res) => {
  const { email, password, role = "customer" } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  if (users.has(email)) {
    return res.status(409).json({ error: "User already exists" });
  }

  const userId = `user-${Date.now()}`;
  users.set(email, { userId, email, password, role });

  const token = jwt.sign({ userId, email, role }, JWT_SECRET, {
    expiresIn: "24h",
  });

  res.status(201).json({
    message: "User registered successfully",
    token,
    user: { userId, email, role },
  });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { userId: user.userId, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "24h" },
  );

  res.json({
    message: "Login successful",
    token,
    user: { userId: user.userId, email: user.email, role: user.role },
  });
});

export { router as authRouter };
