import express, { Express } from "express";
import supertest from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { authRouter } from "../routes/auth";
import { seedUsers } from "../db/seed";

const TEST_MONGO_URI = "mongodb://127.0.0.1:27017/stocksync-auth-test";
const JWT_SECRET =
  process.env.JWT_SECRET || "stocksync-dev-secret-change-in-production";

const app: Express = express();
app.use(express.json());
app.use("/auth", authRouter);

const request = supertest(app);

describe("Mongo-backed Authentication (Task 0A.4)", () => {
  beforeAll(async () => {
    process.env.SEED_ACME_ADMIN_PASSWORD = "AcmeAdmin123!";
    process.env.SEED_ACME_USER_PASSWORD = "AcmeUser123!";
    process.env.SEED_BETA_ADMIN_PASSWORD = "BetaAdmin123!";
    process.env.SEED_BETA_USER_PASSWORD = "BetaUser123!";

    await mongoose.connect(TEST_MONGO_URI);
    await User.deleteMany({});
    await seedUsers();
  });

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.disconnect();
  });

  // ==================== 1. Successful login ====================

  describe("Successful login", () => {
    it("should authenticate a seeded Acme admin user with 200", async () => {
      const res = await request.post("/auth/login").send({
        email: "admin@acme.stocksync",
        password: "AcmeAdmin123!",
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.message).toBe("Login successful");
    });

    it("should authenticate a seeded Beta user with 200", async () => {
      const res = await request.post("/auth/login").send({
        email: "user@beta.stocksync",
        password: "BetaUser123!",
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });
  });

  // ==================== 2. Wrong password ====================

  describe("Wrong password", () => {
    it("should return 401 with generic invalid-credentials", async () => {
      const res = await request.post("/auth/login").send({
        email: "admin@acme.stocksync",
        password: "wrongpassword",
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid credentials");
    });
  });

  // ==================== 3. Unknown email ====================

  describe("Unknown email", () => {
    it("should return 401 with generic invalid-credentials", async () => {
      const res = await request.post("/auth/login").send({
        email: "nobody@acme.stocksync",
        password: "anything",
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid credentials");
    });

    it("should return same status and message as wrong password", async () => {
      const unknownRes = await request.post("/auth/login").send({
        email: "nobody@acme.stocksync",
        password: "anything",
      });

      const wrongRes = await request.post("/auth/login").send({
        email: "admin@acme.stocksync",
        password: "wrongpassword",
      });

      expect(unknownRes.status).toBe(wrongRes.status);
      expect(unknownRes.body.error).toBe(wrongRes.body.error);
    });
  });

  // ==================== 4. JWT claims ====================

  describe("JWT claims", () => {
    it("should contain userId, email, tenantId, and role", async () => {
      const res = await request.post("/auth/login").send({
        email: "admin@acme.stocksync",
        password: "AcmeAdmin123!",
      });

      expect(res.status).toBe(200);

      const decoded = jwt.verify(res.body.token, JWT_SECRET) as {
        userId: string;
        email: string;
        tenantId: string;
        role: string;
      };

      expect(decoded.userId).toBe("user-acme-admin");
      expect(decoded.email).toBe("admin@acme.stocksync");
      expect(decoded.tenantId).toBe("tenant-acme");
      expect(decoded.role).toBe("ADMIN");
    });
  });

  // ==================== 5. Registration unavailable ====================

  describe("Registration removed", () => {
    it("should return 404 for POST /auth/register", async () => {
      const res = await request.post("/auth/register").send({
        email: "new@test.com",
        password: "test",
      });

      expect(res.status).toBe(404);
    });
  });

  // ==================== 6. Password persistence ====================

  describe("Password persistence", () => {
    it("should store passwordHash (not plaintext) in the database", async () => {
      const user = await User.findOne({ email: "admin@acme.stocksync" });

      expect(user).toBeTruthy();
      expect(user!.passwordHash).toBeDefined();
      expect(user!.passwordHash).not.toBe("AcmeAdmin123!");
      expect(user!.passwordHash.startsWith("$2b$")).toBe(true);
    });

    it("should not return passwordHash in the login response", async () => {
      const res = await request.post("/auth/login").send({
        email: "admin@acme.stocksync",
        password: "AcmeAdmin123!",
      });

      expect(res.body.user).toBeDefined();
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
      expect(JSON.stringify(res.body)).not.toContain("$2b$");
    });
  });

  // ==================== 7. Tenant/role data ====================

  describe("Tenant/role data", () => {
    it("should have tenant-acme for Acme users", async () => {
      const res = await request.post("/auth/login").send({
        email: "user@acme.stocksync",
        password: "AcmeUser123!",
      });

      const decoded = jwt.verify(res.body.token, JWT_SECRET) as {
        tenantId: string;
        role: string;
      };

      expect(decoded.tenantId).toBe("tenant-acme");
      expect(decoded.role).toBe("USER");
    });

    it("should have tenant-beta for Beta users", async () => {
      const res = await request.post("/auth/login").send({
        email: "admin@beta.stocksync",
        password: "BetaAdmin123!",
      });

      const decoded = jwt.verify(res.body.token, JWT_SECRET) as {
        tenantId: string;
        role: string;
      };

      expect(decoded.tenantId).toBe("tenant-beta");
      expect(decoded.role).toBe("ADMIN");
    });
  });
});
