"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
const PenCompanion = dynamic(() => import("@/components/Home/PenCompanion"), { ssr: false });
const HeroBackground = dynamic(() => import("@/components/Home/HeroBackground"), { ssr: false });
import {
  FileText,
  Scale,
  Languages,
  ShieldCheck,
  Search,
  ArrowRight,
  Sparkles,
  Sun,
  Moon,
  MessageCircleQuestion,
  Users2,
  ListChecks,
  MessagesSquare,
  Folder,
  FileSignature,
  BookMarked,
  Users,
  Brain,
  ServerCog,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SplashScreen from "@/components/common/SplashScreen";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";

// Every product surface below corresponds 1:1 to a real, working
// dashboard section (see components/dashboard/sidebar.tsx) — nothing
// here describes a feature that doesn't exist yet.
const FEATURES = [
  {
    icon: MessagesSquare,
    title: "Ask LegalSetu",
    desc: "Four focused chat modes — Quick Answer, Case Analysis, Know the Law, and Generate FIR — so the AI asks the right follow-up questions instead of guessing.",
  },
  {
    icon: Folder,
    title: "My Cases",
    desc: "Every chat, document, and FIR draft about one matter, linked together with a next-step reminder so nothing falls through the cracks.",
  },
  {
    icon: FileText,
    title: "Document OCR",
    desc: "Upload a notice, agreement, or letter — LegalSetu extracts the text and explains what it actually means, in plain language.",
  },
  {
    icon: FileSignature,
    title: "FIR Assistant",
    desc: "A guided, step-by-step wizard turns your account of events into a complete, well-organized complaint draft you can export as a PDF.",
  },
  {
    icon: BookMarked,
    title: "Saved Sources",
    desc: "Bookmark the exact verified law sections you rely on, with the real text kept alongside your own notes for quick reference.",
  },
  {
    icon: Users,
    title: "Lawyer / Legal Aid",
    desc: "A directory of verified government helplines — NALSA, cyber crime, women's and child helplines — plus a private request tracker.",
  },
  {
    icon: Brain,
    title: "History & Memory",
    desc: "Every conversation saved and searchable by mode, and the assistant remembers relevant context across sessions so you don't repeat yourself.",
  },
  {
    icon: Languages,
    title: "16 Languages, Voice-First",
    desc: "Speak or type in Hindi, Tamil, Bengali and 13 more. Interface, response, and voice languages are all independently selectable.",
  },
] as const;

const STEPS = [
  { n: "01", title: "Ask", desc: "Type, speak, or upload a document — in whichever language is comfortable for you." },
  { n: "02", title: "Retrieve", desc: "LegalSetu searches a verified legal source database, not general internet text." },
  { n: "03", title: "Ground", desc: "The AI answers strictly from what it retrieved, with visible citations attached." },
  { n: "04", title: "Guide", desc: "You get a clear next step — a plain-language answer, a saved case, or a complaint draft." },
] as const;

const CLARITY = [
  {
    icon: MessageCircleQuestion,
    label: "About",
    body: "An AI assistant that answers legal questions using real Indian law — not general chatbot guessing — and helps you act on them.",
  },
  {
    icon: Users2,
    label: "Who is it for?",
    body: "Anyone who's received a legal notice, needs to file a police complaint, or just wants to understand their rights — no legal background needed.",
  },
  {
    icon: ListChecks,
    label: "How do I start?",
    body: "Create a free account, open \"Ask LegalSetu,\" and type or speak your situation in your own language. That's it.",
  },
] as const;

const FACTS = [
  { value: "16", label: "Languages supported" },
  { value: "4", label: "Specialised AI chat modes" },
  { value: "7", label: "Verified government helplines" },
  { value: "3+1", label: "AI providers with automatic failover" },
] as const;

function LanguageMarquee() {
  const names = SUPPORTED_LANGUAGES.map((l) => l.nativeName);
  const loop = [...names, ...names];
  return (
    <div className="relative overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <motion.div
        className="flex w-max gap-8 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 28, ease: "linear", repeat: Infinity }}
      >
        {loop.map((name, i) => (
          <span
            key={`${name}-${i}`}
            data-no-translate
            className="font-serif text-2xl font-semibold text-slate-400/70 dark:text-slate-600 sm:text-3xl"
          >
            {name}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export default function LandingPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <SplashScreen />

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(1.5deg); }
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

      <main className="min-h-screen overflow-hidden bg-slate-50 font-sans transition-colors duration-200 selection:bg-blue-500 selection:text-white dark:bg-[#0B1120]">
        {/* Travels the page, docking into a fixed slot per section. */}
        <PenCompanion />

        {/* Navigation */}
        <header className="fixed left-0 right-0 top-6 z-50 mx-auto max-w-6xl px-6 transition-all duration-300">
          <div className="flex items-center justify-between rounded-full border border-slate-200/80 bg-white/80 px-6 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl dark:border-white/20 dark:bg-slate-900/80 dark:shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-inner">
                <Scale className="h-4 w-4" aria-hidden="true" />
              </div>
              <span data-no-translate className="font-serif text-lg font-bold tracking-wide text-slate-900 dark:text-white">
                Legal<span className="text-blue-600 dark:text-blue-400">Setu</span>
              </span>
            </div>

            <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex dark:text-slate-300" aria-label="Main Navigation">
              <a href="#what-is-this" className="transition-colors hover:text-slate-900 dark:hover:text-white">About</a>
              <a href="#how-it-works" className="transition-colors hover:text-slate-900 dark:hover:text-white">How it works</a>
              <a href="#features" className="transition-colors hover:text-slate-900 dark:hover:text-white">Features</a>
              <a href="#trust" className="transition-colors hover:text-slate-900 dark:hover:text-white">Trust &amp; Sources</a>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSwitcher variant="navbar" />

              {mounted && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
                </Button>
              )}

              <Link href="/login">
                <Button variant="ghost" className="rounded-full text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button className="rounded-full bg-slate-900 text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section id="hero" className="relative flex min-h-screen items-center bg-slate-100 pt-32 pb-16 dark:bg-[#0B1120]">
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="bg-animate-gradient absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-100/50 opacity-90 dark:from-[#0B1120] dark:via-[#111827] dark:to-[#1E1B4B]" />
            <div className="absolute top-1/4 left-1/2 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-blue-500/10 blur-[120px] dark:bg-blue-600/20" />
          </div>

          {/* Courthouse colonnade — 3D, behind the headline */}
          <HeroBackground isDark={theme !== "light"} />

          {/* Keeps the headline legible over the 3D scene */}
          <div
            className="absolute inset-0 bg-gradient-to-b from-slate-100/70 via-slate-100/40 to-slate-100 dark:from-[#0B1120]/70 dark:via-[#0B1120]/40 dark:to-[#0B1120]"
            aria-hidden="true"
          />

          <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-5 py-2 text-sm font-medium text-blue-700 shadow-xs backdrop-blur-md dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
              <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              AI legal help, grounded in real Indian law
            </div>

            <h1 className="font-serif text-5xl font-extrabold tracking-tight text-slate-900 drop-shadow-xs sm:text-6xl lg:text-7xl dark:text-white dark:drop-shadow-2xl">
              Understand your rights.
              <br />
              <span className="bg-animate-gradient bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent dark:from-blue-300 dark:via-white dark:to-blue-300">
                In your language.
              </span>
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl dark:text-slate-300">
              Ask about a legal notice, prepare a police complaint, or find verified
              legal aid — LegalSetu answers using real Indian law, in any of 16
              languages, by text or by voice.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-5 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="group relative h-14 overflow-hidden rounded-full bg-blue-600 px-8 text-base font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-1 hover:scale-105 hover:bg-blue-700 dark:bg-blue-500 dark:shadow-[0_0_40px_rgba(59,130,246,0.4)] dark:hover:bg-blue-400">
                  <span className="relative z-10 flex items-center gap-2">
                    Get started free <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </span>
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[beam_1s_ease-in-out]" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="outline" size="lg" className="h-14 rounded-full border-slate-300 bg-white/80 px-8 text-base font-semibold text-slate-800 backdrop-blur-md transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-white dark:hover:text-slate-900">
                  See how it works
                </Button>
              </a>
            </div>

            <p className="mt-10 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              LegalSetu provides legal information, not legal advice.
            </p>
          </div>
        </section>

        {/* Instant clarity strip */}
        <section id="what-is-this" className="border-y border-slate-200 bg-white py-20 dark:border-slate-800 dark:bg-slate-950">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              {CLARITY.map((c, i) => (
                <Reveal key={c.label} delay={i * 0.1}>
                  <div className="flex h-full flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                      <c.icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{c.label}</h3>
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{c.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Process Flow */}
        <section id="how-it-works" className="relative overflow-hidden bg-slate-900 py-32 text-white dark:bg-[#0B1120]">
          <div className="relative z-10 mx-auto max-w-6xl px-6">
            <Reveal>
              <div className="mb-20 text-center">
                <h2 className="text-sm font-bold uppercase tracking-widest text-blue-400">How It Works</h2>
                <p className="mt-4 font-serif text-4xl font-bold sm:text-5xl">From Question to Clarity</p>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-4">
              {STEPS.map((s, idx) => (
                <Reveal key={s.n} delay={idx * 0.1}>
                  <div className="perspective-container h-full">
                    <div className="card-3d relative h-full rounded-3xl border border-white/10 bg-slate-800/60 p-8 backdrop-blur-sm dark:bg-slate-900/60">
                      <div className="card-content-3d">
                        <div className="absolute -right-2 -top-6 text-8xl font-black text-white/5" aria-hidden="true">
                          {s.n}
                        </div>
                        <div className="relative z-10 mt-6">
                          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 font-bold text-white shadow-md dark:bg-blue-500">
                            {idx + 1}
                          </div>
                          <h3 className="text-2xl font-bold text-white">{s.title}</h3>
                          <p className="mt-4 leading-relaxed text-slate-300 dark:text-slate-400">{s.desc}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Language showcase */}
        <section id="languages" className="bg-slate-50 py-14 dark:bg-[#0B1120]">
          <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">
            Every screen, every answer, every one of these
          </p>
          <LanguageMarquee />
        </section>

        {/* Features Grid */}
        <section id="features" className="mx-auto max-w-7xl bg-slate-50 px-6 py-32 dark:bg-[#0B1120]">
          <Reveal>
            <div className="mb-20 text-center">
              <h2 className="text-sm font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Core Features</h2>
              <p className="mt-4 font-serif text-4xl font-bold text-slate-900 sm:text-5xl dark:text-white">Everything in the Dashboard</p>
              <p className="mx-auto mt-4 max-w-2xl text-base text-slate-500 dark:text-slate-400">
                Every card below is a real, working section of the product — not a roadmap promise.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 4) * 0.08}>
                <div className="perspective-container h-full">
                  <Card className="card-3d relative h-full overflow-hidden border-slate-200 bg-white shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/80">
                    <CardHeader className="card-content-3d relative z-10 pb-3">
                      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 shadow-xs dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400">
                        <f.icon className="h-7 w-7" aria-hidden="true" />
                      </div>
                      <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">{f.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="card-content-3d relative z-10">
                      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.desc}</p>
                    </CardContent>
                  </Card>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Real facts strip — every number here is a structural fact about
            the product, verifiable in the codebase, never a vanity metric. */}
        <section id="facts" className="border-y border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-950">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 sm:grid-cols-4">
            {FACTS.map((f, i) => (
              <Reveal key={f.label} delay={i * 0.08}>
                <div className="text-center">
                  <p className="font-serif text-4xl font-extrabold text-blue-600 sm:text-5xl dark:text-blue-400">{f.value}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{f.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Trust Section */}
        <section id="trust" className="relative overflow-hidden border-y border-slate-200 bg-white py-32 dark:border-slate-800 dark:bg-slate-950">
          <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
            <Reveal>
              <div className="relative z-10 mb-10 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-pulse dark:bg-emerald-500/10 dark:text-emerald-400">
                <ShieldCheck className="h-12 w-12" aria-hidden="true" />
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Trust &amp; Sources</h2>
              <p className="mt-6 font-serif text-4xl font-bold text-slate-900 drop-shadow-xs sm:text-6xl dark:text-white">
                Every legal answer is grounded. <br className="hidden sm:block" /> Never invented.
              </p>
              <p className="mx-auto mt-8 max-w-3xl text-xl leading-relaxed text-slate-600 dark:text-slate-300">
                LegalSetu only answers legal-fact questions using verified,
                administrator-ingested legal sources. If sufficient evidence isn&apos;t
                available, it says so explicitly rather than guessing — and every
                citation links back to the original source so you can check it yourself.
              </p>
            </Reveal>

            <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {[
                { icon: Search, title: "Source-cited answers", desc: "Every legal claim links to the verified source it came from." },
                { icon: Layers, title: "Provenance-tracked facts", desc: "Facts you state, documents you upload, and AI inferences are never mixed up silently." },
                { icon: ServerCog, title: "3-provider AI failover", desc: "If one AI provider hits a rate limit, the next takes over automatically." },
              ].map((t, i) => (
                <Reveal key={t.title} delay={0.15 + i * 0.08}>
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/60">
                    <t.icon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{t.title}</h4>
                    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        {/* No z-index here on purpose: z-10 would stack the footer above
            the pen's fixed overlay and swallow it on the last section. */}
        <footer id="site-footer" className="relative overflow-hidden border-t border-slate-800 bg-slate-900 dark:bg-[#0B1120]">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[900px] -translate-x-1/2 rounded-[100%] bg-blue-600/10 blur-[120px]" aria-hidden="true" />

          <div className="relative mx-auto max-w-7xl px-6 py-16">
            <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
              {/* Brand */}
              <div className="lg:col-span-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
                    <Scale className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span data-no-translate className="font-serif text-xl font-bold tracking-wide text-white">
                    Legal<span className="text-blue-400">Setu</span>
                  </span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-400">
                  A multilingual AI legal assistant that answers from verified Indian law —
                  and shows you the source every time.
                </p>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-emerald-300">Source-grounded, never invented</span>
                </div>
              </div>

              {/* Explore */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Explore</h3>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {[
                    { href: "#About", label: "About" },
                    { href: "#how-it-works", label: "How it works" },
                    { href: "#features", label: "Features" },
                    { href: "#trust", label: "Trust & Sources" },
                  ].map((l) => (
                    <li key={l.href}>
                      <a href={l.href} className="text-slate-400 transition-colors hover:text-white">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Get started */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Get started</h3>
                <ul className="mt-4 space-y-2.5 text-sm">
                  <li>
                    <Link href="/register" className="text-slate-400 transition-colors hover:text-white">
                      Create a free account
                    </Link>
                  </li>
                  <li>
                    <Link href="/login" className="text-slate-400 transition-colors hover:text-white">
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link href="/forgot-password" className="text-slate-400 transition-colors hover:text-white">
                      Reset your password
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Real, verified helplines — the same rows the Legal Aid
                  directory is seeded with, each checked on the issuing
                  government body's own site. */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Need help now?</h3>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {[
                    { number: "112", label: "Police emergency" },
                    { number: "15100", label: "NALSA free legal aid" },
                    { number: "181", label: "Women helpline" },
                    { number: "1930", label: "Cyber crime" },
                  ].map((h) => (
                    <li key={h.number} className="flex items-center gap-2.5">
                      <a
                        href={`tel:${h.number}`}
                        data-no-translate
                        className="min-w-[52px] rounded-md bg-white/5 px-2 py-0.5 text-center font-mono text-xs font-bold text-blue-300 transition-colors hover:bg-white/10"
                      >
                        {h.number}
                      </a>
                      <span className="text-slate-400">{h.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  Official Government of India helplines.
                </p>
              </div>
            </div>

            <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
              <p className="text-xs text-slate-500">
                &copy; {new Date().getFullYear()} LegalSetu — final-year research project.
              </p>
              <p className="text-xs font-medium text-slate-500">
                Provides legal information, not legal advice. Not a substitute for a qualified lawyer.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
