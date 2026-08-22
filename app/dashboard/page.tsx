import Link from "next/link";
import {
  FileText,
  FileSignature,
  ScrollText,
  Search,
  Scale,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Command,
  Bot,
  HelpCircle,
} from "lucide-react";
import { auth } from "@/lib/auth/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Disclaimer } from "@/components/common/disclaimer";

const QUICK_ACTIONS = [
  {
    label: "Understand a legal notice",
    desc: "Extract key implications & response deadlines",
    icon: ScrollText,
    href: "/dashboard/documents",
    badge: "OCR + Analysis",
    color: "from-blue-500/20 to-indigo-500/20",
    borderColor: "group-hover:border-blue-500/50",
    iconBg: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30",
  },
  {
    label: "Create an FIR draft",
    desc: "Guided step-by-step drafting with completeness score",
    icon: FileSignature,
    href: "/dashboard/fir",
    badge: "Guided Assistant",
    color: "from-emerald-500/20 to-teal-500/20",
    borderColor: "group-hover:border-emerald-500/50",
    iconBg: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  },
  {
    label: "Understand my rights",
    desc: "Query legal provisions in 15+ Indian languages",
    icon: Scale,
    href: "/dashboard/chat",
    badge: "Grounded Chat",
    color: "from-amber-500/20 to-orange-500/20",
    borderColor: "group-hover:border-amber-500/50",
    iconBg: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  },
  {
    label: "Analyze an agreement",
    desc: "Spot clause risks, obligations & legal loopholes",
    icon: FileText,
    href: "/dashboard/documents",
    badge: "Doc Insight",
    color: "from-purple-500/20 to-pink-500/20",
    borderColor: "group-hover:border-purple-500/50",
    iconBg: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30",
  },
  {
    label: "Find relevant law",
    desc: "Search Bharatiya Nyaya Sanhita & verified acts",
    icon: Search,
    href: "/dashboard/chat",
    badge: "Citation RAG",
    color: "from-cyan-500/20 to-blue-500/20",
    borderColor: "group-hover:border-cyan-500/50",
    iconBg: "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/30",
  },
  {
    label: "Explain this document",
    desc: "Convert dense legalese into plain language summary",
    icon: HelpCircle,
    href: "/dashboard/documents",
    badge: "Plain Language",
    color: "from-rose-500/20 to-red-500/20",
    borderColor: "group-hover:border-rose-500/50",
    iconBg: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30",
  },
] as const;

const SUGGESTED_PROMPTS = [
  "What are my rights if stopped by traffic police?",
  "How do I respond to a landlord legal notice?",
  "Explain Section 106 of Bharatiya Nyaya Sanhita",
] as const;

export default async function DashboardHome() {
  const session = await auth();
  const name = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-50 dark:bg-[#070B14] font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      {/* Background Layers */}
      <div 
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" 
        aria-hidden="true" 
      />
      <div 
        className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-200/40 via-blue-200/30 to-purple-200/40 dark:from-blue-600/20 dark:via-indigo-500/10 dark:to-purple-600/20 blur-[130px]" 
        aria-hidden="true" 
      />

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-12 lg:py-16">
        
        {/* Header */}
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </div>
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              LegalSetu Core Engine v2.4 Active
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1 shadow-xs backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-600 dark:text-blue-400" aria-hidden="true" />
              Verified Indian Legal Corpus
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1 shadow-xs backdrop-blur-md sm:flex">
              <Bot className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              Strict Non-Hallucination Mode
            </span>
          </div>
        </header>

        {/* Hero Section */}
        <section className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 dark:border-blue-500/30 bg-indigo-50/80 dark:bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-indigo-700 dark:text-blue-300 shadow-xs">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-blue-400" aria-hidden="true" />
            AI-Powered Citizen Assistance
          </div>
          
          <h1 className="mt-6 font-serif text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-6xl">
            Welcome, <span className="text-indigo-600 dark:bg-gradient-to-r dark:from-blue-400 dark:via-indigo-300 dark:to-white dark:bg-clip-text dark:text-transparent italic">{name}</span>
          </h1>
          
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg">
            How can LegalSetu assist you today? Search verified laws, upload legal documents, or draft an FIR in your preferred language.
          </p>
        </section>

        {/* AI Command Input */}
        <section className="mt-10">
          <Link href="/dashboard/chat" className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/90 p-1 shadow-md dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-all duration-300 group-hover:border-indigo-400 dark:group-hover:border-blue-500/50">
              
              <div className="relative flex items-center gap-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/80 px-5 py-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600 dark:bg-gradient-to-br dark:from-blue-500 dark:to-indigo-600 text-white shadow-md transition-transform duration-300 group-hover:scale-105">
                  <Search className="h-6 w-6" aria-hidden="true" />
                </div>

                <div className="flex-1 overflow-hidden">
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-200 transition-colors group-hover:text-indigo-600 dark:group-hover:text-white">
                    Ask LegalSetu anything about your situation...
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    Example: &quot;What is the procedure for registering a property dispute?&quot;
                  </p>
                </div>

                <div className="hidden items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:flex">
                  <Command className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <span className="font-mono">K</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Prompt Suggestions */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="mr-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <Zap className="h-3 w-3 text-amber-500 dark:text-amber-400" aria-hidden="true" /> Try Asking:
            </span>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Link key={prompt} href="/dashboard/chat" className="rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-xs transition-all duration-200 hover:scale-105 hover:border-indigo-300 dark:hover:border-blue-400/40 hover:bg-indigo-50 dark:hover:bg-blue-500/10 hover:text-indigo-600 dark:hover:text-white">
                  {prompt}
                  <ArrowRight className="h-3 w-3 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Action Cards Hub */}
        <section className="mt-16">
          <div className="mb-6 flex items-center justify-between border-b border-slate-200/80 dark:border-white/10 pb-4">
            <div>
              <h2 className="font-serif text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Legal Services Hub
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Select an automated pathway to begin</p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">6 Modules Available</span>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.label} href={action.href} className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <Card className={`relative h-full overflow-hidden border border-slate-200/80 dark:border-white/10 bg-white dark:bg-gradient-to-b dark:from-slate-900/80 dark:to-slate-950/90 p-1 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${action.borderColor}`}>
                  
                  <div className={`absolute inset-x-0 top-0 h-1 dark:h-px bg-gradient-to-r ${action.color}`} aria-hidden="true" />
                  
                  <CardContent className="relative z-10 flex h-full flex-col justify-between p-5">
                    <div>
                      <div className="mb-5 flex items-center justify-between">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${action.iconBg} transition-transform duration-300 group-hover:scale-105`}>
                          <action.icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                          {action.badge}
                        </span>
                      </div>

                      <h3 className="font-semibold text-slate-900 dark:text-white transition-colors group-hover:text-indigo-600 dark:group-hover:text-blue-300">
                        {action.label}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {action.desc}
                      </p>
                    </div>

                    <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-blue-400 transition-colors group-hover:text-indigo-700 dark:group-hover:text-blue-300">
                      <span>Launch module</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t border-slate-200/80 dark:border-white/10 pt-8">
          <Disclaimer className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/5 p-5 text-amber-900 dark:text-slate-300 shadow-xs" />
        </footer>

      </main>
    </div>
  );
}