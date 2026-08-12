import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function LawyerPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-navy-900">Lawyer / Legal Aid</h1>
      <p className="mt-1 text-sm text-slate-500">
        For complex or high-risk matters, professional legal assistance is recommended.
      </p>
      <Card className="mt-8">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Users className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            Verified legal-aid directory not yet configured.
          </p>
          <p className="max-w-sm text-xs text-slate-400">
            This module is architected to connect to a verified lawyer/legal-aid
            directory. LegalSetu never fabricates lawyer names or contact details —
            this section will remain empty until real, verified data is connected.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
