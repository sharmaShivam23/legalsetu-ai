"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Mic,
  FileText,
  Scale,
  Languages,
  ShieldCheck,
  Search,
  ArrowRight,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SplashScreen from "@/components/common/SplashScreen";

const FEATURES = [
  {
    icon: Languages,
    title: "Multilingual by Design",
    desc: "Ask in Hindi, Bhojpuri, Maithili, Tamil, Bengali and 10+ more Indian languages. Interface, voice, and response languages are all independently selectable.",
  },
  {
    icon: Mic,
    title: "Voice-First Interaction",
    desc: "Speak your question naturally. Built for users who find text-heavy interfaces difficult to navigate.",
  },
  {
    icon: Search,
    title: "Source-Grounded Answers",
    desc: "Every legal answer is retrieved from verified legal sources with visible citations — never fabricated.",
  },
  {
    icon: FileText,
    title: "Document Understanding",
    desc: "Upload a notice, agreement, or legal letter and get a plain-language explanation of what it means.",
  },
  {
    icon: Scale,
    title: "Guided FIR Assistant",
    desc: "A step-by-step conversational flow helps you prepare a complete, well-organized FIR draft.",
  },
  {
    icon: ShieldCheck,
    title: "Responsible AI",
    desc: "Evidence-level indicators, escalation to human legal aid, and a strict no-fabrication policy on every response.",
  },
] as const;

const STEPS = [
  { n: "01", title: "Ask", desc: "Type, speak, or upload a document in your language." },
  { n: "02", title: "Retrieve", desc: "LegalSetu searches a verified legal source database." },
  { n: "03", title: "Ground", desc: "The AI answers strictly from retrieved, cited sources." },
  { n: "04", title: "Guide", desc: "You get a clear answer, sources, and next steps." },
] as const;

