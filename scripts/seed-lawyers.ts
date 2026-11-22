// ==========================================================
// Demo data for Verified Lawyer Connect — 11 FICTIONAL advocates:
// six in and around Bijnor (western UP) and five in other cities, so that
// "Find lawyers near you" has something to filter.
//
//   npm run lawyers:seed                       # add / refresh demo advocates
//   npm run lawyers:seed -- --remove           # delete all demo advocates
//   npm run lawyers:seed -- --make-admin you@example.com
//
// Every profile is fictional and marked isDemo: the UI labels it
// "Demo profile", and enrolment numbers use a DEMO/ prefix so they can
// never coincide with a real advocate's. Demo advocates sign in with
// DEMO_LAWYER_PASSWORD (a random one is generated and printed if unset).
// Refuses to run against production unless ALLOW_DEMO_SEED=1.
// ==========================================================

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { lawyerProfileSchema } from "../lib/lawyers/validation";

// The shared client retries when the hosted database is slow to wake.
import { prisma } from "../lib/db/prisma";
const EMAIL_DOMAIN = "legalsetu-demo.example";

type Seed = {
  fullName: string;
  gender: "FEMALE" | "MALE";
  barCouncil: string;
  enrolmentYear: number;
  practiceAreas: string[];
  courts: string[];
  languages: string[];
  bio: string;
  officeAddress: string;
  city: string;
  pincode: string;
  latitude: number;
  longitude: number;
  legalAidPanel?: boolean;
  proBono?: boolean;
  acceptingClients?: boolean;
};

const SEEDS: Seed[] = [
  // ---- Near Bijnor / Jalalabad (western Uttar Pradesh) ----
  { fullName: "Ramesh Chandra Saxena", gender: "MALE", barCouncil: "UP", enrolmentYear: 2009, practiceAreas: ["CRIMINAL", "PROPERTY", "CIVIL"], courts: ["DISTRICT", "MAGISTRATE"], languages: ["en", "hi", "ur"], bio: "Practising at the Bijnor District Court. Bail, land and property disputes.", officeAddress: "Chamber 21, Collectorate Compound, Civil Lines", city: "Bijnor", pincode: "246701", latitude: 29.3724, longitude: 78.1351 },
  { fullName: "Shabana Parveen", gender: "FEMALE", barCouncil: "UP", enrolmentYear: 2014, practiceAreas: ["FAMILY", "DOMESTIC_VIOLENCE", "CIVIL"], courts: ["FAMILY_COURT", "DISTRICT"], languages: ["en", "hi", "ur"], bio: "Family court matters: maintenance, custody and protection orders. Legal aid panel.", officeAddress: "Chamber 8, Tehsil Road, Bijnor Courts", city: "Bijnor", pincode: "246701", latitude: 29.3689, longitude: 78.1402, legalAidPanel: true, proBono: true },
  { fullName: "Anil Kumar Tyagi", gender: "MALE", barCouncil: "UP", enrolmentYear: 2011, practiceAreas: ["CRIMINAL", "MOTOR_ACCIDENT", "CHEQUE_BOUNCE"], courts: ["MAGISTRATE", "DISTRICT"], languages: ["en", "hi"], bio: "Bail applications, accident-claim cases and Section 138 matters at Najibabad.", officeAddress: "Chamber 5, Tehsil Compound, Najibabad", city: "Najibabad", pincode: "246763", latitude: 29.613, longitude: 78.342 },
  { fullName: "Pooja Rastogi", gender: "FEMALE", barCouncil: "UP", enrolmentYear: 2016, practiceAreas: ["CONSUMER", "CIVIL", "PROPERTY"], courts: ["CONSUMER_COMMISSION", "DISTRICT"], languages: ["en", "hi"], bio: "Consumer complaints and civil suits for residents of Nagina and nearby towns.", officeAddress: "Office 3, Main Bazaar, Nagina", city: "Nagina", pincode: "246762", latitude: 29.444, longitude: 78.437, legalAidPanel: true },
  { fullName: "Mohd. Zubair Ansari", gender: "MALE", barCouncil: "UP", enrolmentYear: 2007, practiceAreas: ["CRIMINAL", "PROPERTY", "TENANCY"], courts: ["DISTRICT", "HIGH_COURT"], languages: ["en", "hi", "ur"], bio: "Criminal defence and tenancy matters at Moradabad District Court.", officeAddress: "Chamber 40, Civil Lines, Moradabad Courts", city: "Moradabad", pincode: "244001", latitude: 28.8386, longitude: 78.7733 },
  { fullName: "Neeraj Chaudhary", gender: "MALE", barCouncil: "UP", enrolmentYear: 2012, practiceAreas: ["LABOUR", "SERVICE", "CONSTITUTIONAL"], courts: ["LABOUR_COURT", "HIGH_COURT", "TRIBUNAL"], languages: ["en", "hi"], bio: "Wage claims, service matters and writ petitions. Meerut and Allahabad High Court.", officeAddress: "Chamber 77, Collectorate Complex, Meerut", city: "Meerut", pincode: "250001", latitude: 28.9845, longitude: 77.7064 },
  // ---- Elsewhere in India ----
  { fullName: "Kavya Rawat", gender: "FEMALE", barCouncil: "UK", enrolmentYear: 2015, practiceAreas: ["FAMILY", "CRIMINAL", "DOMESTIC_VIOLENCE"], courts: ["DISTRICT", "FAMILY_COURT"], languages: ["en", "hi"], bio: "Family and criminal matters at Dehradun District Court.", officeAddress: "Chamber 12, Kachehri Road, Dehradun", city: "Dehradun", pincode: "248001", latitude: 30.3165, longitude: 78.0322, legalAidPanel: true },
  { fullName: "Meera Sharma", gender: "FEMALE", barCouncil: "DL", enrolmentYear: 2012, practiceAreas: ["CRIMINAL", "FAMILY", "DOMESTIC_VIOLENCE"], courts: ["DISTRICT", "MAGISTRATE", "FAMILY_COURT"], languages: ["en", "hi"], bio: "Practising at Saket District Court since 2012. Bail, family and domestic-violence matters.", officeAddress: "Chamber 412, Lawyers' Block, Saket District Court", city: "New Delhi", pincode: "110017", latitude: 28.5245, longitude: 77.2066, legalAidPanel: true },
  { fullName: "Rajiv Malhotra", gender: "MALE", barCouncil: "DL", enrolmentYear: 2008, practiceAreas: ["CRIMINAL", "CYBER"], courts: ["DISTRICT", "MAGISTRATE", "HIGH_COURT"], languages: ["en", "hi", "pa"], bio: "Criminal trials and cyber-crime complaints at Patiala House and the Delhi High Court.", officeAddress: "Chamber 87, Patiala House Courts Complex", city: "New Delhi", pincode: "110001", latitude: 28.6127, longitude: 77.235 },
  { fullName: "Aditi Mishra", gender: "FEMALE", barCouncil: "UP", enrolmentYear: 2013, practiceAreas: ["PROPERTY", "CIVIL", "CONSUMER"], courts: ["DISTRICT", "HIGH_COURT"], languages: ["en", "hi"], bio: "Property and civil matters at Lucknow and the Allahabad High Court bench.", officeAddress: "Chamber 33, Kaiserbagh Court Complex, Lucknow", city: "Lucknow", pincode: "226001", latitude: 26.8467, longitude: 80.9462 },
  { fullName: "Suresh Bhandari", gender: "MALE", barCouncil: "RJ", enrolmentYear: 2010, practiceAreas: ["CHEQUE_BOUNCE", "CIVIL", "TAX"], courts: ["MAGISTRATE", "DISTRICT", "TRIBUNAL"], languages: ["en", "hi"], bio: "Cheque-bounce, recovery suits and tax appeals at Jaipur.", officeAddress: "Chamber 18, Civil Lines Court Road, Jaipur", city: "Jaipur", pincode: "302001", latitude: 26.9124, longitude: 75.7873 },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, ".");

