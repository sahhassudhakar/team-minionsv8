"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";

export default function FrameworksPage() {
  const frameworks = useAppStore((s) => s.frameworks);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  return (
    <div>
      <PageHeader
        title="Frameworks"
        description="Disclosure frameworks configured for this organization. Configuration lives under Admin."
      />

      {frameworks.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No frameworks configured"
          description={
            isAdmin
              ? "Configure a disclosure framework (GRI, CDP, BRSR, ESRS) under Admin → Frameworks before evidence can be mapped."
              : "Contact your Admin to configure a disclosure framework before evidence can be mapped."
          }
          actionLabel={isAdmin ? "Go to Admin → Frameworks" : undefined}
          onAction={isAdmin ? () => (window.location.href = "/admin") : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {frameworks.map((f) => {
              const readyCount = f.items.filter((i) => i.status === "ready").length;
              const pct = f.items.length ? (readyCount / f.items.length) * 100 : 0;
              return (
                <Link
                  key={f.id}
                  href={`/frameworks/${f.id}`}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <p className="text-base font-semibold text-text-primary">{f.name}</p>
                  <p className="text-xs text-text-tertiary">{f.version}</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-surface-sunken">
                    <div className="h-full rounded-full bg-status-verified" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    {f.items.length === 0 ? "No items configured yet" : `${readyCount} of ${f.items.length} items ready`}
                  </p>
                  <p className="mt-3 text-xs font-medium text-accent-primary">Open →</p>
                </Link>
              );
            })}
          </div>
          {isAdmin && (
            <p className="mt-4 text-sm text-text-tertiary">
              Add or edit items in{" "}
              <Link href="/admin" className="font-medium text-accent-primary hover:underline">
                Admin → Frameworks
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
