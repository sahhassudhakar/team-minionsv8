import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/server/user-store";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { logSessionEvent } from "@/lib/server/data-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = verifyPassword(body.email, body.password);
  if (!user) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    siteId: user.siteId,
  });

  await logSessionEvent("login", { name: user.name, role: user.role, email: user.email });

  const res = NextResponse.json({
    user: { email: user.email, name: user.name, role: user.role, siteId: user.siteId },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
