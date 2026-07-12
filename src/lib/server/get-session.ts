import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE, type SessionPayload } from "@/lib/session";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
