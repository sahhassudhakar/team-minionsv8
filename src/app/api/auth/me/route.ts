import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null }, { status: 200 });

  const session = await verifySession(token);
  if (!session) return NextResponse.json({ user: null }, { status: 200 });

  return NextResponse.json({
    user: { email: session.email, name: session.name, role: session.role, siteId: session.siteId },
  });
}
