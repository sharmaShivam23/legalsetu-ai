import { Scale } from "lucide-react";
import { LawyerFinder } from "@/components/lawyers/finder";

export const metadata = { title: "Find a Lawyer — LegalSetu" };

export default function FindLawyerPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brandBlue/10 ring-1 ring-brandBlue/20">
          <Scale className="h-6 w-6 text-brandBlue" />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-textPrimary sm:text-[28px]">Find a Lawyer</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-textSecondary">
            Verified advocates near you, in your language. Send a request, share your case file if you want to, and talk in LegalSetu.
            No touts, no middlemen.
          </p>
        </div>
      </div>
      <div className="mt-8">
        <LawyerFinder />
      </div>
    </div>
  );
}
