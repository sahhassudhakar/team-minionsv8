/**
 * Remove one or more user accounts — run this directly on the server where
 * the app is deployed (it edits data/users.json in place, same pattern as
 * reset-admin-password.js). Also clears any site's assigned Floor Manager
 * email in data/app-data.json if the removed account held that assignment,
 * so no site is left pointing at a login that no longer exists.
 *
 * Usage (from the project root, where package.json lives):
 *   node scripts/remove-user-account.js <email> [<email2> ...]
 *   node scripts/remove-user-account.js --id=<id>
 *   node scripts/remove-user-account.js --list
 *
 * Flags:
 *   --list    Print every account (id, name, email, role) and exit —
 *             nothing is deleted. Use this first to find the right email/id.
 *   --id=x    Remove by account id instead of email (repeatable, or mix
 *             with plain email arguments in the same run).
 *   --force   Allow removing the LAST remaining Admin account. Without
 *             this flag the script refuses, so you can't accidentally
 *             lock yourself out of the app entirely.
 *
 * Examples:
 *   node scripts/remove-user-account.js jane@company.com
 *   node scripts/remove-user-account.js jane@company.com bob@company.com
 *   node scripts/remove-user-account.js --id=a1b2c3d4 --id=e5f6g7h8
 *   node scripts/remove-user-account.js --list
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const APP_DATA_FILE = path.join(DATA_DIR, "app-data.json");

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    console.error(`No data/users.json found at ${USERS_FILE}. Start the app once first so it can bootstrap.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/** Best-effort — if app-data.json doesn't exist yet (fresh checkout), there's nothing to clean up. */
function clearSiteAssignments(removedEmails) {
  if (removedEmails.size === 0 || !fs.existsSync(APP_DATA_FILE)) return 0;
  const data = JSON.parse(fs.readFileSync(APP_DATA_FILE, "utf-8"));
  if (!Array.isArray(data.sites)) return 0;
  let cleared = 0;
  data.sites = data.sites.map((site) => {
    if (site.storeManagerEmail && removedEmails.has(site.storeManagerEmail.toLowerCase())) {
      cleared++;
      return { ...site, storeManagerEmail: null };
    }
    return site;
  });
  if (cleared > 0) fs.writeFileSync(APP_DATA_FILE, JSON.stringify(data, null, 2));
  return cleared;
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const listOnly = args.includes("--list");
  const idFlags = args.filter((a) => a.startsWith("--id=")).map((a) => a.slice("--id=".length));
  const emailArgs = args.filter((a) => !a.startsWith("--"));

  const users = loadUsers();

  if (listOnly) {
    if (users.length === 0) {
      console.log("No accounts found.");
      return;
    }
    console.log(`${users.length} account(s):\n`);
    for (const u of users) {
      console.log(`  id: ${u.id}\n  name: ${u.name}\n  email: ${u.email}\n  role: ${u.role}\n`);
    }
    return;
  }

  if (idFlags.length === 0 && emailArgs.length === 0) {
    console.error("Usage: node scripts/remove-user-account.js <email> [<email2> ...] | --id=<id> | --list");
    process.exit(1);
  }

  const targets = [];
  const notFound = [];

  for (const email of emailArgs) {
    const match = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (match) targets.push(match);
    else notFound.push(email);
  }
  for (const id of idFlags) {
    const match = users.find((u) => u.id === id);
    if (match) targets.push(match);
    else notFound.push(id);
  }

  if (notFound.length > 0) {
    console.error(`No account found for: ${notFound.join(", ")}`);
    process.exit(1);
  }

  // Safety check: never leave the app with zero Admin accounts unless
  // explicitly forced — that would lock everyone out with no way back in
  // short of re-running the bootstrap-admin seed logic by hand.
  const targetIds = new Set(targets.map((u) => u.id));
  const remainingAdmins = users.filter((u) => u.role === "admin" && !targetIds.has(u.id));
  const removingAnyAdmin = targets.some((u) => u.role === "admin");
  if (removingAnyAdmin && remainingAdmins.length === 0 && !force) {
    console.error(
      "Refusing to remove the last remaining Admin account — this would lock everyone out.\n" +
      "Create another Admin account first, or re-run with --force if you're sure."
    );
    process.exit(1);
  }

  const remaining = users.filter((u) => !targetIds.has(u.id));
  saveUsers(remaining);

  const removedEmails = new Set(targets.map((u) => u.email.toLowerCase()));
  const clearedSites = clearSiteAssignments(removedEmails);

  console.log(`Removed ${targets.length} account(s):`);
  for (const u of targets) console.log(`  - ${u.name} <${u.email}> (${u.role})`);
  if (clearedSites > 0) {
    console.log(`Cleared the Floor Manager assignment on ${clearedSites} site(s) that pointed to a removed account.`);
  }
  console.log("\nDone. Any active sessions for these accounts will stop working on their next request.");
}

main();