export default function LandingPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <SplashScreen />

      {/* Embedded CSS scoped to landing page styles */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(1.5deg); }
        }
        @keyframes float-reverse {
          0%, 100% { transform: translateY(0) rotate(0deg) scale(1); }
          50% { transform: translateY(10px) rotate(-1.5deg) scale(1.02); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes beam {
          0% { transform: translateX(-100%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(200%); opacity: 0; }
        }

        .animate-float { animation: float 7s ease-in-out infinite; }
        .animate-float-delayed { animation: float-reverse 8s ease-in-out 1s infinite; }
        .bg-animate-gradient { background-size: 200% 200%; animation: gradient-shift 10s ease infinite; }
        
        .ring-pulse::before {
          content: ''; position: absolute; inset: 0; border-radius: 50%;
          border: 2px solid rgba(16, 185, 129, 0.4); 
          animation: pulse-ring 2.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }

        .perspective-container { perspective: 1200px; transform-style: preserve-3d; }
        .card-3d {
          transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.6s ease;
          transform-style: preserve-3d;
          will-change: transform;
        }
        .perspective-container:hover .card-3d {
          transform: rotateY(6deg) rotateX(4deg) translateY(-8px) translateZ(20px);
          box-shadow: -20px 20px 40px -10px rgba(15, 23, 42, 0.15), 0 0 20px rgba(255, 255, 255, 0.8);
        }
        
        .card-content-3d {
          transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1);
          transform: translateZ(0);
        }
        .perspective-container:hover .card-content-3d {
          transform: translateZ(40px);
        }
      `}</style>

      <main className="min-h-screen bg-slate-50 dark:bg-[#0B1120] font-sans selection:bg-blue-500 selection:text-white overflow-hidden transition-colors duration-200">
        
        {/* Navigation */}
        <header className="fixed left-0 right-0 top-6 z-50 mx-auto max-w-6xl px-6 transition-all duration-300">
          <div className="flex items-center justify-between rounded-full border border-slate-200/80 dark:border-white/20 bg-white/80 dark:bg-slate-900/80 px-6 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-inner">
                <Scale className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="font-serif text-lg font-bold tracking-wide text-slate-900 dark:text-white">
                Legal<span className="text-blue-600 dark:text-blue-400">Setu</span>
              </span>
            </div>
            
            <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex" aria-label="Main Navigation">
              <a href="#how-it-works" className="transition-colors hover:text-slate-900 dark:hover:text-white">How it works</a>
              <a href="#features" className="transition-colors hover:text-slate-900 dark:hover:text-white">Features</a>
              <a href="#trust" className="transition-colors hover:text-slate-900 dark:hover:text-white">Trust &amp; Sources</a>
              <a href="#research" className="transition-colors hover:text-slate-900 dark:hover:text-white">Research</a>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Theme Toggle Button */}
              {mounted && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4 text-amber-400" />
                  ) : (
                    <Moon className="h-4 w-4 text-slate-700" />
                  )}
                </Button>
              )}

              <Link href="/login">
                <Button variant="ghost" className="rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button className="rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-slate-800 dark:hover:bg-slate-100">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative flex min-h-screen items-center justify-center pt-24 bg-slate-100 dark:bg-[#0B1120]">
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="bg-animate-gradient absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-100/50 dark:from-[#0B1120] dark:via-[#111827] dark:to-[#1E1B4B] opacity-90"></div>
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[900px] rounded-[100%] bg-blue-500/10 dark:bg-blue-600/20 blur-[120px]"></div>
            <div className="absolute bottom-1/4 right-0 h-[400px] w-[600px] rounded-[100%] bg-indigo-500/10 blur-[100px]"></div>
          </div>

          <div className="relative z-10 mx-auto max-w-5xl px-6 py-12 text-center perspective-container">
            <div className="card-3d mb-8 inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-5 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 backdrop-blur-md shadow-xs">
              <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              Research-grade legal information platform
            </div>
            
            <h1 className="font-serif text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-7xl lg:text-8xl drop-shadow-xs dark:drop-shadow-2xl">
              Understand your rights.
              <br />
              <span className="bg-animate-gradient bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 dark:from-blue-300 dark:via-white dark:to-blue-300 bg-clip-text text-transparent">
                In your language.
              </span>
            </h1>
            
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300 sm:text-xl">
              LegalSetu is a multilingual, voice-first AI assistant that helps
              Indian citizens understand legal information, documents, and the
              FIR process — grounded strictly in verified legal sources.
            </p>
            
            <div className="mt-12 flex flex-col items-center justify-center gap-5 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="group relative h-14 overflow-hidden rounded-full bg-blue-600 dark:bg-blue-500 px-8 text-base font-bold text-white shadow-lg shadow-blue-500/20 dark:shadow-[0_0_40px_rgba(59,130,246,0.4)] transition-all hover:-translate-y-1 hover:scale-105 hover:bg-blue-700 dark:hover:bg-blue-400">
                  <span className="relative z-10 flex items-center gap-2">
                    Ask LegalSetu <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </span>
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[beam_1s_ease-in-out]"></div>
                </Button>
              </Link>
              <a href="#features">
                <Button variant="outline" size="lg" className="h-14 rounded-full border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/50 px-8 text-base font-semibold text-slate-800 dark:text-slate-300 backdrop-blur-md transition-all hover:bg-slate-100 dark:hover:bg-white hover:text-slate-900">
                  Explore Features
                </Button>
              </a>
            </div>
            
            <p className="mt-10 text-xs font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">
              LegalSetu provides legal information, not legal advice.
            </p>
          </div>
          
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-slate-50 dark:from-[#0B1120] to-transparent pointer-events-none"></div>
        </section>

        {/* Process Flow Section */}
        <section id="how-it-works" className="relative overflow-hidden bg-slate-900 dark:bg-[#0B1120] py-32 text-white">
          <div className="relative z-10 mx-auto max-w-6xl px-6">
            <div className="mb-20 text-center">
              <h2 className="text-sm font-bold uppercase tracking-widest text-blue-400">
                How It Works
              </h2>
              <p className="mt-4 font-serif text-4xl font-bold sm:text-5xl">From Question to Clarity</p>
            </div>
            
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-4">
              {STEPS.map((s, idx) => (
                <div key={s.n} className="perspective-container h-full">
                  <div className="card-3d relative h-full rounded-3xl border border-white/10 bg-slate-800/60 dark:bg-slate-900/60 p-8 backdrop-blur-sm">
                    <div className="card-content-3d">
                      <div className="absolute -right-2 -top-6 text-8xl font-black text-white/5" aria-hidden="true">
                        {s.n}
                      </div>
                      <div className="relative z-10 mt-6">
                        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 dark:bg-blue-500 text-white font-bold shadow-md">
                          {idx + 1}
                        </div>
                        <h3 className="text-2xl font-bold text-white">{s.title}</h3>
                        <p className="mt-4 leading-relaxed text-slate-300 dark:text-slate-400">{s.desc}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="mx-auto max-w-7xl px-6 py-32 bg-slate-50 dark:bg-[#0B1120]">
          <div className="mb-20 text-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
              Core Features
            </h2>
            <p className="mt-4 font-serif text-4xl font-bold text-slate-900 dark:text-white sm:text-5xl">Built for Accessibility &amp; Accuracy</p>
          </div>
          
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="perspective-container">
                <Card className="card-3d relative h-full overflow-hidden border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/80 backdrop-blur-sm shadow-xs">
                  <CardHeader className="card-content-3d relative z-10 pb-4">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20 shadow-xs">
                      <f.icon className="h-8 w-8" aria-hidden="true" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="card-content-3d relative z-10">
                    <p className="text-lg leading-relaxed text-slate-600 dark:text-slate-400">{f.desc}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </section>

        {/* Trust Section */}
        <section id="trust" className="relative border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-32 overflow-hidden">
          <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
            <div className="relative mb-10 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-pulse z-10">
              <ShieldCheck className="h-12 w-12" aria-hidden="true" />
            </div>
            
            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Trust &amp; Sources
            </h2>
            <p className="mt-6 font-serif text-4xl font-bold text-slate-900 dark:text-white sm:text-6xl drop-shadow-xs">
              Every legal answer is grounded. <br className="hidden sm:block"/> Never invented.
            </p>
            <p className="mx-auto mt-8 max-w-3xl text-xl leading-relaxed text-slate-600 dark:text-slate-300">
              LegalSetu only answers legal-fact questions using verified,
              administrator-ingested legal sources. If sufficient evidence
              isn&apos;t available, it says so explicitly rather than guessing.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-slate-900 dark:bg-[#0B1120] py-12 border-t border-slate-800 relative z-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-white/10">
                <Scale className="h-4 w-4 text-blue-400" aria-hidden="true" />
              </div>
              <span className="font-serif text-xl font-bold text-white tracking-wide">LegalSetu</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-sm text-slate-400 sm:items-end">
              <span>&copy; {new Date().getFullYear()} LegalSetu — Research Project</span>
              <span className="font-medium text-slate-500">Not a substitute for professional legal advice.</span>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}