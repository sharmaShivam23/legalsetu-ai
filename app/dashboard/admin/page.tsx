import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Database, BarChart3 } from "lucide-react";

export default function AdminHome() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-navy-900">Admin / Research Panel</h1>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/dashboard/admin/sources">
          <Card className="hover:border-brand-300">
            <CardContent className="flex items-center gap-3 p-5">
              <Database className="h-5 w-5 text-brand-500" />
              <span className="text-sm font-medium text-navy-900">Manage Legal Sources</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/admin/evaluation">
          <Card className="hover:border-brand-300">
            <CardContent className="flex items-center gap-3 p-5">
              <BarChart3 className="h-5 w-5 text-brand-500" />
              <span className="text-sm font-medium text-navy-900">Evaluation Dashboard</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
