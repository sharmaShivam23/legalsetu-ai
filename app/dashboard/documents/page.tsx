"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface DocumentRow {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/documents");
    const data = await res.json();
    if (data.success) setDocuments(data.data.documents);
    else setDocuments([]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message ?? "Upload failed.");
        return;
      }
      toast.success("Document uploaded.");
      load();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-textPrimary">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-textPrimary">Documents</h1>
          <p className="mt-1 text-sm text-textSecondary">
            Upload a legal notice, agreement, or letter to get a plain-language explanation.
          </p>
        </div>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            className="gap-2 bg-brandBlue text-white hover:bg-brandBlue/90 shadow-sm"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {documents === null && (
          <p className="text-sm text-textSecondary">Loading documents...</p>
        )}

        {documents !== null && documents.length === 0 && (
          <Card className="bg-card border-borderCustom shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <FileText className="h-8 w-8 text-textSecondary opacity-40" />
              <p className="text-sm font-medium text-textPrimary">No documents yet.</p>
              <p className="text-xs text-textSecondary max-w-sm">
                Upload a PDF, DOCX, TXT, or image to get started with plain-language analysis.
              </p>
            </CardContent>
          </Card>
        )}

        {documents?.map((doc) => (
          <Card
            key={doc.id}
            className="bg-card border-borderCustom shadow-sm transition-colors hover:border-brandBlue/40"
          >
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-brandBlue shrink-0" />
                <span className="text-sm font-medium text-textPrimary">{doc.title}</span>
              </div>
              <Badge className="border border-borderCustom bg-canvas text-textPrimary shadow-none">
                {doc.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}