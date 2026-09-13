// app/layout.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { LanguageProvider } from "@/components/providers/LanguageProvider";
import { AutoTranslate } from "@/components/i18n/AutoTranslate";
import { LANGUAGE_COOKIE, getLanguage, normalizeLanguage } from "@/lib/i18n/languages";

export const metadata: Metadata = {
  title: "LegalSetu — AI-Powered Multilingual Legal Assistance",
  description: "Understand your rights in your language.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the saved language on the server so the very first paint
  // carries the right lang/dir attributes (matters for RTL — Urdu).
  const cookieStore = await cookies();
  const initialLanguage = normalizeLanguage(
    cookieStore.get(LANGUAGE_COOKIE)?.value
  );
  const languageDef = getLanguage(initialLanguage);

  return (
    <html
      lang={languageDef.code}
      dir={languageDef.dir}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <AuthSessionProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <LanguageProvider initialLanguage={initialLanguage}>
              {children}
              {/* Translates every rendered string into the chosen
                  language at runtime — no locale files involved. */}
              <AutoTranslate />
              <Toaster position="top-center" richColors />
            </LanguageProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
