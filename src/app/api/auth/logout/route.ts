import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { logSessionEvent } from "@/lib/server/data-store";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await verifySession(token);
    if (session) {
      await logSessionEvent("logout", { name: session.name, role: session.role, email: session.email });
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
