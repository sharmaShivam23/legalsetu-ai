/**
 * Creates (or resets) a verified test user for local login.
 * Run with: npx tsx scripts/create-test-user.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "testuser@legalsetu.example";
const PASSWORD = "Test@12345";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, emailVerified: new Date() },
    create: {
      email: EMAIL,
      name: "Test User",
      passwordHash,
      role: "USER",
      emailVerified: new Date(),
    },
  });
  console.log(`Test user ready: ${user.email} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
