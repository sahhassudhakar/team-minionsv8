"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileStack,
  CircleDot,
  Gauge,
  Cloud,
  ClipboardList,
  History,
  Settings,
  Diamond,
  LogOut,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import type { UserRole } from "@/lib/types";

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  auditor: "Auditor",
  store_manager: "Floor Manager",
};

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "auditor", "store_manager"] },
  { href: "/evidence", label: "Evidence", icon: FileStack, roles: ["admin", "auditor", "store_manager"] },
  { href: "/pwi", label: "PWI", icon: Gauge, roles: ["admin", "auditor", "store_manager"] },
  { href: "/cdp", label: "CDP", icon: Cloud, roles: ["admin", "auditor", "store_manager"] },
  { href: "/roadmap", label: "Roadmap", icon: TrendingUp, roles: ["admin", "auditor", "store_manager"] },
  { href: "/data-points", label: "Data Points", icon: CircleDot, roles: ["admin", "auditor", "store_manager"] },
  { href: "/reports", label: "Reports", icon: ClipboardList, roles: ["admin", "auditor", "store_manager"] },
  { href: "/audit-trail", label: "Audit Trail", icon: History, roles: ["admin", "auditor"] },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const role = user?.role ?? "store_manager";
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-bg-surface md:flex">
      <div className="flex h-14 items-center gap-2 px-4">
        <Diamond className="size-4 fill-accent-primary text-accent-primary" />
        <span className="text-sm font-semibold text-text-primary">Team Minions</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {visibleItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-l-accent-primary bg-accent-primary/5 font-medium text-accent-primary"
                  : "text-text-secondary hover:bg-bg-surface-sunken hover:text-text-primary"
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border-subtle p-2">
        {role === "admin" && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              pathname === "/admin"
                ? "bg-accent-primary/5 font-medium text-accent-primary"
                : "text-text-secondary hover:bg-bg-surface-sunken hover:text-text-primary"
            )}
          >
            <Settings className="size-4" strokeWidth={1.75} />
            Admin
          </Link>
        )}
        <div className="mt-2 flex items-center gap-2.5 px-3 py-1.5">
          <div className="flex size-6 items-center justify-center rounded-full bg-accent-primary text-[11px] font-medium text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-text-primary">{user?.name ?? "Not signed in"}</p>
            <p className="truncate text-[11px] text-text-tertiary">{ROLE_LABEL[role]}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="rounded p-1 text-text-tertiary hover:bg-bg-surface-sunken hover:text-text-primary"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
