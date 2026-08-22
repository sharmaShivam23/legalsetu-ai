/**
 * Seed script — populates the database with CLEARLY LABELED
 * demonstration data only. No real legal provisions are invented
 * or represented as authoritative. Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding demo data...");

  const passwordHash = await bcrypt.hash("demo@123", 12);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@legalsetu.example" },
    update: {},
    create: {
      email: "demo@legalsetu.example",
      name: "Demo User",
      passwordHash,
      role: "USER",
      preferences: {
        create: {
          interfaceLanguage: "en",
          responseLanguage: "hi",
          voiceLanguage: "hi",
        },
      },
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@legalsetu.example" },
    update: {},
    create: {
      email: "admin@legalsetu.example",
      name: "Admin User",
      passwordHash,
      role: "ADMIN",
    },
  });

  const source = await prisma.legalSource.create({
    data: {
      title: "[DEMO LEGAL DOCUMENT] Sample Tenancy Rights Statute",
      actName: "[DEMO] Example State Tenancy Act",
      sourceType: "STATUTE",
      jurisdiction: "DEMO-STATE",
      language: "en",
      officialUrl: "https://example.gov.in/demo-tenancy-act",
      verificationStatus: "VERIFIED",
      lastVerifiedAt: new Date(),
      chunks: {
        create: [
          {
            section: "12(a)",
            text: "[DEMO CONTENT — NOT A REAL LAW] A landlord must provide written notice of at least 30 days before terminating a residential tenancy, except in cases of documented lease violation.",
          },
          {
            section: "18(b)",
            text: "[DEMO CONTENT — NOT A REAL LAW] Tenants are entitled to written acknowledgment of any security deposit paid, including the amount and date received.",
          },
        ],
      },
    },
  });

  console.log({ demoUser: demoUser.email, adminUser: adminUser.email, source: source.title });
  console.log("Seed complete.");
  console.log("Demo login:  demo@legalsetu.example / demo@123");
  console.log("Admin login: admin@legalsetu.example / demo@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });