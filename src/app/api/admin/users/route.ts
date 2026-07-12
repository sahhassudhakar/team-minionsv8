import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { createUser, listUsers, deleteUser } from "@/lib/server/user-store";
import { assignStoreManagerToSite } from "@/lib/server/data-store";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session || session.role !== "admin") return null;
  return session;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ users: listUsers() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.name || !body?.role) {
    return NextResponse.json({ error: "email, password, name, and role are required." }, { status: 400 });
  }
  if (body.role === "store_manager" && !body.siteId) {
    return NextResponse.json({ error: "A Store Manager account must be assigned to a site." }, { status: 400 });
  }

  const result = createUser({
    email: body.email,
    password: body.password,
    name: body.name,
    role: body.role,
    siteId: body.siteId ?? null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (body.role === "store_manager" && body.siteId) {
    await assignStoreManagerToSite(body.siteId, result.user.email);
  }
  return NextResponse.json({ user: result.user });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const deleted = deleteUser(id);
  return NextResponse.json({ deleted });
}
