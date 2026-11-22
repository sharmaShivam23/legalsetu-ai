import { MessagesSquare } from "lucide-react";
import { ConsultationList } from "@/components/lawyers/consultation-list";

export const metadata = { title: "Consultations — LegalSetu" };

export default function ConsultationsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brandBlue/10 ring-1 ring-brandBlue/20">
          <MessagesSquare className="h-6 w-6 text-brandBlue" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-textPrimary sm:text-[28px]">Consultations</h1>
          <p className="mt-1 text-sm text-textSecondary">Your requests to advocates and your conversations with them.</p>
        </div>
      </div>
      <ConsultationList />
    </div>
  );
}
