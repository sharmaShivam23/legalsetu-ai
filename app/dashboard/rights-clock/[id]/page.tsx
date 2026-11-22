import { TrackerDetail } from "@/components/rights-clock/tracker-detail";

export const metadata = {
  title: "Rights Clock — LegalSetu",
};

type Params = { params: Promise<{ id: string }> };

export default async function TrackerPage({ params }: Params) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <TrackerDetail id={id} />
    </div>
  );
}
