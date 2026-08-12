import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "ADMIN") redirect("/dashboard");

  return <div>{children}</div>;
}
