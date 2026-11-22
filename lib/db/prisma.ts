import { PrismaClient } from "@prisma/client";
import { withConnectTimeout, withDbRetry } from "./retry";

function createClient() {
  const url = withConnectTimeout(process.env.DATABASE_URL);
  const base = new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  // Retry only when the database could not be reached (see lib/db/retry.ts).
  // Typed as a plain PrismaClient: the extension changes behaviour, not the
  // API, and the extended type does not fit helpers that take a PrismaClient
  // or transaction client.
  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        return withDbRetry(() => query(args));
      },
    },
  }) as unknown as PrismaClient;
}

// A new key (v2) so a dev server that already holds the old client picks up
// this one on the next hot reload.
const globalForPrisma = globalThis as unknown as { prismaV2?: PrismaClient };

export const prisma = globalForPrisma.prismaV2 ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaV2 = prisma;
}
