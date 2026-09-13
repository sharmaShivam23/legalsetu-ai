import { FIRWizard } from "@/components/fir/fir-wizard";
import { FileSignature, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "FIR Assistant — LegalSetu",
};

export default function FIRPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brandBlue/10 ring-1 ring-brandBlue/20">
          <FileSignature className="h-5.5 w-5.5 text-brandBlue" />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-textPrimary sm:text-[28px]">
            FIR Assistant
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-textSecondary">
            Answer a few guided questions and get a structured, print-ready
            complaint draft — organised the way a police station expects to
            see it.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-borderCustom bg-canvas px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brandBlue" />
        <p className="text-xs leading-relaxed text-textSecondary">
          This produces a <span className="font-medium text-textPrimary">complaint draft</span>,
          not an official FIR. The police authority decides whether an FIR is
          registered and which legal provisions apply — review every detail
          before submitting it.
        </p>
      </div>

      <div className="mt-8">
        <FIRWizard />
      </div>
    </div>
  );
}
