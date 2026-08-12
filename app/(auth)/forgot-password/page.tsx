"use client";

import { useState } from "react";
import Link from "next/link";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Password-reset email delivery is not wired to a real mail
    // provider in this scaffold. Wire it via lib/auth before
    // enabling in production.
    setSent(true);
    toast.success("If an account exists for this email, a reset link has been sent.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-white">
            <Scale className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-navy-900">Reset your password</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            {sent ? (
              <p className="text-sm text-slate-600">
                Check your email for a reset link.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-navy-900">
                    Email
                  </label>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <Button type="submit" variant="brand" className="w-full">
                  Send reset link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-brand-500">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
