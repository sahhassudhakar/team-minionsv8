import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/get-session";
import { getAppData, ensureDefaultFrameworks } from "@/lib/server/data-store";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  ensureDefaultFrameworks();
  const data = getAppData();
  return NextResponse.json({ data, session });
}
