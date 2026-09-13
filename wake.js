const { PrismaClient } = require('@prisma/client');

async function wakeDb() {
  const url = "postgresql://neondb_owner:npg_IL5ZaWktYqX2@ep-patient-wind-axcc6jwj.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require";
  const prisma = new PrismaClient({
    datasources: {
      db: { url }
    }
  });
  
  console.log("Connecting to DB to wake it up...");
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("DB is awake!");
  } catch (err) {
    console.error("Connection failed:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

wakeDb();
