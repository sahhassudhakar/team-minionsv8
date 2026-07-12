/**
 * Emergency password reset — run this directly on the server where the app
 * is deployed (it edits data/users.json in place). Use when you're locked
 * out and there's no working Admin account left to do it through the UI.
 *
 * Usage (from the project root, where package.json lives):
 *   node scripts/reset-admin-password.js admin@teamminions.ai NewPassword123!
 *
 * If that email doesn't exist in data/users.json yet, this creates a fresh
 * Admin account with it instead of failing.
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error("Usage: node scripts/reset-admin-password.js <email> <newPassword>");
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

if (!fs.existsSync(USERS_FILE)) {
  console.error(`No data/users.json found at ${USERS_FILE}. Start the app once first so it can bootstrap.`);
  process.exit(1);
}

const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
const passwordHash = bcrypt.hashSync(newPassword, 10);

const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

if (existing) {
  existing.passwordHash = passwordHash;
  console.log(`Password reset for existing account: ${email} (role: ${existing.role})`);
} else {
  users.push({
    id: Math.random().toString(36).slice(2, 10),
    email: email.toLowerCase(),
    passwordHash,
    name: "Recovered Admin",
    role: "admin",
    siteId: null,
    createdAt: new Date().toISOString(),
  });
  console.log(`No account existed for ${email} — created a new Admin account with that email.`);
}

fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
console.log("Done. You can log in now (restart the server if it's already running, to be safe).");
