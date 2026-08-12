"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORTED_LANGUAGES } from "@/lib/translation/languages";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-navy-900">Settings</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Language Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: "Interface Language", key: "interfaceLanguage" },
            { label: "Response Language", key: "responseLanguage" },
            { label: "Voice Language", key: "voiceLanguage" },
          ].map((pref) => (
            <div key={pref.key} className="flex items-center justify-between">
              <span className="text-sm font-medium text-navy-900">{pref.label}</span>
              <select className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" defaultValue="en">
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeName}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <p className="text-xs text-slate-400">
            Interface, response, and voice languages are independent — you can
            browse in English while receiving legal answers in Bhojpuri, for example.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
