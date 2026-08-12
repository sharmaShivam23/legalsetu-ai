"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Scale, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        toast.error("Invalid email or password. Please try again.");
      } else {
        toast.success("Welcome back to LegalSetu!");
        router.push("/dashboard");
      }
    } catch (error) {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-[#0B1120] font-sans selection:bg-brand-500 selection:text-white">
      <style dangerouslySetInnerHTML={{ __html: `
        /* 3D Extrusion CSS */
        .scene-3d { perspective: 1000px; transform-style: preserve-3d; }
        .object-3d { position: relative; transform-style: preserve-3d; animation: spin-slow 12s linear infinite; }
        @keyframes spin-slow {
          0% { transform: rotateX(10deg) rotateY(0deg); }
          100% { transform: rotateX(10deg) rotateY(360deg); }
        }
        
        /* 3D Push Button */
        .btn-3d {
          transform-style: preserve-3d;
          transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.1s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 6px 0 0 #1e3a8a, 0 15px 25px rgba(0,0,0,0.5); /* Deep base shadow */
        }
        .btn-3d:active {
          transform: translateY(6px);
          box-shadow: 0 0px 0 0 #1e3a8a, 0 5px 10px rgba(0,0,0,0.5); /* Pressed state */
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

      {/* Left Panel: 3D Visualizer (Hidden on mobile) */}
      <div className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden border-r border-slate-800 bg-slate-950 lg:flex">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>
        <div className="absolute top-1/4 left-1/4 h-[500px] w-[500px] rounded-full bg-brand-600/20 blur-[120px]"></div>

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
                  filter: i === 0 ? "drop-shadow(0 0 30px rgba(59,130,246,0.5))" : "none",
                }}
              >
                <Scale className={`h-32 w-32 ${i === 0 ? "text-white" : "text-brand-600"}`} strokeWidth={1.5} />
              </div>
            ))}
          </div>
          <h2 className="font-serif text-4xl font-bold tracking-widest text-white drop-shadow-xl">LEGALSETU</h2>
          <p className="mt-4 max-w-sm text-center text-sm leading-relaxed text-slate-400">
            Source-grounded legal intelligence. Verify your rights in your language with enterprise-grade accuracy.
          </p>
        </div>
      </div>

      {/* Right Panel: The Form */}
      <div className="flex w-full flex-col justify-center px-6 lg:w-1/2 xl:px-24 relative">
        {/* Mobile background glows */}
        <div className="absolute inset-0 block bg-slate-950 lg:hidden -z-10">
          <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-brand-600/10 blur-[100px]"></div>
        </div>

        <div className="mx-auto w-full max-w-md perspective-container">
          <div className="mb-10 lg:hidden flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg">
              <Scale className="h-6 w-6" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-slate-400 mb-10 text-sm">Access your personalized legal dashboard.</p>

          <form onSubmit={handleSubmit} className="space-y-6 scene-3d">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Email Address</label>
              <div className="input-float relative rounded-xl bg-slate-900 border border-slate-700">
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-14 w-full border-none bg-transparent pl-12 text-white placeholder:text-slate-600 focus-visible:ring-0"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-3d relative mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white hover:bg-brand-400"
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

          <p className="mt-10 text-center text-sm text-slate-400">
            New to LegalSetu?{" "}
            <Link href="/register" className="font-bold text-brand-400 hover:text-white transition-colors">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}