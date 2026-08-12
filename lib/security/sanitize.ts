import path from "path";

/** Removes path separators and unsafe characters from filenames. */
export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename);
  return base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 200);
}

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".jpg", ".jpeg", ".png"]);

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export function validateUploadedFile(file: {
  name: string;
  type: string;
  size: number;
}): { valid: boolean; error?: string } {
  const ext = path.extname(file.name).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: "File extension not allowed." };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { valid: false, error: "File type not allowed." };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "File exceeds the 20MB size limit." };
  }
  if (file.name.includes("..") || file.name.includes("/")) {
    return { valid: false, error: "Invalid filename." };
  }

  return { valid: true };
}

/** Basic HTML/script stripping for any user text rendered as HTML. */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}
