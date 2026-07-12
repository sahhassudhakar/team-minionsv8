import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "./server/user-store";

// In a real deployment this MUST come from a real secret manager / env var.
// The fallback exists only so the app runs out of the box in this demo
// environment; it is not fit for production use as-is.
const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET || "dev-insecure-secret-change-in-production");

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: UserRole;
  siteId: string | null;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "tm_session";
