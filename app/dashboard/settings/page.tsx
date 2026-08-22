"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORTED_LANGUAGES } from "@/lib/translation/languages";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-textPrimary">
      <h1 className="text-2xl font-semibold text-textPrimary">Settings</h1>

      <Card className="mt-6 bg-card border-borderCustom shadow-sm">
        <CardHeader>
          <CardTitle className="text-textPrimary">Language Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: "Interface Language", key: "interfaceLanguage" },
            { label: "Response Language", key: "responseLanguage" },
            { label: "Voice Language", key: "voiceLanguage" },
          ].map((pref) => (
            <div key={pref.key} className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-textPrimary">{pref.label}</span>
              <select
                className="rounded-lg border border-borderCustom bg-canvas px-3 py-1.5 text-sm text-textPrimary transition-colors focus:border-brandBlue focus:outline-none focus:ring-1 focus:ring-brandBlue"
                defaultValue="en"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-card text-textPrimary">
                    {l.nativeName}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <p className="text-xs text-textSecondary leading-relaxed pt-2">
            Interface, response, and voice languages are independent — you can
            browse in English while receiving legal answers in Bhojpuri, for example.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}