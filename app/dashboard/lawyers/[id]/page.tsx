import { LawyerProfileView } from "@/components/lawyers/lawyer-profile";

export const metadata = { title: "Advocate — LegalSetu" };

type Params = { params: Promise<{ id: string }> };

export default async function LawyerPage({ params }: Params) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <LawyerProfileView id={id} />
    </div>
  );
}
