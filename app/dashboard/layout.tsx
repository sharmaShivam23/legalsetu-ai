import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { Sidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Role from the database, not the session token: an account that
  // becomes an advocate sees its advocate pages without signing out.
  const userId = (session.user as { id?: string }).id;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }).catch(() => null)
    : null;

  return (
    <div className="flex min-h-screen bg-canvas text-textPrimary">
      <Sidebar role={user?.role} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
