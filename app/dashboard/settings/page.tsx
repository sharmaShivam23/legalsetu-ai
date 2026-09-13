"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import {
  Download,
  Trash2,
  Loader2,
  ShieldCheck,
  MessagesSquare,
  Folder,
  FileSignature,
  BookMarked,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TiltCard } from "@/components/ui/tilt-card";
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from "@/lib/i18n/languages";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { MemoryManager } from "@/components/settings/memory-manager";

type PreferenceKey = "interfaceLanguage" | "responseLanguage" | "voiceLanguage";

const PREFERENCES: { key: PreferenceKey; label: string; hint: string }[] = [
  { key: "interfaceLanguage", label: "Interface Language", hint: "Menus, buttons and page text." },
  { key: "responseLanguage", label: "Response Language", hint: "The language legal answers are written in." },
  { key: "voiceLanguage", label: "Voice Language", hint: "Used for speaking questions and hearing answers read aloud." },
];

interface Account {
  name: string | null;
  email: string;
  createdAt: string;
  hasPassword: boolean;
  stats: {
    conversations: number;
    cases: number;
    firDrafts: number;
    documents: number;
    savedSources: number;
    memories: number;
    referrals: number;
  };
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function DeleteAccountDialog({ hasPassword, onClose }: { hasPassword: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password || undefined, confirm: confirmText }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message || "Failed");
      toast.success("Account deleted.");
      await signOut({ callbackUrl: "/" });
    } catch (err: any) {
      toast.error(err?.message === "Incorrect password." ? "Incorrect password." : "Could not delete your account.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-borderCustom bg-card p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-rose-600">Delete your account</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-textSecondary">
          This permanently deletes every conversation, case, FIR draft and saved item.
          This cannot be undone.
        </p>
        {hasPassword && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="mt-3 w-full rounded-lg border border-borderCustom bg-canvas px-3 py-2 text-sm text-textPrimary outline-none focus:border-rose-500"
          />
        )}
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder='Type "DELETE" to confirm'
          className="mt-2 w-full rounded-lg border border-borderCustom bg-canvas px-3 py-2 text-sm text-textPrimary outline-none focus:border-rose-500"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-borderCustom px-3 py-1.5 text-xs font-semibold text-textPrimary hover:bg-canvas"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || confirmText !== "DELETE" || (hasPassword && !password)}
            onClick={submit}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const [values, setValues] = useState<Record<PreferenceKey, string>>({
    interfaceLanguage: language,
    responseLanguage: language,
    voiceLanguage: language,
  });
  const [saving, setSaving] = useState<PreferenceKey | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        setValues({
          interfaceLanguage: json.data.interfaceLanguage ?? DEFAULT_LANGUAGE,
          responseLanguage: json.data.responseLanguage ?? DEFAULT_LANGUAGE,
          voiceLanguage: json.data.voiceLanguage ?? DEFAULT_LANGUAGE,
        });
      })
      .catch(() => {});
    fetch("/api/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => !cancelled && json?.data && setAccount(json.data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setValues((v) => ({ ...v, interfaceLanguage: language }));
  }, [language]);

  async function update(key: PreferenceKey, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaving(key);
    if (key === "interfaceLanguage") setLanguage(value);
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success("Language preference saved.");
    } catch {
      toast.error("Could not save that preference. It still applies on this device.");
    } finally {
      setSaving(null);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "legalsetu-data-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data has been downloaded.");
    } catch {
      toast.error("Could not export your data right now.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-textPrimary sm:px-6 sm:py-12">
      <h1 className="font-serif text-2xl font-semibold text-textPrimary">Settings</h1>
      <p className="mt-1 text-sm text-textSecondary">Your account, preferences and data — all in one place.</p>

      {account && (
        <TiltCard maxTilt={5} className="mt-6 rounded-2xl">
          <div className="relative overflow-hidden rounded-2xl border border-borderCustom bg-gradient-to-br from-brandBlue/10 via-card to-card p-5">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brandBlue text-lg font-bold text-white shadow-md">
                {initials(account.name, account.email)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-textPrimary">{account.name || account.email}</p>
                <p className="truncate text-xs text-textSecondary" data-no-translate>{account.email}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-textSecondary">
                  <Calendar className="h-3 w-3" />
                  Member since {new Date(account.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-borderCustom pt-4">
              <div className="text-center">
                <MessagesSquare className="mx-auto h-3.5 w-3.5 text-textSecondary" />
                <p className="mt-1 text-sm font-bold text-textPrimary">{account.stats.conversations}</p>
                <p className="text-[9px] font-medium uppercase tracking-wide text-textSecondary">Chats</p>
              </div>
              <div className="text-center">
                <Folder className="mx-auto h-3.5 w-3.5 text-textSecondary" />
                <p className="mt-1 text-sm font-bold text-textPrimary">{account.stats.cases}</p>
                <p className="text-[9px] font-medium uppercase tracking-wide text-textSecondary">Cases</p>
              </div>
              <div className="text-center">
                <FileSignature className="mx-auto h-3.5 w-3.5 text-textSecondary" />
                <p className="mt-1 text-sm font-bold text-textPrimary">{account.stats.firDrafts}</p>
                <p className="text-[9px] font-medium uppercase tracking-wide text-textSecondary">FIR Drafts</p>
              </div>
              <div className="text-center">
                <BookMarked className="mx-auto h-3.5 w-3.5 text-textSecondary" />
                <p className="mt-1 text-sm font-bold text-textPrimary">{account.stats.savedSources}</p>
                <p className="text-[9px] font-medium uppercase tracking-wide text-textSecondary">Saved</p>
              </div>
            </div>
          </div>
        </TiltCard>
      )}

      <Card className="mt-6 bg-card border-borderCustom shadow-sm">
        <CardHeader>
          <CardTitle className="text-textPrimary">Language Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {PREFERENCES.map((pref) => (
            <div key={pref.key} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <label htmlFor={pref.key} className="block text-sm font-medium text-textPrimary">
                  {pref.label}
                </label>
                <p className="text-xs text-textSecondary">{pref.hint}</p>
              </div>
              <select
                id={pref.key}
                value={values[pref.key]}
                disabled={saving === pref.key}
                onChange={(e) => update(pref.key, e.target.value)}
                data-no-translate
                className="rounded-lg border border-borderCustom bg-canvas px-3 py-1.5 text-sm text-textPrimary transition-colors focus:border-brandBlue focus:outline-none focus:ring-1 focus:ring-brandBlue disabled:opacity-60"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-card text-textPrimary">
                    {l.nativeName} ({l.englishName})
                  </option>
                ))}
              </select>
            </div>
          ))}
          <p className="pt-2 text-xs leading-relaxed text-textSecondary">
            These three are independent — you can browse in English while receiving legal answers
            in Bhojpuri, for example. Changing the interface language translates the entire app
            immediately, including data loaded from your account.
          </p>
        </CardContent>
      </Card>

      <MemoryManager />

      <Card className="mt-6 border-borderCustom bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-textPrimary">
            <ShieldCheck className="h-4 w-4 text-brandBlue" />
            Privacy &amp; Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borderCustom bg-canvas p-4">
            <div>
              <p className="text-sm font-medium text-textPrimary">Export your data</p>
              <p className="text-xs text-textSecondary">
                Download every conversation, case, FIR draft and saved source as one JSON file.
              </p>
            </div>
            <button
              type="button"
              onClick={exportData}
              disabled={exporting}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-borderCustom px-3 py-1.5 text-xs font-semibold text-textPrimary hover:bg-card disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
            <div>
              <p className="text-sm font-medium text-rose-600">Delete account</p>
              <p className="text-xs text-textSecondary">Permanently remove your account and everything in it.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </CardContent>
      </Card>

      {showDelete && account && (
        <DeleteAccountDialog hasPassword={account.hasPassword} onClose={() => setShowDelete(false)} />
      )}
    </div>
  );
}
