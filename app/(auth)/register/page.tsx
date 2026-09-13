// app/register/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Scale, Mail, Lock, User, Loader2, ArrowRight, ShieldCheck, ArrowLeft, MailCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/auth/otp-input";
import { toast } from "sonner";

const RESEND_COOLDOWN_S = 45;

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "verify">("form");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const validateForm = () => {
    if (form.name.trim().length < 2) {
      toast.error("Name must be at least 2 characters long.");
      return false;
    }
    if (!form.email || !/^\S+@\S+\.\S+$/.test(form.email)) {
      toast.error("Please enter a valid email address.");
      return false;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return false;
    }
    return true;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessage =
          data?.error?.message ||
          (typeof data?.error === "string" ? data.error : null) ||
          "Registration failed. Please try again.";
        throw new Error(errorMessage);
      }

      setDevMode(Boolean(data?.data?.devMode));
      setResendCooldown(RESEND_COOLDOWN_S);
      setStep("verify");
      toast.success("Almost there — check your email for a 6-digit code.");
    } catch (error: any) {
      toast.error(error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(value: string) {
    setVerifying(true);
    setVerifyError(false);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, code: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(true);
        toast.error(data?.error?.message || "That code is incorrect.");
        return;
      }

      toast.success("Email verified! Signing you in...");
      const signInRes = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (signInRes?.error) {
        toast.success("Account verified — please sign in.");
        router.push("/login");
        return;
      }
      router.push("/dashboard");
    } catch {
      setVerifyError(true);
      toast.error("Could not verify your code. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, purpose: "EMAIL_VERIFICATION" }),
      });
      const data = await res.json();
      toast.success(data?.data?.message || "A new code has been sent.");
      setResendCooldown(RESEND_COOLDOWN_S);
      setCode("");
      setVerifyError(false);
    } catch {
      toast.error("Could not resend the code. Please try again in a moment.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="relative flex min-h-screen bg-slate-50 dark:bg-[#0B1120] font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_50%,transparent_100%)]"></div>

      <style dangerouslySetInnerHTML={{ __html: `
        .scene-3d { perspective: 1000px; transform-style: preserve-3d; }
        .object-3d { position: relative; transform-style: preserve-3d; animation: spin-slow 12s linear infinite reverse; }
        @keyframes spin-slow {
          0% { transform: rotateX(10deg) rotateY(0deg); }
          100% { transform: rotateX(10deg) rotateY(360deg); }
        }
        .btn-3d {
          transform-style: preserve-3d;
          transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.1s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 6px 0 0 #3730a3, 0 15px 25px rgba(79, 70, 229, 0.25);
        }
        .btn-3d:active {
          transform: translateY(6px);
          box-shadow: 0 0px 0 0 #3730a3, 0 5px 10px rgba(79, 70, 229, 0.2);
        }
        .input-float {
          transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
        }
        .input-float:focus-within {
          transform: translateY(-2px) translateZ(10px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.05), 0 0 0 2px #3b82f6;
          border-color: #3b82f6;
        }
      `}} />

      {/* Right Panel: 3D Visualizer (Hidden on mobile) */}
      <div className="relative z-10 hidden w-1/2 flex-col items-center justify-center overflow-hidden border-l border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm lg:flex order-last">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] dark:opacity-[0.03]"></div>
        <div className="absolute bottom-1/4 right-1/4 h-[500px] w-[500px] rounded-full bg-emerald-500/10 dark:bg-emerald-600/10 blur-[120px]"></div>

        <div className="scene-3d z-10 flex flex-col items-center">
          <div className="object-3d mb-12 h-32 w-32">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translateZ(${i * -5}px)`,
                  opacity: 1 - i * 0.08,
                  filter: i === 0 ? "drop-shadow(0 10px 25px rgba(16,185,129,0.25))" : "none",
                }}
              >
                <Scale className={`h-32 w-32 ${i === 0 ? "text-emerald-600 dark:text-white" : "text-emerald-200 dark:text-emerald-600"}`} strokeWidth={1.5} />
              </div>
            ))}
          </div>
          <h2 className="font-serif text-3xl font-bold text-slate-900 dark:text-white drop-shadow-xs text-center px-10">
            Democratizing Legal Access
          </h2>
          <div className="mt-8 flex items-center gap-3 rounded-full border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-5 py-2 shadow-xs">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Passwords hashed — never stored in plain text</span>
          </div>
        </div>
      </div>

      {/* Left Panel: The Form */}
      <div className="flex w-full flex-col justify-center px-6 lg:w-1/2 xl:px-24 relative z-10 backdrop-blur-sm">
        <div className="absolute inset-0 block bg-slate-50/50 dark:bg-[#0B1120]/50 lg:hidden -z-10"></div>

        <div className="mx-auto w-full max-w-md perspective-container py-12">
          <div className="mb-8 lg:hidden flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
              <Scale className="h-6 w-6" />
            </div>
          </div>

          {step === "form" ? (
            <>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Create Account</h1>
              <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm">Join LegalSetu to understand your rights in your language.</p>

              <form onSubmit={handleSubmit} className="space-y-5 scene-3d">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Full Name</label>
                  <div className="input-float relative rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs">
                    <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="John Doe"
                      className="h-14 w-full border-none bg-transparent pl-12 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email Address</label>
                  <div className="input-float relative rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="name@example.com"
                      className="h-14 w-full border-none bg-transparent pl-12 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Password</label>
                  <div className="input-float relative rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="At least 8 characters"
                      className="h-14 w-full border-none bg-transparent pl-12 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-3d relative mt-6 flex h-14 w-full items-center justify-center rounded-xl bg-indigo-600 text-base font-bold text-white hover:bg-indigo-500 transition-colors"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      Create Account <ArrowRight className="h-5 w-5" />
                    </span>
                  )}
                </button>
              </form>

              <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Already have an account?{" "}
                <Link href="/login" className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                  Sign in securely
                </Link>
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep("form")}
                className="mb-6 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Edit details
              </button>

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <MailCheck className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-3xl font-bold text-slate-900 dark:text-white mb-2">Check your email</h1>
              <p className="text-slate-500 dark:text-slate-400 mb-2 text-sm">
                We sent a 6-digit code to <span className="font-semibold text-slate-700 dark:text-slate-300" data-no-translate>{form.email}</span>.
              </p>
              {devMode && (
                <p className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  No email service is configured in this environment — check the server console for your code.
                </p>
              )}
              {!devMode && <div className="mb-8" />}

              <div className="scene-3d">
                <OtpInput value={code} onChange={setCode} onComplete={handleVerify} disabled={verifying} error={verifyError} />
              </div>

              {verifying && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </div>
              )}

              <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Didn&apos;t get a code?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || resending}
                  className="font-bold text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-indigo-400 dark:hover:text-indigo-300 dark:disabled:text-slate-600"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : resending ? "Sending..." : "Resend code"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
