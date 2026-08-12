"use client";

import Link from "next/link";
import {
  Mic,
  FileText,
  Scale,
  Languages,
  ShieldCheck,
  Search,
  ArrowRight,
  Sparkles,
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
];

const STEPS = [
  { n: "01", title: "Ask", desc: "Type, speak, or upload a document in your language." },
  { n: "02", title: "Retrieve", desc: "LegalSetu searches a verified legal source database." },
  { n: "03", title: "Ground", desc: "The AI answers strictly from retrieved, cited sources." },
  { n: "04", title: "Guide", desc: "You get a clear answer, sources, and next steps." },
];

export default function LandingPage() {
  return (
    <>
    <SplashScreen />
      <style dangerouslySetInnerHTML={{ __html: `
        /* Premium Smooth Animations */
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

        /* Utility Animation Classes */
        .animate-float { animation: float 7s ease-in-out infinite; }
        .animate-float-delayed { animation: float-reverse 8s ease-in-out 1s infinite; }
        .bg-animate-gradient { background-size: 200% 200%; animation: gradient-shift 10s ease infinite; }
        .ring-pulse::before {
          content: ''; position: absolute; inset: 0; border-radius: 50%;
          border: 2px solid rgba(16, 185, 129, 0.4); animation: pulse-ring 2.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }

        /* 3D Card Engine */
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
        
        /* Inner 3D Pop (makes text/icons float above the card) */
        .card-content-3d {
          transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1);
          transform: translateZ(0);
        }
        .perspective-container:hover .card-content-3d {
          transform: translateZ(40px); /* Pushes content out */
        }
      `}} />

      <main className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-brand-500 selection:text-white overflow-hidden">
        
        {/* Floating Island Nav (Apple/Stripe Style) */}
        <header className="fixed left-0 right-0 top-6 z-50 mx-auto max-w-6xl px-6 transition-all duration-300">
          <div className="flex items-center justify-between rounded-full border border-white/20 bg-slate-900/80 px-6 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-inner">
                <Scale className="h-4 w-4" />
              </div>
              <span className="font-serif text-lg font-bold tracking-wide text-white">
                Legal<span className="text-brand-400">Setu</span>
              </span>
            </div>
            <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 md:flex">
              <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
              <a href="#features" className="transition-colors hover:text-white">Features</a>
              <a href="#trust" className="transition-colors hover:text-white">Trust &amp; Sources</a>
              <a href="#research" className="transition-colors hover:text-white">Research</a>
            </nav>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" className="rounded-full text-slate-300 hover:bg-white/10 hover:text-white">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button className="rounded-full bg-white text-slate-900 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow-white/25">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* 3D Hero Section */}
        <section className="relative flex min-h-[100vh] items-center justify-center pt-24 bg-[#0B1120]">
          {/* Animated Background Mesh */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="bg-animate-gradient absolute inset-0 bg-gradient-to-br from-[#0B1120] via-[#111827] to-[#1E1B4B] opacity-90"></div>
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[900px] rounded-[100%] bg-brand-600/20 blur-[120px]"></div>
            <div className="absolute bottom-1/4 right-0 h-[400px] w-[600px] rounded-[100%] bg-indigo-500/10 blur-[100px]"></div>
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
          </div>

          {/* Abstract 3D Floating Legal Documents in Background */}
          <div className="absolute inset-0 z-0 hidden lg:block overflow-hidden perspective-container">
            <div className="animate-float absolute -left-10 top-1/4 h-64 w-48 rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md transform rotate-12 rotateX(20deg)"></div>
            <div className="animate-float-delayed absolute -right-20 top-1/3 h-80 w-64 rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-lg transform -rotate-12 rotateY(-20deg)"></div>
          </div>

          <div className="relative z-10 mx-auto max-w-5xl px-6 py-12 text-center perspective-container">
            <div className="card-3d mb-8 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-5 py-2 text-sm font-medium text-brand-300 text-white backdrop-blur-md shadow-[0_0_20px_rgba(59,130,246,0.1)]">
              <Sparkles className="h-4 w-4 text-brand-400" />
              Research-grade legal information platform
            </div>
            
            <h1 className="font-serif text-5xl font-extrabold tracking-tight text-white sm:text-7xl lg:text-8xl drop-shadow-2xl">
              Understand your rights.
              <br />
              <span className="bg-animate-gradient bg-gradient-to-r from-brand-300 via-white to-brand-300 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                In your language.
              </span>
            </h1>
            
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-300 sm:text-xl">
              LegalSetu is a multilingual, voice-first AI assistant that helps
              Indian citizens understand legal information, documents, and the
              FIR process — grounded strictly in verified legal sources.
            </p>
            
            <div className="mt-12 flex flex-col items-center justify-center gap-5 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="group relative h-14 overflow-hidden rounded-full bg-brand-500 px-8 text-base font-bold text-white shadow-[0_0_40px_rgba(59,130,246,0.4)] transition-all hover:-translate-y-1 hover:scale-105 hover:bg-brand-400">
                  <span className="relative z-10 flex items-center gap-2">
                    Ask LegalSetu <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </span>
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[beam_1s_ease-in-out]"></div>
                </Button>
              </Link>
              <a href="#features">
                <Button variant="outline" size="lg" className="h-14 rounded-full border-slate-700 bg-slate-900/50 px-8 text-base font-semibold text-slate-300 backdrop-blur-md transition-all hover:bg-white hover:text-slate-900">
                  Explore Features
                </Button>
              </a>
            </div>
            
            <p className="mt-10 text-xs font-bold tracking-widest text-slate-500 opacity-80 uppercase">
              LegalSetu provides legal information, not legal advice.
            </p>
          </div>
          
          {/* Bottom Gradient Fade */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#F8FAFC] to-transparent"></div>
        </section>

        {/* 3D Flow Visual - Bridging the gap */}
        <section className="relative z-20 -mt-20 mx-auto max-w-6xl px-6 perspective-container">
          <div className="card-3d rounded-3xl border border-white/60 bg-white/70 p-6 shadow-2xl shadow-slate-300/50 backdrop-blur-xl sm:p-10">
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-7 relative">
              {/* Connecting glowing line behind items */}
              <div className="hidden sm:block absolute top-1/2 left-[10%] right-[10%] h-[2px] bg-slate-200 -translate-y-1/2 z-0 overflow-hidden rounded-full">
                <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-brand-400 to-transparent opacity-70" style={{ animation: 'beam 3s linear infinite' }}></div>
              </div>

              {["Citizen", "AI Assistant", "Verified Legal Sources", "Guidance"].map(
                (label, i) => (
                  <div key={label} className="col-span-1 flex w-full items-center justify-center sm:col-span-2 last:sm:col-span-1 z-10">
                    <div className="group relative flex h-24 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg transition-all duration-300 hover:-translate-y-2 hover:border-brand-300 hover:shadow-brand-500/20">
                      <div className="absolute inset-0 bg-gradient-to-br from-brand-50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                      <span className="relative z-10 font-bold text-slate-700 transition-colors group-hover:text-brand-600">{label}</span>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="mx-auto max-w-5xl px-6 py-32 text-center perspective-container">
          <div className="card-3d inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold uppercase tracking-widest text-slate-500 shadow-sm">
            The Problem
          </div>
          <h2 className="mx-auto mt-10 max-w-4xl font-serif text-3xl font-bold leading-tight text-slate-900 sm:text-5xl drop-shadow-sm">
            Most citizens cannot afford, access, or understand formal legal
            assistance — especially across India&apos;s language diversity.
          </h2>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-600">
            Language barriers, complex terminology, and text-heavy digital
            systems keep millions of people from understanding basic legal
            information &mdash; from what an FIR requires to what a legal
            notice actually means.
          </p>
        </section>

        {/* How it works - Cascading 3D Cards */}
        <section id="how-it-works" className="relative overflow-hidden bg-[#0B1120] py-32 text-white">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04]"></div>
          
          <div className="relative z-10 mx-auto max-w-6xl px-6">
            <div className="mb-20 text-center">
              <h2 className="text-sm font-bold uppercase tracking-widest text-brand-400">
                How It Works
              </h2>
              <p className="mt-4 font-serif text-4xl font-bold sm:text-5xl">From Question to Clarity</p>
            </div>
            
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-4">
              {STEPS.map((s, idx) => (
                <div key={s.n} className="perspective-container h-full" style={{ zIndex: 4 - idx }}>
                  <div className="card-3d relative h-full rounded-3xl border border-white/10 bg-slate-900/60 p-8 backdrop-blur-sm">
                    {/* Glossy top edge highlight */}
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                    
                    <div className="card-content-3d">
                      <div className="absolute -right-2 -top-6 text-8xl font-black text-white/5 transition-colors duration-500 group-hover:text-brand-500/20">
                        {s.n}
                      </div>
                      <div className="relative z-10 mt-6">
                        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white font-bold shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                          {idx + 1}
                        </div>
                        <h3 className="text-2xl font-bold text-white">{s.title}</h3>
                        <p className="mt-4 leading-relaxed text-slate-400">{s.desc}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Core Features - Interactive Isometric Grid */}
        <section id="features" className="mx-auto max-w-7xl px-6 py-32">
          <div className="mb-20 text-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-brand-500">
              Core Features
            </h2>
            <p className="mt-4 font-serif text-4xl font-bold text-slate-900 sm:text-5xl">Built for Accessibility & Accuracy</p>
          </div>
          
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="perspective-container">
                <Card className="card-3d relative h-full overflow-hidden border-slate-200/60 bg-white/80 backdrop-blur-sm">
                  {/* Hover light reflection effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-transparent to-transparent opacity-0 transition-opacity duration-500 hover:opacity-100 z-0"></div>
                  
                  <CardHeader className="card-content-3d relative z-10 pb-4">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-brand-600 border border-slate-100 shadow-inner">
                      <f.icon className="h-8 w-8" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-slate-900">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="card-content-3d relative z-10">
                    <p className="text-lg leading-relaxed text-slate-600">{f.desc}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </section>

        {/* Trust Section - Animated Verification Scanner */}
        <section id="trust" className="relative border-y border-slate-200 bg-white py-32 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-50/50 via-white to-white"></div>
          
          <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
            {/* Pulsating Shield */}
            <div className="relative mb-10 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-pulse z-10">
              <ShieldCheck className="h-12 w-12" />
              <div className="absolute inset-0 rounded-full border-4 border-white"></div>
            </div>
            
            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-600">
              Trust &amp; Sources
            </h2>
            <p className="mt-6 font-serif text-4xl font-bold text-slate-900 sm:text-6xl drop-shadow-sm">
              Every legal answer is grounded. <br className="hidden sm:block"/> Never invented.
            </p>
            <p className="mx-auto mt-8 max-w-3xl text-xl leading-relaxed text-slate-600">
              LegalSetu only answers legal-fact questions using verified,
              administrator-ingested legal sources. If sufficient evidence
              isn&apos;t available, it says so explicitly rather than guessing.
              Citations always link back to their original source.
            </p>
          </div>
        </section>

        {/* Research gap - Depth/Parallax Box */}
        <section id="research" className="mx-auto max-w-6xl px-6 py-32 perspective-container">
          <div className="card-3d relative overflow-hidden rounded-[2.5rem] bg-[#0B1120] p-10 sm:p-20 border border-slate-800 shadow-2xl">
            {/* Background 3D Scale Icon */}
            <div className="absolute -right-20 -bottom-20 p-12 opacity-5 transform rotate-12 scale-150">
              <Scale className="h-96 w-96 text-white" />
            </div>
            
            {/* Lighting effects */}
            <div className="absolute inset-0 bg-gradient-to-tr from-brand-900/40 via-transparent to-transparent"></div>
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent"></div>
            
            <div className="card-content-3d relative z-10">
              <h2 className="text-sm font-bold uppercase tracking-widest text-brand-400">
                Research Gap &amp; Future Vision
              </h2>
              <p className="mt-8 max-w-3xl font-serif text-3xl leading-relaxed text-white sm:text-4xl drop-shadow-md">
                Existing legal-AI research covers English/Chinese legal reasoning
                benchmarks and enterprise multi-agent architectures, but rarely
                combines a voice-first interface with low-resource Indian languages
                such as Bhojpuri and Maithili in a single accessible system.
              </p>
              <p className="mt-10 max-w-2xl text-xl text-slate-400 leading-relaxed border-l-2 border-brand-500/50 pl-6">
                LegalSetu is built as a research-grade platform to explore exactly
                that gap, with an evaluation architecture for retrieval quality,
                groundedness, and translation accuracy built in from day one.
              </p>
            </div>
          </div>
        </section>

        {/* CTA - Immersive Dark Mode Action */}
        <section className="relative overflow-hidden bg-brand-600 py-32 text-white">
          <div className="bg-animate-gradient absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-500 to-indigo-600 opacity-90"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.05] mix-blend-overlay"></div>
          
          <div className="relative z-10 mx-auto max-w-4xl px-6 text-center perspective-container">
            <h2 className="card-content-3d font-serif text-5xl font-extrabold sm:text-7xl drop-shadow-xl">
              Start understanding your rights today.
            </h2>
            <div className="mt-16 flex justify-center">
              <Link href="/register">
                <Button size="lg" className="group relative h-16 overflow-hidden rounded-full bg-slate-900 px-10 text-lg font-bold text-white shadow-[0_20px_40px_rgba(0,0,0,0.3)] transition-all duration-300 hover:-translate-y-2 hover:scale-105 hover:bg-slate-800">
                  <span className="relative z-10 flex items-center gap-2">
                    Ask LegalSetu <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-2" />
                  </span>
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:animate-[beam_1s_ease-in-out]"></div>
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-[#0B1120] py-12 border-t border-slate-800/50 relative z-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-white/10">
                <Scale className="h-4 w-4 text-brand-400" />
              </div>
              <span className="font-serif text-xl font-bold text-white tracking-wide">LegalSetu</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-sm text-slate-500 sm:items-end">
              <span>&copy; {new Date().getFullYear()} LegalSetu — Research Project</span>
              <span className="font-medium text-slate-400">Not a substitute for professional legal advice.</span>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}