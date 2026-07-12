import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

/**
 * Real (file-backed) user persistence. This is intentionally the same shape
 * as the `users` table in the PostgreSQL schema designed earlier for this
 * product — swapping this module for real Postgres calls later requires no
 * changes to the API routes that call it.
 *
 * Passwords are bcrypt-hashed (10 rounds). Nothing here stores or logs a
 * plaintext password at any point after account creation.
 */

export type UserRole = "admin" | "auditor" | "store_manager";

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  siteId: string | null; // required for store_manager; null otherwise
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureStore(): StoredUser[] {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    // Bootstrap exactly one Admin account so there is always a way to log in
    // on a fresh checkout. Every other account (Auditor, Floor Manager) is
    // created by this Admin via the Admin UI — never hardcoded beyond this
    // single bootstrap seed.
    const bootstrapAdmin: StoredUser = {
      id: "bootstrap-admin",
      email: "admin@teamminions.ai",
      passwordHash: bcrypt.hashSync("ChangeMe123!", 10),
      name: "Priya Nair",
      role: "admin",
      siteId: null,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify([bootstrapAdmin], null, 2));
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function saveStore(users: StoredUser[]) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export function listUsers(): Omit<StoredUser, "passwordHash">[] {
  return ensureStore().map(({ passwordHash: _passwordHash, ...rest }) => rest);
}

export function findByEmail(email: string): StoredUser | null {
  return ensureStore().find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null;
}

export function verifyPassword(email: string, password: string): StoredUser | null {
  const user = findByEmail(email);
  if (!user) return null;
  return bcrypt.compareSync(password, user.passwordHash) ? user : null;
}

export function createUser(input: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  siteId?: string | null;
}): { ok: true; user: Omit<StoredUser, "passwordHash"> } | { ok: false; error: string } {
  const users = ensureStore();
  if (users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
    return { ok: false, error: "An account with this email already exists." };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const newUser: StoredUser = {
    id: Math.random().toString(36).slice(2, 10),
    email: input.email.trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(input.password, 10),
    name: input.name,
    role: input.role,
    siteId: input.siteId ?? null,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveStore(users);
  const { passwordHash: _passwordHash, ...rest } = newUser;
  return { ok: true, user: rest };
}

export function deleteUser(id: string): boolean {
  const users = ensureStore();
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) return false;
  saveStore(next);
  return true;
}
