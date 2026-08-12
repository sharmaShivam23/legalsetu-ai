"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Scale, Mail, Lock, User, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

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
        // apiError returns: { success: false, error: { code, message } }
        const errorMessage =
          data?.error?.message ||
          (typeof data?.error === "string" ? data.error : null) ||
          "Registration failed. Please try again.";
        throw new Error(errorMessage);
      }

      // Success — show toast then navigate to login
      toast.success("Account created! Please sign in.", {
        description: "Your LegalSetu account is ready.",
        duration: 3000,
      });

      // Small delay so the user sees the toast before navigating
      setTimeout(() => router.push("/login"), 1200);
    } catch (error: any) {
      toast.error(error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-[#0B1120] font-sans selection:bg-brand-500 selection:text-white">
      <style dangerouslySetInnerHTML={{ __html: `
        /* 3D Extrusion CSS */
        .scene-3d { perspective: 1000px; transform-style: preserve-3d; }
        .object-3d { position: relative; transform-style: preserve-3d; animation: spin-slow 12s linear infinite reverse; }
        @keyframes spin-slow {
          0% { transform: rotateX(10deg) rotateY(0deg); }
          100% { transform: rotateX(10deg) rotateY(360deg); }
        }
        
        /* 3D Push Button */
        .btn-3d {
          transform-style: preserve-3d;
          transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.1s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 6px 0 0 #1e3a8a, 0 15px 25px rgba(0,0,0,0.5); 
        }
        .btn-3d:active {
          transform: translateY(6px);
          box-shadow: 0 0px 0 0 #1e3a8a, 0 5px 10px rgba(0,0,0,0.5); 
        }
        
        /* Floating Input Effect */
        .input-float {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .input-float:focus-within {
          transform: translateY(-2px) translateZ(10px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.3), 0 0 0 2px #3b82f6;
        }
      `}} />

      {/* Right Panel: 3D Visualizer (Hidden on mobile) */}
      <div className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden border-l border-slate-800 bg-slate-950 lg:flex order-last">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>
        <div className="absolute bottom-1/4 right-1/4 h-[500px] w-[500px] rounded-full bg-emerald-600/10 blur-[120px]"></div>

        <div className="scene-3d z-10 flex flex-col items-center">
          {/* Extruded Logo */}
          <div className="object-3d mb-12 h-32 w-32">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translateZ(${i * -5}px)`,
                  opacity: 1 - i * 0.08,
                  filter: i === 0 ? "drop-shadow(0 0 30px rgba(16,185,129,0.3))" : "none",
                }}
              >
                <Scale className={`h-32 w-32 ${i === 0 ? "text-white" : "text-emerald-500"}`} strokeWidth={1.5} />
              </div>
            ))}
          </div>
          <h2 className="font-serif text-3xl font-bold text-white drop-shadow-xl text-center px-10">
            Democratizing Legal Access
          </h2>
          <div className="mt-8 flex items-center gap-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-200">End-to-End Encryption Enabled</span>
          </div>
        </div>
      </div>

      {/* Left Panel: The Form */}
      <div className="flex w-full flex-col justify-center px-6 lg:w-1/2 xl:px-24 relative">
        <div className="absolute inset-0 block bg-slate-950 lg:hidden -z-10"></div>

        <div className="mx-auto w-full max-w-md perspective-container py-12">
          <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-slate-400 mb-10 text-sm">Join LegalSetu to understand your rights in your language.</p>

          <form onSubmit={handleSubmit} className="space-y-5 scene-3d">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Full Name</label>
              <div className="input-float relative rounded-xl bg-slate-900 border border-slate-700">
                <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="John Doe"
                  className="h-14 w-full border-none bg-transparent pl-12 text-white placeholder:text-slate-600 focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Email Address</label>
              <div className="input-float relative rounded-xl bg-slate-900 border border-slate-700">
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@example.com"
                  className="h-14 w-full border-none bg-transparent pl-12 text-white placeholder:text-slate-600 focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Password</label>
              <div className="input-float relative rounded-xl bg-slate-900 border border-slate-700">
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="At least 8 characters"
                  className="h-14 w-full border-none bg-transparent pl-12 text-white placeholder:text-slate-600 focus-visible:ring-0"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-3d relative mt-6 flex h-14 w-full items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white hover:bg-brand-400"
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

          <p className="mt-10 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-brand-400 hover:text-white transition-colors">
              Sign in securely
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}