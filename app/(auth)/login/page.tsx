// app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Scale, Mail, Lock, Loader2, ArrowRight, MailQuestion, MailCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/auth/otp-input";
import { toast } from "sonner";

const RESEND_COOLDOWN_S = 45;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showVerifyHelp, setShowVerifyHelp] = useState(false);

  const [verifyOpen, setVerifyOpen] = useState(false);
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
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return false;
    }
    if (!password) {
      toast.error("Please enter your password.");
      return false;
    }
    return true;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setShowVerifyHelp(false);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });

      if (res?.error) {
        toast.error("Invalid email or password, or your email isn't verified yet.");
        setShowVerifyHelp(true);
      } else {
        toast.success("Welcome back to LegalSetu!");
        router.push("/dashboard");
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function sendVerificationCode() {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Enter your email above first.");
      return;
    }
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "EMAIL_VERIFICATION" }),
      });
      const data = await res.json();
      toast.success(data?.data?.message || "If that email needs verifying, a code has been sent.");
      setVerifyOpen(true);
      setResendCooldown(RESEND_COOLDOWN_S);
    } catch {
      toast.error("Could not send a code right now. Please try again.");
    } finally {
      setResending(false);
    }
  }

  async function handleVerify(value: string) {
    setVerifying(true);
    setVerifyError(false);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(true);
        toast.error(data?.error?.message || "That code is incorrect.");
        return;
      }

      toast.success("Email verified! Signing you in...");
      const signInRes = await signIn("credentials", { email, password, redirect: false });
      if (signInRes?.error) {
        toast.error("Verified — please enter your password and sign in.");
        setVerifyOpen(false);
        setShowVerifyHelp(false);
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

  return (
    <main className="relative flex min-h-screen bg-slate-50 dark:bg-[#0B1120] font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_50%,transparent_100%)]"></div>

      <style dangerouslySetInnerHTML={{ __html: `
        .scene-3d { perspective: 1000px; transform-style: preserve-3d; }
        .object-3d { position: relative; transform-style: preserve-3d; animation: spin-slow 12s linear infinite; }
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

      {/* Left Panel: 3D Visualizer (Hidden on mobile) */}
      <div className="relative z-10 hidden w-1/2 flex-col items-center justify-center overflow-hidden border-r border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm lg:flex">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] dark:opacity-[0.03]"></div>
        <div className="absolute top-1/4 left-1/4 h-[500px] w-[500px] rounded-full bg-indigo-500/10 dark:bg-indigo-600/20 blur-[120px]"></div>

        <div className="scene-3d z-10 flex flex-col items-center">
          <div className="object-3d mb-12 h-32 w-32">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translateZ(${i * -5}px)`,
                  opacity: 1 - i * 0.08,
                  filter: i === 0 ? "drop-shadow(0 10px 25px rgba(79,70,229,0.3))" : "none",
                }}
              >
                <Scale className={`h-32 w-32 ${i === 0 ? "text-indigo-600 dark:text-white" : "text-indigo-200 dark:text-indigo-600"}`} strokeWidth={1.5} />
              </div>
            ))}
          </div>
          <h2 className="font-serif text-4xl font-bold tracking-widest text-slate-900 dark:text-white drop-shadow-xs">LEGALSETU</h2>
          <p className="mt-4 max-w-sm text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Source-grounded legal intelligence. Understand your rights in your language.
          </p>
        </div>
      </div>

      {/* Right Panel: The Form */}
      <div className="flex w-full flex-col justify-center px-6 lg:w-1/2 xl:px-24 relative z-10 backdrop-blur-sm">
        <div className="absolute inset-0 block bg-slate-50/50 dark:bg-[#0B1120]/50 lg:hidden -z-10">
          <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-indigo-500/10 dark:bg-indigo-600/10 blur-[100px]"></div>
        </div>

        <div className="mx-auto w-full max-w-md perspective-container">
          <div className="mb-10 lg:hidden flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
              <Scale className="h-6 w-6" />
            </div>
          </div>

          {!verifyOpen ? (
            <>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Welcome Back</h1>
              <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm">Access your personalized legal dashboard.</p>

              <form onSubmit={handleSubmit} className="space-y-6 scene-3d">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email Address</label>
                  <div className="input-float relative rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="h-14 w-full border-none bg-transparent pl-12 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Password</label>
                    <Link href="/forgot-password" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="input-float relative rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-14 w-full border-none bg-transparent pl-12 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-3d relative mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-indigo-600 text-base font-bold text-white hover:bg-indigo-500 transition-colors"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign In <ArrowRight className="h-5 w-5" />
                    </span>
                  )}
                </button>
              </form>

              {showVerifyHelp && (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <MailQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                    <p>If this account was never email-verified, that's why sign-in fails.</p>
                    <button
                      type="button"
                      onClick={sendVerificationCode}
                      disabled={resending}
                      className="mt-1.5 font-bold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200 disabled:opacity-60"
                    >
                      {resending ? "Sending code..." : "Send me a verification code"}
                    </button>
                  </div>
                </div>
              )}

              <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
                New to LegalSetu?{" "}
                <Link href="/register" className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                  Create an account
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <MailCheck className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-3xl font-bold text-slate-900 dark:text-white mb-2">Verify your email</h1>
              <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm">
                Enter the 6-digit code sent to <span className="font-semibold text-slate-700 dark:text-slate-300" data-no-translate>{email}</span>.
              </p>

              <div className="scene-3d">
                <OtpInput value={code} onChange={setCode} onComplete={handleVerify} disabled={verifying} error={verifyError} />
              </div>

              {verifying && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </div>
              )}

              <div className="mt-8 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setVerifyOpen(false)}
                  className="font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Back to sign in
                </button>
                <button
                  type="button"
                  onClick={sendVerificationCode}
                  disabled={resendCooldown > 0 || resending}
                  className="font-bold text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-indigo-400 dark:hover:text-indigo-300 dark:disabled:text-slate-600"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
