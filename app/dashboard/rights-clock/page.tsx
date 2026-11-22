import { ShieldCheck, TimerReset } from "lucide-react";
import { RightsClockHome } from "@/components/rights-clock/home";

export const metadata = {
  title: "Rights Clock — LegalSetu",
};

export default function RightsClockPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brandBlue/10 ring-1 ring-brandBlue/20">
          <TimerReset className="h-6 w-6 text-brandBlue" />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-textPrimary sm:text-[28px]">Rights Clock</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-textSecondary">
            Someone in your family is in custody? Enter the arrest date and the sections on the FIR. LegalSetu works out the
            exact dates on which the law says they must be released on bail, and prepares the applications to claim it.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-borderCustom bg-canvas px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brandBlue" />
        <p className="text-xs leading-relaxed text-textSecondary">
          About three in four people in Indian prisons are <span className="font-medium text-textPrimary">undertrials</span>, not
          convicts, and many stay inside past the date the law entitles them to leave because nobody files for release. Every date
          here is calculated from the BNS text and BNSS rules, with no AI guesswork, and shows its legal basis. It is legal
          information, not legal advice: confirm with a lawyer or the free Legal Services Authority (helpline{" "}
          <span className="font-medium text-textPrimary">15100</span>) before filing.
        </p>
      </div>

      <div className="mt-8">
        <RightsClockHome />
      </div>
    </div>
  );
}
