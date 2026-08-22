import { History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-textPrimary">
      <h1 className="text-2xl font-semibold text-textPrimary">History</h1>
      <Card className="mt-8 bg-card border-borderCustom shadow-sm">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <History className="h-8 w-8 text-textSecondary opacity-40" />
          <p className="text-sm font-medium text-textPrimary">
            Your conversation history will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}