"use client";

import { useState } from "react";
import Link from "next/link";
import { Scale, MailCheck, ArrowLeft } from "lucide-react";
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <Scale className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {sent ? (
              <div className="flex flex-col items-center text-center py-2 space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <MailCheck className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-900">Check your inbox</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    We sent a password reset link to <span className="font-medium text-slate-700">{email}</span>.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setSent(false)}
                >
                  Resend email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Email address
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
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}