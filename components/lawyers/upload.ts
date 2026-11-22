// Client-side upload preparation.
//
// Photos are re-drawn onto a canvas before upload: that applies the
// phone's rotation (so selfies are not sideways once EXIF is stripped
// on the server), shrinks a 6 MB camera photo to a few hundred KB for
// people on mobile data, and re-encodes as JPEG. PDFs pass through.

export async function prepareFile(file: File, maxDim: number): Promise<Blob> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob ?? file;
  } catch {
    // Unusual formats (e.g. HEIC on some browsers) — let the server decide.
    return file;
  }
}

export async function uploadFile(url: string, file: Blob, fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file, "upload");
  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error("The server had a problem saving the file. Please try again in a moment.");
  if (!json.success) throw new Error(json.error?.message ?? "Upload failed. Please try again.");
  return json.data;
}