async function removeDemo() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } }, select: { id: true } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  console.log(`Removed ${users.length} demo advocate account(s).`);
}

async function makeAdmin(email: string) {
  const u = await prisma.user.update({ where: { email }, data: { role: "ADMIN" } }).catch(() => null);
  console.log(u ? `${email} is now an ADMIN. Sign out and back in.` : `No user with email ${email}.`);
}

async function seed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Refusing to seed demo advocates in production (set ALLOW_DEMO_SEED=1 to override).");
  }
  const password = process.env.DEMO_LAWYER_PASSWORD || randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  for (const [i, s] of SEEDS.entries()) {
    const enrolmentNumber = `DEMO/${String(i + 1).padStart(4, "0")}/${s.enrolmentYear}`;
    // Same validation (including the Rule 36 bio check) as a real profile.
    const parsed = lawyerProfileSchema.parse({
      ...s,
      enrolmentNumber,
      aibeNumber: null,
      legalAidPanel: s.legalAidPanel ?? false,
      proBono: s.proBono ?? false,
      acceptingClients: s.acceptingClients ?? true,
    });
    const email = `${slug(s.fullName)}@${EMAIL_DOMAIN}`;
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: s.fullName, passwordHash, emailVerified: now, role: "LAWYER" },
      update: { name: s.fullName, passwordHash, emailVerified: now, role: "LAWYER" },
    });
    await prisma.lawyerProfile.upsert({
      where: { userId: user.id },
      create: { ...parsed, userId: user.id, status: "VERIFIED", submittedAt: now, verifiedAt: now, reviewedAt: now, isDemo: true },
      update: { ...parsed, status: "VERIFIED", verifiedAt: now, reviewedAt: now, isDemo: true },
    });
    console.log(`  ✓ ${s.fullName.padEnd(16)} ${enrolmentNumber.padEnd(16)} ${email}`);
  }
  console.log(`\nSeeded ${SEEDS.length} fictional demo advocates (labelled "Demo profile" in the app).`);
  console.log(`Sign in as any of them with password: ${password}`);
  if (!process.env.DEMO_LAWYER_PASSWORD) console.log("(Set DEMO_LAWYER_PASSWORD to choose it yourself.)");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--remove")) return removeDemo();
  const adminIdx = args.indexOf("--make-admin");
  if (adminIdx !== -1) return makeAdmin(args[adminIdx + 1] ?? "");
  return seed();
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
