import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User";

const router = Router();
const JWT_SECRET =
  process.env.JWT_SECRET || "stocksync-dev-secret-change-in-production";

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    {
      userId: user.userId,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "24h" },
  );

  res.json({
    message: "Login successful",
    token,
    user: {
      userId: user.userId,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    },
  });
});

export { router as authRouter };
