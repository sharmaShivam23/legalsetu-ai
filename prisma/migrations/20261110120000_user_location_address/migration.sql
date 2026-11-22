-- Address typed at sign-up (private; see UserLocation in schema.prisma).
ALTER TABLE "UserLocation" ADD COLUMN "address" TEXT;
