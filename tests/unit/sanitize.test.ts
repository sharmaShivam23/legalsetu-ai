import { describe, it, expect } from "vitest";
import { sanitizeFilename, validateUploadedFile } from "@/lib/security/sanitize";

describe("sanitizeFilename", () => {
  it("strips path traversal attempts", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("..");
  });
  it("keeps a normal filename mostly intact", () => {
    expect(sanitizeFilename("my-document_v2.pdf")).toBe("my-document_v2.pdf");
  });
});

describe("validateUploadedFile", () => {
  it("rejects disallowed file types", () => {
    const result = validateUploadedFile({
      name: "malware.exe",
      type: "application/x-msdownload",
      size: 1000,
    });
    expect(result.valid).toBe(false);
  });
  it("rejects oversized files", () => {
    const result = validateUploadedFile({
      name: "big.pdf",
      type: "application/pdf",
      size: 30 * 1024 * 1024,
    });
    expect(result.valid).toBe(false);
  });
  it("accepts a valid pdf under the size limit", () => {
    const result = validateUploadedFile({
      name: "notice.pdf",
      type: "application/pdf",
      size: 1024,
    });
    expect(result.valid).toBe(true);
  });
});
