// ==========================================================
// Demo data for Verified Lawyer Connect — 15 FICTIONAL advocates
// around Delhi NCR.
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

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { lawyerProfileSchema } from "../lib/lawyers/validation";

const prisma = new PrismaClient();
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
  { fullName: "Meera Sharma", gender: "FEMALE", barCouncil: "DL", enrolmentYear: 2012, practiceAreas: ["CRIMINAL", "FAMILY", "DOMESTIC_VIOLENCE"], courts: ["DISTRICT", "MAGISTRATE", "FAMILY_COURT"], languages: ["en", "hi"], bio: "Practising at Saket District Court since 2012. Bail, family and domestic-violence matters.", officeAddress: "Chamber 412, Lawyers' Block, Saket District Court", city: "New Delhi", pincode: "110017", latitude: 28.5245, longitude: 77.2066, legalAidPanel: true },
  { fullName: "Rajiv Malhotra", gender: "MALE", barCouncil: "DL", enrolmentYear: 2008, practiceAreas: ["CRIMINAL", "CYBER"], courts: ["DISTRICT", "MAGISTRATE", "HIGH_COURT"], languages: ["en", "hi", "pa"], bio: "Criminal trials and cyber-crime complaints at Patiala House and the Delhi High Court.", officeAddress: "Chamber 87, Patiala House Courts Complex", city: "New Delhi", pincode: "110001", latitude: 28.6127, longitude: 77.235 },
  { fullName: "Farah Siddiqui", gender: "FEMALE", barCouncil: "DL", enrolmentYear: 2015, practiceAreas: ["FAMILY", "DOMESTIC_VIOLENCE", "CIVIL"], courts: ["FAMILY_COURT", "DISTRICT"], languages: ["en", "hi", "ur"], bio: "Family court practice: maintenance, custody and protection orders.", officeAddress: "Chamber 220, Western Wing, Tis Hazari Courts", city: "Delhi", pincode: "110054", latitude: 28.6676, longitude: 77.2162, legalAidPanel: true, proBono: true },
  { fullName: "Arjun Nair", gender: "MALE", barCouncil: "DL", enrolmentYear: 2017, practiceAreas: ["CRIMINAL", "CHEQUE_BOUNCE"], courts: ["MAGISTRATE", "DISTRICT"], languages: ["en", "hi", "ml"], bio: "Bail applications and Section 138 cheque-bounce cases at Karkardooma Courts.", officeAddress: "Chamber 35, Karkardooma Court Complex", city: "Delhi", pincode: "110032", latitude: 28.6496, longitude: 77.3046 },
  { fullName: "Kavita Yadav", gender: "FEMALE", barCouncil: "DL", enrolmentYear: 2011, practiceAreas: ["CRIMINAL", "MOTOR_ACCIDENT", "LABOUR"], courts: ["DISTRICT", "LABOUR_COURT"], languages: ["en", "hi", "bho"], bio: "Legal aid panel advocate at Rohini Courts. Undertrial bail and accident-claim cases.", officeAddress: "Chamber 118, Rohini Courts, Sector 14", city: "Delhi", pincode: "110085", latitude: 28.7383, longitude: 77.0822, legalAidPanel: true },
  { fullName: "Sandeep Gupta", gender: "MALE", barCouncil: "DL", enrolmentYear: 2005, practiceAreas: ["PROPERTY", "TENANCY", "CIVIL"], courts: ["DISTRICT", "HIGH_COURT"], languages: ["en", "hi"], bio: "Property, partition and tenancy disputes.", officeAddress: "Chamber 9, Dwarka Courts, Sector 10", city: "New Delhi", pincode: "110075", latitude: 28.5823, longitude: 77.05 },
  { fullName: "Priya Banerjee", gender: "FEMALE", barCouncil: "DL", enrolmentYear: 2014, practiceAreas: ["CONSUMER", "CYBER", "CONSTITUTIONAL"], courts: ["CONSUMER_COMMISSION", "HIGH_COURT"], languages: ["en", "hi", "bn"], bio: "Consumer complaints, online-fraud matters and writ petitions.", officeAddress: "Office 14, Barakhamba Road, Connaught Place", city: "New Delhi", pincode: "110001", latitude: 28.6315, longitude: 77.2167, proBono: true },
  { fullName: "Imran Qureshi", gender: "MALE", barCouncil: "DL", enrolmentYear: 2010, practiceAreas: ["CRIMINAL", "PROPERTY"], courts: ["DISTRICT", "MAGISTRATE"], languages: ["en", "hi", "ur"], bio: "Criminal defence and property matters in South Delhi courts.", officeAddress: "B-34, Lajpat Nagar II", city: "New Delhi", pincode: "110024", latitude: 28.5677, longitude: 77.2433, legalAidPanel: true },
  { fullName: "Lakshmi Iyer", gender: "FEMALE", barCouncil: "DL", enrolmentYear: 2009, practiceAreas: ["FAMILY", "TAX", "SERVICE"], courts: ["FAMILY_COURT", "TRIBUNAL"], languages: ["en", "ta", "hi"], bio: "Family law, tax appeals and service matters before tribunals.", officeAddress: "M-21, Greater Kailash I", city: "New Delhi", pincode: "110048", latitude: 28.5482, longitude: 77.234 },
  { fullName: "Harpreet Kaur", gender: "FEMALE", barCouncil: "DL", enrolmentYear: 2016, practiceAreas: ["CRIMINAL", "DOMESTIC_VIOLENCE", "FAMILY"], courts: ["DISTRICT", "FAMILY_COURT"], languages: ["en", "hi", "pa"], bio: "Domestic-violence protection orders and bail matters. Legal aid panel, Dwarka.", officeAddress: "C-2/14, Janakpuri", city: "New Delhi", pincode: "110058", latitude: 28.6219, longitude: 77.0878, legalAidPanel: true, proBono: true },
  { fullName: "Vikram Chauhan", gender: "MALE", barCouncil: "DL", enrolmentYear: 2013, practiceAreas: ["CHEQUE_BOUNCE", "CIVIL", "CONSUMER"], courts: ["MAGISTRATE", "CONSUMER_COMMISSION"], languages: ["en", "hi"], bio: "Cheque-bounce, recovery suits and consumer complaints.", officeAddress: "16/4, Arya Samaj Road, Karol Bagh", city: "New Delhi", pincode: "110005", latitude: 28.6519, longitude: 77.1909 },
  { fullName: "Neha Agarwal", gender: "FEMALE", barCouncil: "DL", enrolmentYear: 2018, practiceAreas: ["LABOUR", "SERVICE", "CONSTITUTIONAL"], courts: ["LABOUR_COURT", "HIGH_COURT"], languages: ["en", "hi", "gu"], bio: "Wage claims, wrongful termination and service writs.", officeAddress: "Pocket 2, Mayur Vihar Phase 1", city: "Delhi", pincode: "110091", latitude: 28.6045, longitude: 77.2945 },
  { fullName: "Sameer Khan", gender: "MALE", barCouncil: "DL", enrolmentYear: 2019, practiceAreas: ["CRIMINAL", "CYBER", "MOTOR_ACCIDENT"], courts: ["MAGISTRATE", "DISTRICT"], languages: ["en", "hi", "ur"], bio: "Criminal and accident-claim matters in East Delhi.", officeAddress: "D-112, Laxmi Nagar", city: "Delhi", pincode: "110092", latitude: 28.6304, longitude: 77.2773, acceptingClients: false },
  { fullName: "Anjali Verma", gender: "FEMALE", barCouncil: "PB", enrolmentYear: 2014, practiceAreas: ["CRIMINAL", "FAMILY"], courts: ["DISTRICT"], languages: ["en", "hi"], bio: "District Court, Gurugram. Bail and matrimonial matters.", officeAddress: "Chamber 51, District Court Complex", city: "Gurugram", pincode: "122001", latitude: 28.4595, longitude: 77.0266, legalAidPanel: true },
  { fullName: "Rohit Mishra", gender: "MALE", barCouncil: "UP", enrolmentYear: 2012, practiceAreas: ["PROPERTY", "CONSUMER", "CHEQUE_BOUNCE"], courts: ["DISTRICT", "CONSUMER_COMMISSION"], languages: ["en", "hi", "bho"], bio: "Property registration disputes and consumer complaints in Noida.", officeAddress: "Office 7, Sector 18 Market", city: "Noida", pincode: "201301", latitude: 28.5708, longitude: 77.326 },
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
