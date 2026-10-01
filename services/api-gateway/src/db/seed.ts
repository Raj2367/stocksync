import bcrypt from "bcryptjs";
import User from "../models/User";

interface SeedUser {
  userId: string;
  email: string;
  tenantId: string;
  role: "ADMIN" | "USER";
  passwordEnv: string;
}

const SEED_USERS: SeedUser[] = [
  {
    userId: "user-acme-admin",
    email: "admin@acme.stocksync",
    tenantId: "tenant-acme",
    role: "ADMIN",
    passwordEnv: "SEED_ACME_ADMIN_PASSWORD",
  },
  {
    userId: "user-acme-user",
    email: "user@acme.stocksync",
    tenantId: "tenant-acme",
    role: "USER",
    passwordEnv: "SEED_ACME_USER_PASSWORD",
  },
  {
    userId: "user-beta-admin",
    email: "admin@beta.stocksync",
    tenantId: "tenant-beta",
    role: "ADMIN",
    passwordEnv: "SEED_BETA_ADMIN_PASSWORD",
  },
  {
    userId: "user-beta-user",
    email: "user@beta.stocksync",
    tenantId: "tenant-beta",
    role: "USER",
    passwordEnv: "SEED_BETA_USER_PASSWORD",
  },
];

export async function seedUsers(): Promise<void> {
  const count = await User.countDocuments();
  if (count > 0) {
    console.log("ℹ️  Users already exist, skipping seed");
    return;
  }

  for (const seedUser of SEED_USERS) {
    const password = process.env[seedUser.passwordEnv];
    if (!password) {
      throw new Error(
        `Missing seed password: ${seedUser.passwordEnv} for ${seedUser.email}`,
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
      userId: seedUser.userId,
      email: seedUser.email,
      passwordHash,
      tenantId: seedUser.tenantId,
      role: seedUser.role,
    });

    console.log(`✅ Seeded user: ${seedUser.email}`);
  }

  console.log("✅ Demo users seeded");
}
