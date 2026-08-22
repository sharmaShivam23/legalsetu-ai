import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const userId = (session?.user as any)?.id as string;

  const caseData = await prisma.case
    .findFirst({ where: { id, userId } }) // user isolation
    .catch(() => null);

  if (!caseData) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-textPrimary">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-textPrimary">{caseData.title}</h1>
        <Badge className="border border-borderCustom bg-card text-textPrimary shadow-sm hover:bg-card">
          {caseData.status}
        </Badge>
      </div>
      {caseData.summary && (
        <p className="mt-3 text-sm text-textSecondary leading-relaxed">{caseData.summary}</p>
      )}
    </div>
  );
}
