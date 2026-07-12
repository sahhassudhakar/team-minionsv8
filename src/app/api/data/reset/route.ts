import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/get-session";
import { resetDemoData } from "@/lib/server/data-store";

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — Admin only." }, { status: 403 });
  }
  const data = await resetDemoData();
  return NextResponse.json({ data });
}
