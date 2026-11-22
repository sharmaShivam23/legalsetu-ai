import { AdminLawyerQueue } from "@/components/lawyers/admin-review";

export const metadata = { title: "Verify Lawyers — LegalSetu Admin" };

export default function AdminLawyersPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <h1 className="font-serif text-2xl font-semibold text-textPrimary">Advocate verification</h1>
      <p className="mb-6 mt-1 text-sm text-textSecondary">
        Check each advocate&apos;s Bar Council documents before they appear in Find a Lawyer. Oldest submissions first.
      </p>
      <AdminLawyerQueue />
    </div>
  );
}
