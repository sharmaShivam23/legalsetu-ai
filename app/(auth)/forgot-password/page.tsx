"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Scale, Mail, Lock, Loader2, ArrowRight, ArrowLeft, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/auth/otp-input";
import { toast } from "sonner";

const RESEND_COOLDOWN_S = 45;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      toast.success(data?.data?.message || "If an account exists for that email, a code has been sent.");
      setStep("reset");
      setResendCooldown(RESEND_COOLDOWN_S);
    } catch {
      toast.error("Could not send a code right now. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function resendCode() {
    if (resendCooldown > 0) return;
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "PASSWORD_RESET" }),
      });
      const data = await res.json();
      toast.success(data?.data?.message || "A new code has been sent.");
      setResendCooldown(RESEND_COOLDOWN_S);
      setCode("");
      setCodeError(false);
    } catch {
      toast.error("Could not resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }

    setResetting(true);
    setCodeError(false);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCodeError(true);
        toast.error(data?.error?.message || "That code is incorrect or has expired.");
        return;
      }

      toast.success("Password reset! Please sign in with your new password.");
      router.push("/login");
    } catch {
      toast.error("Could not reset your password right now. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen bg-slate-50 dark:bg-[#0B1120] font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-200">
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
                <KeyRound className={`h-32 w-32 ${i === 0 ? "text-indigo-600 dark:text-white" : "text-indigo-200 dark:text-indigo-600"}`} strokeWidth={1.5} />
              </div>
            ))}
          </div>
          <h2 className="font-serif text-4xl font-bold tracking-widest text-slate-900 dark:text-white drop-shadow-xs">LEGALSETU</h2>
          <p className="mt-4 max-w-sm text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Reset codes expire in 10 minutes and can only be used once.
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

          {step === "email" ? (
            <>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Reset your password</h1>
              <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm">
                Enter your account email and we&apos;ll send you a 6-digit code.
              </p>

              <form onSubmit={requestCode} className="space-y-6 scene-3d">
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

                <button
                  type="submit"
                  disabled={sending}
                  className="btn-3d relative mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-indigo-600 text-base font-bold text-white hover:bg-indigo-500 transition-colors"
                >
                  {sending ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      Send reset code <ArrowRight className="h-5 w-5" />
                    </span>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep("email")}
                className="mb-6 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Use a different email
              </button>

              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Enter your new password</h1>
              <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm">
                Enter the code sent to <span className="font-semibold text-slate-700 dark:text-slate-300" data-no-translate>{email}</span> along with your new password.
              </p>

              <form onSubmit={submitReset} className="space-y-6 scene-3d">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">6-digit code</label>
                  <OtpInput value={code} onChange={setCode} disabled={resetting} error={codeError} />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New password</label>
                  <div className="input-float relative rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="h-14 w-full border-none bg-transparent pl-12 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Confirm new password</label>
                  <div className="input-float relative rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Retype your new password"
                      className="h-14 w-full border-none bg-transparent pl-12 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetting}
                  className="btn-3d relative mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-indigo-600 text-base font-bold text-white hover:bg-indigo-500 transition-colors"
                >
                  {resetting ? <Loader2 className="h-6 w-6 animate-spin" /> : <span className="flex items-center gap-2">Reset password <ArrowRight className="h-5 w-5" /></span>}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Didn&apos;t get a code?{" "}
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={resendCooldown > 0 || resending}
                  className="font-bold text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-indigo-400 dark:hover:text-indigo-300 dark:disabled:text-slate-600"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : resending ? "Sending..." : "Resend code"}
                </button>
              </p>
            </>
          )}

          <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
            <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
