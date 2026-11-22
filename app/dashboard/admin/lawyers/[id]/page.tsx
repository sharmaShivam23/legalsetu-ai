import { AdminLawyerReview } from "@/components/lawyers/admin-review";

export const metadata = { title: "Review Advocate — LegalSetu Admin" };

type Params = { params: Promise<{ id: string }> };

export default async function AdminLawyerReviewPage({ params }: Params) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <AdminLawyerReview id={id} />
    </div>
  );
}
