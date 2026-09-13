// Tailwind's JIT scanner needs full class names present as literal strings
// in source, so each category carries its own pre-built class string rather
// than a color key that gets interpolated at runtime.
export const LEGAL_AID_CATEGORIES = [
  {
    key: "EMERGENCY",
    label: "Emergency",
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
    solid: "bg-rose-600",
    ring: "border-rose-500/40",
  },
  {
    key: "GENERAL",
    label: "General",
    chip: "bg-brandBlue/10 text-brandBlue border-brandBlue/30",
    solid: "bg-brandBlue",
    ring: "border-brandBlue/40",
  },
  {
    key: "WOMEN",
    label: "Women's Safety",
    chip: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30",
    solid: "bg-fuchsia-600",
    ring: "border-fuchsia-500/40",
  },
  {
    key: "CHILD",
    label: "Child Protection",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    solid: "bg-amber-500",
    ring: "border-amber-500/40",
  },
  {
    key: "CYBERCRIME",
    label: "Cybercrime",
    chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30",
    solid: "bg-violet-600",
    ring: "border-violet-500/40",
  },
  {
    key: "CONSUMER",
    label: "Consumer Rights",
    chip: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
    solid: "bg-teal-600",
    ring: "border-teal-500/40",
  },
  {
    key: "SENIOR_CITIZEN",
    label: "Senior Citizens",
    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
    solid: "bg-sky-600",
    ring: "border-sky-500/40",
  },
] as const;

export type LegalAidCategoryKey = (typeof LEGAL_AID_CATEGORIES)[number]["key"];

// Referrals never target EMERGENCY — that is call-now-only, not a form.
export const REFERRAL_CATEGORIES = LEGAL_AID_CATEGORIES.filter((c) => c.key !== "EMERGENCY");

export function categoryMeta(key: string) {
  return LEGAL_AID_CATEGORIES.find((c) => c.key === key) ?? LEGAL_AID_CATEGORIES[1];
}
