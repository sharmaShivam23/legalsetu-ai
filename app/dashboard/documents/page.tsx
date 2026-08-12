"use client";

import { useState, useEffect, useCallback } from "react";
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
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">Documents</h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload a legal notice, agreement, or letter to get a plain-language explanation.
          </p>
        </div>
        <label>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleUpload}
          />
          <Button variant="brand" className="gap-2" disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
        </label>
      </div>

      <div className="mt-8 space-y-3">
        {documents === null && (
          <p className="text-sm text-slate-400">Loading documents...</p>
        )}

        {documents !== null && documents.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <FileText className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">No documents yet.</p>
              <p className="text-xs text-slate-400">
                Upload a PDF, DOCX, TXT, or image to get started.
              </p>
            </CardContent>
          </Card>
        )}

        {documents?.map((doc) => (
          <Card key={doc.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-brand-500" />
                <span className="text-sm font-medium text-navy-900">{doc.title}</span>
              </div>
              <Badge variant={doc.status === "READY" ? "success" : "default"}>
                {doc.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
