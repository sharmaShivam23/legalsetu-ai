"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Scale,
  MessageSquarePlus,
  MessagesSquare,
  Folder,
  FileText,
  FileSignature,
  BookMarked,
  Users,
  History,
  Settings,
  Globe,
  Menu,
  X,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SUPPORTED_LANGUAGES } from "@/lib/translation/languages";

const NAV_ITEMS = [
  { href: "/dashboard/chat", label: "Ask LegalSetu", icon: MessagesSquare },
  { href: "/dashboard/cases", label: "My Cases", icon: Folder },
  { href: "/dashboard/documents", label: "Documents OCR", icon: FileText },
  { href: "/dashboard/fir", label: "FIR Assistant", icon: FileSignature },
  { href: "/dashboard/sources", label: "Saved Sources", icon: BookMarked },
  { href: "/dashboard/lawyer", label: "Lawyer / Legal Aid", icon: Users },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      {/* 3D and Animation Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar-perspective { perspective: 1000px; }
        
        .nav-item-3d {
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          transform-style: preserve-3d;
        }
        .nav-item-3d:hover {
          background: linear-gradient(90deg, rgba(59,130,246,0.1) 0%, transparent 100%);
        }
        .nav-item-3d:hover .nav-icon {
          transform: translateZ(15px) scale(1.1);
          color: #60a5fa;
        }
        
        .btn-new-case {
          transform-style: preserve-3d;
          transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.1s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 0 0 #1e3a8a, 0 10px 20px rgba(0,0,0,0.4);
        }
        .btn-new-case:active {
          transform: translateY(4px);
          box-shadow: 0 0px 0 0 #1e3a8a, 0 4px 8px rgba(0,0,0,0.4);
        }
      `}} />

      {/* Mobile Toggle Button */}
      <button 
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-4 left-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 text-white shadow-lg backdrop-blur-md md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container - FIX: Changed md:static to md:sticky md:top-0 */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-[#0B1120] sidebar-perspective transition-transform duration-300 ease-in-out md:sticky md:top-0 md:translate-x-0",
        isMobileOpen ? "translate-x-0 shadow-2xl shadow-blue-500/10" : "-translate-x-full"
      )}>
        
        {/* Mobile Close Button */}
        <button 
          onClick={() => setIsMobileOpen(false)}
          className="absolute right-4 top-4 text-slate-400 hover:text-white md:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Logo Section */}
        <div className="flex flex-col gap-1 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              <Scale className="h-4 w-4 relative z-10" />
              <div className="absolute inset-0 rounded-xl ring-1 ring-white/20"></div>
            </div>
            <span className="font-serif text-xl font-bold tracking-wide text-white">
              Legal<span className="text-blue-400">Setu</span>
            </span>
          </div>
          <div className="ml-12 flex items-center gap-1.5 mt-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] uppercase tracking-widest text-slate-500">System Online</span>
          </div>
        </div>

        {/* Primary Action */}
        <div className="px-4 py-2">
          <Link href="/dashboard/chat" onClick={() => setIsMobileOpen(false)}>
            <button className="btn-new-case mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white hover:bg-blue-500">
              <MessageSquarePlus className="h-4 w-4" />
              New Case Thread
            </button>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 px-3 overflow-y-auto overflow-x-hidden scrollbar-hide">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "nav-item-3d relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                  active 
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-inner shadow-blue-500/5" 
                    : "text-slate-400 border border-transparent"
                )}
              >
                {/* Active Neon Indicator */}
                {active && (
                  <div className="absolute left-0 top-1/4 h-1/2 w-1 rounded-r-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                )}
                
                <div className="nav-icon transition-all duration-300">
                  <item.icon className="h-4 w-4" />
                </div>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer: AI Language Settings */}
        <div className="mt-auto border-t border-white/5 bg-slate-900/30 p-4">
          <div className="mb-2 flex items-center gap-1.5 px-2">
            <Sparkles className="h-3 w-3 text-indigo-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              AI Translation Matrix
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-slate-950 px-3 py-2 text-sm text-slate-300 shadow-inner hover:border-white/10 transition-colors">
            <Globe className="h-4 w-4 text-blue-400 shrink-0" />
            <select
              className="w-full cursor-pointer bg-transparent outline-none appearance-none font-medium text-slate-300"
              defaultValue="en"
              aria-label="Interface language"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-slate-900 text-white">
                  {l.nativeName}
                </option>
              ))}
            </select>
            {/* Custom dropdown arrow to replace native one */}
            <div className="pointer-events-none flex items-center">
              <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}