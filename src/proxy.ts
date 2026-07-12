import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/pdfjs") ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Real verification (signature + expiry), not just "a cookie exists" —
  // a forged or expired cookie is rejected here at the edge, before any
  // page or API route runs.
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  // Server-enforced role gate for /admin — defense in depth on top of the
  // client-side redirect already in the Admin page.
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|pdfjs).*)"],
};
