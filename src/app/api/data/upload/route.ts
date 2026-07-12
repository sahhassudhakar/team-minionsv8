import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/get-session";
import { uploadEvidence } from "@/lib/server/data-store";

/** Hard ceiling on files per upload request — keeps a single batch request
 * (and the server-side processing it triggers) bounded and predictable. */
const MAX_FILES_PER_UPLOAD = 15;

export interface FileUploadResult {
  fileName: string;
  ok: boolean;
  error?: string;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "store_manager") {
    return NextResponse.json({ error: "Forbidden — only Admin or Store Manager can upload evidence." }, { status: 403 });
  }

  const form = await request.formData();
  // Every file is appended under the same "file" field name, so getAll
  // retrieves the whole batch in one shot instead of one request per file.
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const siteId = form.get("siteId") as string | null;

  // One category per file, sent as a JSON array aligned by index with the
  // "file" fields above — a mixed batch (e.g. a water bill AND a lab
  // report) now extracts each document against its own category instead of
  // one category being forced onto every file in the batch.
  const categoryIdsRaw = form.get("categoryIds") as string | null;
  let categoryIds: unknown[] = [];
  if (categoryIdsRaw) {
    try {
      const parsed = JSON.parse(categoryIdsRaw);
      if (Array.isArray(parsed)) categoryIds = parsed;
    } catch {
      return NextResponse.json({ error: "Malformed category selection." }, { status: 400 });
    }
  }

  if (files.length === 0) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return NextResponse.json(
      { error: `Too many files — up to ${MAX_FILES_PER_UPLOAD} per upload, got ${files.length}.` },
      { status: 400 }
    );
  }

  if (session.role === "store_manager") {
    if (!siteId) {
      return NextResponse.json({ error: "Site is required." }, { status: 400 });
    }
    if (categoryIds.length !== files.length || categoryIds.some((c) => typeof c !== "string" || !c)) {
      return NextResponse.json({ error: "A document category is required for every file." }, { status: 400 });
    }
  }

  const results: FileUploadResult[] = [];
  let data;

  // Processed sequentially server-side (writeData is a plain file overwrite,
  // not append-safe under true concurrency) but as ONE request/response
  // round trip instead of N — the client no longer waits on N separate
  // fetches, and one bad file doesn't block the rest of the batch.
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const categoryId = typeof categoryIds[i] === "string" ? (categoryIds[i] as string) : null;
    const waterContext = siteId && categoryId ? { siteId, categoryId } : undefined;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      data = await uploadEvidence(file.name, bytes, { name: session.name, role: session.role }, waterContext);
      results.push({ fileName: file.name, ok: true });
    } catch (err) {
      results.push({ fileName: file.name, ok: false, error: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  return NextResponse.json({ data, results });
}
