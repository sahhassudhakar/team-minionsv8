import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSession } from "@/lib/server/get-session";
import { getAppData } from "@/lib/server/data-store";

function guessMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "csv":
      return "text/csv";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ evidenceId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { evidenceId } = await params;
  const data = getAppData();
  const evidence = data.evidence.find((e) => e.id === evidenceId);
  if (!evidence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  const storedName = `${evidenceId}-${evidence.fileName}`;
  const filePath = path.join(uploadsDir, storedName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }

  const bytes = fs.readFileSync(filePath);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": guessMimeType(evidence.fileName),
      "Content-Disposition": `inline; filename="${evidence.fileName}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
