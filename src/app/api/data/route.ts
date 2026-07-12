import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/get-session";
import { getAppData, ensureDefaultFrameworks, reconcileCdpAutoLinks } from "@/lib/server/data-store";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  ensureDefaultFrameworks();
  // Trigger: "A questionnaire is opened" — every fetch of app data (which
  // happens on every page load/navigation) reconciles CDP auto-links so
  // evidence uploaded elsewhere shows up cited the moment someone opens
  // the CDP page, without waiting on another upload.
  await reconcileCdpAutoLinks({ name: session.name, role: session.role });
  const data = getAppData();
  return NextResponse.json({ data, session });
}
