import { ConsultationThread } from "@/components/lawyers/consultation-thread";

export const metadata = { title: "Consultation — LegalSetu" };

type Params = { params: Promise<{ id: string }> };

export default async function ConsultationPage({ params }: Params) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <ConsultationThread id={id} />
    </div>
  );
}
