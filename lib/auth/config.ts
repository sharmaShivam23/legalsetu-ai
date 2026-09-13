// lib/auth/config.ts
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logging/logger";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user || !user.passwordHash) return null;

        const validPassword = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!validPassword) {
          logger.warn("Failed login attempt", { userId: user.id });
          return null;
        }

        // Same generic failure as a wrong password — the login page
        // cannot distinguish "unverified" from "wrong credentials"
        // without also being able to confirm an email is registered,
        // which is exactly the enumeration this app avoids everywhere
        // else in auth. The login page always shows a standing "resend
        // verification" link so this never leaves anyone stuck.
        if (!user.emailVerified) {
          logger.warn("Login blocked: email not verified", { userId: user.id });
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
      if (isDashboard) return isLoggedIn;
      return true;
    },
  },
  secret: process.env.AUTH_SECRET,
};