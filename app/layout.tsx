// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthSessionProvider } from "@/components/providers/session-provider";

export const metadata: Metadata = {
  title: "LegalSetu — AI-Powered Multilingual Legal Assistance",
  description: "Understand your rights in your language.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <AuthSessionProvider>
          {children}
          <Toaster position="top-center" richColors />
        </AuthSessionProvider>
      </body>
    </html>
  );
}