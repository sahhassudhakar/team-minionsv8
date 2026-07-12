"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Plus, ShieldCheck, FileSearch, Store, Trash2, ChevronRight, Droplets } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ROLE_LABEL } from "@/components/sidebar-nav";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

type Tab = "overview" | "sites" | "frameworks" | "users";

interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  siteId: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/");
  }, [user, router]);

  const [tab, setTab] = useState<Tab>("sites");

  const frameworks = useAppStore((s) => s.frameworks);
  const addFramework = useAppStore((s) => s.addFramework);
  const addFrameworkItem = useAppStore((s) => s.addFrameworkItem);
  const resetDemoData = useAppStore((s) => s.resetDemoData);
  const sites = useAppStore((s) => s.sites);
  const addSite = useAppStore((s) => s.addSite);
  const setSiteBaseline = useAppStore((s) => s.setSiteBaseline);
  const assignStoreManagerToSite = useAppStore((s) => s.assignStoreManagerToSite);

  if (!user || user.role !== "admin") {
    return <p className="text-sm text-text-secondary">Redirecting…</p>;
  }
  const actor = { name: user.name, role: user.role };

  return (
    <div>
      <PageHeader title="Admin" description="Sites, PWI baselines, frameworks, and users." />

      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        {(["sites", "frameworks", "users", "overview"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "border-accent-primary text-accent-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            {t === "users" ? "Users" : t}
          </button>
        ))}
      </div>

      {tab === "sites" && (
        <SitesTab
          sites={sites}
          addSite={addSite}
          setSiteBaseline={setSiteBaseline}
          assignStoreManagerToSite={assignStoreManagerToSite}
          actor={actor}
        />
      )}

      {tab === "users" && <UsersTab sites={sites} assignStoreManagerToSite={assignStoreManagerToSite} />}

      {tab === "frameworks" && (
        <FrameworksTab
          frameworks={frameworks}
          addFramework={addFramework}
          addFrameworkItem={addFrameworkItem}
          actor={actor}
        />
      )}

      {tab === "overview" && (
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-5">
          <p className="text-sm font-semibold text-text-primary">Reset demo data</p>
          <p className="mt-1 text-sm text-text-secondary">
            Clears all evidence, data points, gaps, sites, questionnaire fields, and audit log entries stored
            in this browser. User accounts are stored server-side and are not affected.
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="mt-3"
            onClick={() => {
              if (confirm("This will permanently clear all local demo data. Continue?")) resetDemoData();
            }}
          >
            <Trash2 className="size-4" /> Reset demo data
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sites tab — this is where "PWI goals must be set by Admin" is implemented:
// baseline employee count / avg family size / baseline Replenishment Needed.
// ---------------------------------------------------------------------------
function SitesTab({
  sites,
  addSite,
  setSiteBaseline,
  actor,
}: {
  sites: ReturnType<typeof useAppStore.getState>["sites"];
  addSite: ReturnType<typeof useAppStore.getState>["addSite"];
  setSiteBaseline: ReturnType<typeof useAppStore.getState>["setSiteBaseline"];
  assignStoreManagerToSite: ReturnType<typeof useAppStore.getState>["assignStoreManagerToSite"];
  actor: { name: string; role: "admin" };
}) {
  const [name, setName] = useState("");
  const [basinName, setBasinName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [employeeCount, setEmployeeCount] = useState("");
  const [avgFamilySize, setAvgFamilySize] = useState("");
  const [baselineReplenishment, setBaselineReplenishment] = useState("");

  const selected = sites.find((s) => s.id === selectedId) ?? null;

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !basinName) return;
    const id = await addSite(name, basinName, actor);
    setName("");
    setBasinName("");
    setSelectedId(id);
  };

  const handleSaveBaseline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !employeeCount || !avgFamilySize || !baselineReplenishment) return;
    setSiteBaseline(
      selected.id,
      {
        employeeCount: Number(employeeCount),
        avgFamilySize: Number(avgFamilySize),
        baselineReplenishmentNeededL: Number(baselineReplenishment),
      },
      actor
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Add a site</h3>
        <form onSubmit={handleAddSite} className="space-y-2 rounded-lg border border-border-subtle bg-bg-surface p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary">Site name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Riverton Facility A"
              className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Basin / sub-basin name</label>
            <input
              value={basinName}
              onChange={(e) => setBasinName(e.target.value)}
              placeholder="e.g. Riverton Basin"
              className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
            />
          </div>
          <Button type="submit" size="sm" disabled={!name || !basinName}>
            <Plus className="size-4" /> Add site
          </Button>
        </form>

        <h3 className="mb-2 mt-6 text-sm font-semibold text-text-primary">Sites</h3>
        {sites.length === 0 ? (
          <p className="text-sm text-text-tertiary">None yet — add one above.</p>
        ) : (
          <div className="space-y-1.5">
            {sites.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  setEmployeeCount(s.baseline.employeeCount?.toString() ?? "");
                  setAvgFamilySize(s.baseline.avgFamilySize?.toString() ?? "");
                  setBaselineReplenishment(s.baseline.baselineReplenishmentNeededL?.toString() ?? "");
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  selectedId === s.id ? "border-accent-primary bg-accent-primary/5" : "border-border-subtle hover:bg-bg-surface-sunken"
                )}
              >
                <span>
                  <span className="font-medium text-text-primary">{s.name}</span>{" "}
                  <span className="text-text-tertiary">— {s.basinName}</span>
                </span>
                <div className="flex items-center gap-2">
                  {s.baseline.baselineReplenishmentNeededL != null ? (
                    <StatusBadge tone="confirmed">Baseline set</StatusBadge>
                  ) : (
                    <StatusBadge tone="attention">Baseline needed</StatusBadge>
                  )}
                  <ChevronRight className="size-4 text-text-tertiary" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:col-span-3">
        {selected ? (
          <>
            <h3 className="mb-2 text-sm font-semibold text-text-primary">Baseline &amp; targets — {selected.name}</h3>
            <form onSubmit={handleSaveBaseline} className="space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-4">
              <div>
                <label className="text-xs font-medium text-text-secondary">Employee count (current year)</label>
                <input
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  type="number"
                  className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-tertiary">Sets the Accessibility P1 target directly.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary">Average family size (most recent census)</label>
                <input
                  value={avgFamilySize}
                  onChange={(e) => setAvgFamilySize(e.target.value)}
                  type="number"
                  step="0.1"
                  className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-tertiary">
                  Used for Accessibility P2/P3 targets: Employees × ((Avg. family size − 1) ÷ 2)
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary">Baseline Replenishment Needed (litres)</label>
                <input
                  value={baselineReplenishment}
                  onChange={(e) => setBaselineReplenishment(e.target.value)}
                  type="number"
                  className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-tertiary">
                  Baseline-year Freshwater Withdrawal − Wastewater Discharged. Sets Availability P1 (0.20×), P2
                  (0.40×), P3 (0.40×) targets.
                </p>
              </div>
              <Button type="submit" size="sm">
                Save baseline
              </Button>
              {selected.baseline.setBy && (
                <p className="text-xs text-text-tertiary">
                  Last set by {selected.baseline.setBy} on {new Date(selected.baseline.setAt!).toLocaleDateString()}
                </p>
              )}
            </form>
          </>
        ) : (
          <EmptyState icon={Droplets} title="Select a site" description="Choose a site on the left to set its baseline and targets." />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab — real accounts via the backend API, not hardcoded.
// ---------------------------------------------------------------------------
function UsersTab({
  sites,
  assignStoreManagerToSite,
}: {
  sites: ReturnType<typeof useAppStore.getState>["sites"];
  assignStoreManagerToSite: ReturnType<typeof useAppStore.getState>["assignStoreManagerToSite"];
}) {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("store_manager");
  const [siteId, setSiteId] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, role, siteId: role === "store_manager" ? siteId : null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    if (role === "store_manager" && siteId) assignStoreManagerToSite(siteId, email);
    setEmail("");
    setPassword("");
    setName("");
    setSiteId("");
    loadUsers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this account?")) return;
    await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    loadUsers();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Create account</h3>
        <form onSubmit={handleCreate} className="space-y-2 rounded-lg border border-border-subtle bg-bg-surface p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Password (min. 8 characters)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none">
              <option value="store_manager">Floor Manager</option>
              <option value="auditor">Auditor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {role === "store_manager" && (
            <div>
              <label className="text-xs font-medium text-text-secondary">Assign to site</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none">
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-status-insufficient">{error}</p>}
          <Button type="submit" size="sm" disabled={!email || !password || !name || (role === "store_manager" && !siteId)}>
            <Plus className="size-4" /> Create account
          </Button>
        </form>
      </div>

      <div className="lg:col-span-3">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Accounts</h3>
        {loading ? (
          <p className="text-sm text-text-tertiary">Loading…</p>
        ) : users.length === 0 ? (
          <EmptyState icon={Settings} title="No accounts yet" description="Create one on the left." />
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-surface px-4 py-3">
                <div className="flex items-center gap-3">
                  {u.role === "admin" ? (
                    <ShieldCheck className="size-4 text-accent-primary" />
                  ) : u.role === "auditor" ? (
                    <FileSearch className="size-4 text-ai-advisory" />
                  ) : (
                    <Store className="size-4 text-status-verified" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-text-primary">{u.name}</p>
                    <p className="text-xs text-text-tertiary">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone="neutral">{ROLE_LABEL[u.role as UserRole]}</StatusBadge>
                  <button onClick={() => handleDelete(u.id)} className="rounded p-1 text-text-tertiary hover:bg-bg-surface-sunken hover:text-status-insufficient">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frameworks tab — unchanged from the CDP/ESG side of the app.
// ---------------------------------------------------------------------------
function FrameworksTab({
  frameworks,
  addFramework,
  addFrameworkItem,
  actor,
}: {
  frameworks: ReturnType<typeof useAppStore.getState>["frameworks"];
  addFramework: ReturnType<typeof useAppStore.getState>["addFramework"];
  addFrameworkItem: ReturnType<typeof useAppStore.getState>["addFrameworkItem"];
  actor: { name: string; role: "admin" };
}) {
  const [newName, setNewName] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string | null>(null);
  const [itemCode, setItemCode] = useState("");
  const [itemModule, setItemModule] = useState("");
  const [itemText, setItemText] = useState("");
  const [itemEvidenceHint, setItemEvidenceHint] = useState("");

  const selectedFramework = frameworks.find((f) => f.id === selectedFrameworkId) ?? null;

  const handleAddFramework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newVersion) return;
    const id = await addFramework(newName, newVersion, actor);
    setNewName("");
    setNewVersion("");
    setSelectedFrameworkId(id);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFrameworkId || !itemCode || !itemText) return;
    addFrameworkItem(
      selectedFrameworkId,
      { code: itemCode, module: itemModule || "General", text: itemText, requiredEvidenceHint: itemEvidenceHint || "Supporting evidence not yet specified" },
      actor
    );
    setItemEvidenceHint("");
    setItemCode("");
    setItemModule("");
    setItemText("");
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Add a framework</h3>
        <form onSubmit={handleAddFramework} className="space-y-2 rounded-lg border border-border-subtle bg-bg-surface p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary">Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. GRI 303" className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Version</label>
            <input value={newVersion} onChange={(e) => setNewVersion(e.target.value)} placeholder="e.g. 2026" className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none" />
          </div>
          <Button type="submit" size="sm" disabled={!newName || !newVersion}>
            <Plus className="size-4" /> Add framework
          </Button>
        </form>

        <h3 className="mb-2 mt-6 text-sm font-semibold text-text-primary">Configured frameworks</h3>
        {frameworks.length === 0 ? (
          <p className="text-sm text-text-tertiary">None yet.</p>
        ) : (
          <div className="space-y-1.5">
            {frameworks.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFrameworkId(f.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  selectedFrameworkId === f.id ? "border-accent-primary bg-accent-primary/5" : "border-border-subtle hover:bg-bg-surface-sunken"
                )}
              >
                <span>
                  <span className="font-medium text-text-primary">{f.name}</span> <span className="text-text-tertiary">{f.version}</span>
                </span>
                <ChevronRight className="size-4 text-text-tertiary" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:col-span-3">
        {selectedFramework ? (
          <>
            <h3 className="mb-2 text-sm font-semibold text-text-primary">
              Items — {selectedFramework.name} {selectedFramework.version}
            </h3>
            <form onSubmit={handleAddItem} className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-border-subtle bg-bg-surface p-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-text-secondary">Code</label>
                <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary">Module</label>
                <input value={itemModule} onChange={(e) => setItemModule(e.target.value)} className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-text-secondary">Item text</label>
                <textarea value={itemText} onChange={(e) => setItemText(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-text-secondary">Required evidence (what would answer this?)</label>
                <input
                  value={itemEvidenceHint}
                  onChange={(e) => setItemEvidenceHint(e.target.value)}
                  placeholder="e.g. Board committee charter or governance policy document"
                  className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
                />
              </div>
              <Button type="submit" size="sm" disabled={!itemCode || !itemText} className="w-fit sm:col-span-2">
                <Plus className="size-4" /> Add item
              </Button>
            </form>
          </>
        ) : (
          <EmptyState icon={Settings} title="Select a framework" description="Choose a framework on the left, or add a new one." />
        )}
      </div>
    </div>
  );
}
