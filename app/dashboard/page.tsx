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
  Clock,
  ExternalLink,
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
    iconBg: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  },
  {
    label: "Create an FIR draft",
    desc: "Guided step-by-step drafting with completeness score",
    icon: FileSignature,
    href: "/dashboard/fir",
    badge: "Guided Assistant",
    color: "from-emerald-500/20 to-teal-500/20",
    borderColor: "group-hover:border-emerald-500/50",
    iconBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  {
    label: "Understand my rights",
    desc: "Query legal provisions in 15+ Indian languages",
    icon: Scale,
    href: "/dashboard/chat",
    badge: "Grounded Chat",
    color: "from-amber-500/20 to-orange-500/20",
    borderColor: "group-hover:border-amber-500/50",
    iconBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  {
    label: "Analyze an agreement",
    desc: "Spot clause risks, obligations & legal loopholes",
    icon: FileText,
    href: "/dashboard/documents",
    badge: "Doc Insight",
    color: "from-purple-500/20 to-pink-500/20",
    borderColor: "group-hover:border-purple-500/50",
    iconBg: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  },
  {
    label: "Find relevant law",
    desc: "Search Bharatiya Nyaya Sanhita & verified acts",
    icon: Search,
    href: "/dashboard/chat",
    badge: "Citation RAG",
    color: "from-cyan-500/20 to-blue-500/20",
    borderColor: "group-hover:border-cyan-500/50",
    iconBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  },
  {
    label: "Explain this document",
    desc: "Convert dense legalese into plain language summary",
    icon: HelpCircle,
    href: "/dashboard/documents",
    badge: "Plain Language",
    color: "from-rose-500/20 to-red-500/20",
    borderColor: "group-hover:border-rose-500/50",
    iconBg: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  },
];

const SUGGESTED_PROMPTS = [
  "What are my rights if stopped by traffic police?",
  "How do I respond to a landlord legal notice?",
  "Explain Section 106 of Bharatiya Nyaya Sanhita",
];

export default async function DashboardHome() {
  const session = await auth();
  const name = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#070B14] text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      {/* Dynamic 3D Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .perspective-wrapper { perspective: 1200px; }
        
        .card-3d-tilt {
          transform-style: preserve-3d;
          transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.4s ease, box-shadow 0.4s ease;
        }
        .card-3d-tilt:hover {
          transform: translateY(-8px) rotateX(4deg) rotateY(-2deg) translateZ(15px);
          box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 25px rgba(59, 130, 246, 0.15);
        }

        .floating-element-3d {
          transform-style: preserve-3d;
          transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .card-3d-tilt:hover .floating-element-3d {
          transform: translateZ(30px) scale(1.08);
        }

        @keyframes ambientGlow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
        .animate-glow { animation: ambientGlow 8s ease-in-out infinite; }

        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(1000%); }
        }
        .animate-scan { animation: scanline 8s linear infinite; }
      `}} />

      {/* Futuristic Background Layers */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] pointer-events-none"></div>
      <div className="animate-glow absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-r from-blue-600/20 via-indigo-500/10 to-purple-600/20 blur-[130px] pointer-events-none"></div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12 lg:py-16 perspective-wrapper">
        
        {/* Top Status Bar Badge */}
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </div>
            <span className="text-xs font-mono tracking-widest text-emerald-400 uppercase">
              LegalSetu Core Engine v2.4 Active
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
              Verified Indian Legal Corpus
            </span>
            <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-md">
              <Bot className="h-3.5 w-3.5 text-indigo-400" />
              Strict Non-Hallucination Mode
            </span>
          </div>
        </div>

        {/* Hero Section */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-300 backdrop-blur-xl shadow-[0_0_15px_rgba(59,130,246,0.2)]">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            AI-Powered Citizen Assistance
          </div>
          
          <h1 className="mt-6 font-serif text-4xl font-extrabold tracking-tight text-white sm:text-6xl drop-shadow-2xl">
            Welcome, <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-white bg-clip-text text-transparent">{name}</span>
          </h1>
          
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400 leading-relaxed sm:text-lg">
            How can LegalSetu assist you today? Search verified laws, upload legal documents, or draft an FIR in your preferred language.
          </p>
        </div>

        {/* Raycast-style 3D AI Command Bar */}
        <div className="mt-10">
          <Link href="/dashboard/chat" className="group block outline-none">
            <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(59,130,246,0.15)] backdrop-blur-2xl transition-all duration-300 group-hover:border-blue-500/50 group-hover:shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_40px_rgba(59,130,246,0.25)]">
              
              <div className="relative flex items-center gap-4 rounded-xl bg-slate-950/80 px-5 py-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-transform duration-300 group-hover:scale-110">
                  <Search className="h-6 w-6" />
                </div>

                <div className="flex-1 overflow-hidden">
                  <p className="text-base font-medium text-slate-200 transition-colors group-hover:text-white">
                    Ask LegalSetu anything about your situation...
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    Example: "What is the procedure for registering a property dispute?"
                  </p>
                </div>

                <div className="hidden sm:flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400">
                  <Command className="h-3.5 w-3.5 text-slate-500" />
                  <span className="font-mono">K</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Quick Clickable Suggestions */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-1">
              <Zap className="h-3 w-3 text-amber-400" /> Try Asking:
            </span>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Link key={prompt} href="/dashboard/chat" className="outline-none">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition-all duration-200 hover:border-blue-400/40 hover:bg-blue-500/10 hover:text-white hover:scale-105">
                  {prompt}
                  <ArrowRight className="h-3 w-3 text-slate-500" />
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* 3D Action Cards Section */}
        <div className="mt-16">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-serif font-bold text-white tracking-wide">
                Legal Services Hub
              </h2>
              <p className="text-xs text-slate-400">Select an automated pathway to begin</p>
            </div>
            <span className="text-xs font-mono text-slate-500">6 Modules Available</span>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.label} href={a.href} className="group outline-none">
                <Card className={`card-3d-tilt relative h-full overflow-hidden border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950/90 p-1 backdrop-blur-xl ${a.borderColor}`}>
                  
                  {/* Subtle Top Inner Glow */}
                  <div className={`absolute top-0 inset-x-0 h-px bg-gradient-to-r ${a.color}`}></div>
                  
                  <CardContent className="flex flex-col justify-between h-full p-6 relative z-10">
                    <div>
                      {/* Top Row: Icon + Badge */}
                      <div className="flex items-center justify-between mb-6">
                        <div className={`floating-element-3d flex h-12 w-12 items-center justify-center rounded-xl border ${a.iconBg} shadow-inner`}>
                          <a.icon className="h-6 w-6" />
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-mono tracking-wider text-slate-400">
                          {a.badge}
                        </span>
                      </div>

                      {/* Content */}
                      <h3 className="font-serif text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
                        {a.label}
                      </h3>
                      <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                        {a.desc}
                      </p>
                    </div>

                    {/* Bottom Action Link Indicator */}
                    <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-blue-400 group-hover:text-blue-300 transition-colors">
                      <span>Launch module</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom Section: Disclaimer */}
        <div className="mt-16 border-t border-white/10 pt-8">
          <Disclaimer className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-slate-300 backdrop-blur-md shadow-lg" />
        </div>

      </div>
    </div>
  );
}