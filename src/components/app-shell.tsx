"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SidebarNav } from "@/components/sidebar-nav";
import { useAuthStore } from "@/lib/auth-store";
import { useAppStore } from "@/lib/store";

const POLL_INTERVAL_MS = 10_000;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const fetchAll = useAppStore((s) => s.fetchAll);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // The application data (evidence, sites, questionnaire fields, ...) now
  // lives server-side and is shared across every device/session. Polling
  // keeps an Admin's screen current when a Store Manager uploads something
  // from a different browser, without needing a full websocket layer.
  useEffect(() => {
    if (!user) return;
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, fetchAll]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (!hydrated) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
