"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
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
  Sparkles,
  LayoutDashboard,
  LogOut,
  User,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SUPPORTED_LANGUAGES } from "@/lib/translation/languages";
import { ThemeToggle } from "@/components/common/ThemeToggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/chat", label: "Ask LegalSetu", icon: MessagesSquare },
  { href: "/dashboard/cases", label: "My Cases", icon: Folder },
  { href: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/fir", label: "FIR Assistant", icon: FileSignature },
  { href: "/dashboard/sources", label: "Saved Sources", icon: BookMarked },
  { href: "/dashboard/lawyer", label: "Lawyer / Legal Aid", icon: Users },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      {/* 3D and Animation Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar-perspective { perspective: 1000px; }
        
        .nav-item-3d {
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          transform-style: preserve-3d;
        }
        .nav-item-3d:hover .nav-icon {
          transform: translateZ(15px) scale(1.1);
        }
        
        .btn-new-case {
          transform-style: preserve-3d;
          transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.1s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn-new-case:active {
          transform: translateY(2px);
        }
      `}} />

      {/* Mobile Toggle Button */}
      <button 
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-4 left-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-borderCustom bg-card text-textPrimary shadow-lg backdrop-blur-md md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col border-r border-borderCustom bg-sidebar sidebar-perspective transition-all duration-300 ease-in-out md:sticky md:top-0 md:translate-x-0",
        isCollapsed ? "w-20" : "w-64",
        isMobileOpen ? "translate-x-0 shadow-2xl shadow-blue-500/10" : "-translate-x-full"
      )}>
        
        {/* Mobile Close Button */}
        <button 
          onClick={() => setIsMobileOpen(false)}
          className="absolute right-4 top-4 text-textSecondary hover:text-textPrimary md:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Desktop Collapse Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex absolute -right-3 top-8 z-50 h-6 w-6 items-center justify-center rounded-full border border-borderCustom bg-card text-textSecondary hover:text-textPrimary shadow-md transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        {/* Logo Section */}
        <div className={cn("flex flex-col gap-1 px-6 py-6 transition-all", isCollapsed && "px-4 items-center")}>
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Scale className="h-4 w-4 relative z-10" />
            </div>
            {!isCollapsed && (
              <span className="font-serif text-xl font-bold tracking-wide text-textPrimary whitespace-nowrap">
                Legal<span className="text-brandBlue">Setu</span>
              </span>
            )}
          </div>
          {!isCollapsed && (
            <div className="ml-12 flex items-center gap-1.5 mt-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-semibold">System Online</span>
            </div>
          )}
        </div>

        {/* Primary Action */}
        <div className="px-4 py-2">
          <Link href="/dashboard/chat" onClick={() => setIsMobileOpen(false)}>
            <button className={cn(
              "btn-new-case mb-4 flex items-center justify-center gap-2 rounded-xl bg-brandBlue text-sm font-bold text-white hover:opacity-90 shadow-md transition-all",
              isCollapsed ? "h-10 w-10 p-0 mx-auto" : "w-full px-3 py-3"
            )}>
              <MessageSquarePlus className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span>New Case Thread</span>}
            </button>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 px-3 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/dashboard" 
              ? pathname === "/dashboard" 
              : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  "nav-item-3d relative flex items-center gap-3 rounded-xl py-3 text-sm font-medium transition-colors",
                  isCollapsed ? "justify-center px-0" : "px-3",
                  active 
                    ? "bg-brandBlue/10 text-brandBlue font-semibold border border-brandBlue/20" 
                    : "text-textSecondary hover:text-textPrimary hover:bg-canvas border border-transparent"
                )}
              >
                {/* Active Indicator */}
                {active && (
                  <div className="absolute left-0 top-1/4 h-1/2 w-1 rounded-r-full bg-brandBlue"></div>
                )}
                
                <div className="nav-icon transition-all duration-300 shrink-0">
                  <item.icon className={cn("h-4 w-4", active ? "text-brandBlue" : "text-textSecondary")} />
                </div>
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer Controls: Language Selector, Theme Toggle & User Logout */}
        <div className="mt-auto border-t border-borderCustom bg-canvas/50 p-4 space-y-3">
          <div className={cn("flex items-center justify-between", isCollapsed && "flex-col gap-2 px-0")}>
            {!isCollapsed && (
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-brandBlue" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary">
                  Preferences
                </span>
              </div>
            )}
            {/* Embedded Theme Toggle Switch */}
            <ThemeToggle />
          </div>

          {!isCollapsed && (
            <div className="flex items-center gap-2 rounded-xl border border-borderCustom bg-card px-3 py-2 text-sm text-textPrimary shadow-sm hover:border-brandBlue/30 transition-colors">
              <Globe className="h-4 w-4 text-brandBlue shrink-0" />
              <select
                className="w-full cursor-pointer bg-transparent outline-none appearance-none font-medium text-textPrimary"
                defaultValue="en"
                aria-label="Interface language"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-card text-textPrimary">
                    {l.nativeName}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none flex items-center">
                <svg className="h-3 w-3 text-textSecondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* User Profile & Logout Section */}
          <div className={cn("flex items-center justify-between pt-2 border-t border-borderCustom/60", isCollapsed && "flex-col gap-2")}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brandBlue/10 text-brandBlue font-bold text-xs">
                {session?.user?.name ? session.user.name[0].toUpperCase() : <User className="h-4 w-4" />}
              </div>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-textPrimary truncate">
                    {session?.user?.name || "Account"}
                  </p>
                  <p className="text-[10px] text-textSecondary truncate">
                    {session?.user?.email || "Online"}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-textSecondary hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}