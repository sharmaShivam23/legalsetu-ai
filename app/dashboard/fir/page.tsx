import { FIRWizard } from "@/components/fir/fir-wizard";
import { Disclaimer } from "@/components/common/disclaimer";

export default function FIRPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-textPrimary">
      <h1 className="text-2xl font-semibold text-textPrimary">FIR Assistant</h1>
      <p className="mt-1 text-sm text-textSecondary">
        Answer a few guided questions to prepare a well-organized FIR draft.
      </p>
      <div className="mt-8">
        <FIRWizard />
      </div>
      <Disclaimer className="mt-6" />
    </div>
  );
}
