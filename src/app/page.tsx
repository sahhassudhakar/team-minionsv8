"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Inbox, ArrowRight, UploadCloud } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const evidence = useAppStore((s) => s.evidence);
  const dataPoints = useAppStore((s) => s.dataPoints);
  const auditLog = useAppStore((s) => s.auditLog);

  const role = user?.role ?? "store_manager";
  const needsReview = dataPoints.filter((d) => d.status === "proposed" || d.status === "needs_manual_entry");
  const recentEvidence = [...evidence]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 8);
  const hasAnyData = evidence.length > 0;

  if (role === "auditor") {
    return (
      <div>
        <div className="mb-8">
          <p className="text-sm text-text-secondary">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">Welcome, {user?.name}</h1>
          <p className="mt-1 text-sm text-text-secondary">You have read-only, auditor-level access across this workspace.</p>
        </div>

        <Card className="mb-6 bg-ai-advisory/[0.03]">
          <CardContent className="flex items-center justify-between py-6">
            <div>
              <p className="text-lg font-semibold text-text-primary">{auditLog.length} logged action{auditLog.length === 1 ? "" : "s"}</p>
              <p className="mt-1 text-sm text-text-secondary">Every upload, extraction, verification, and configuration change is recorded here.</p>
            </div>
            <Button asChild size="lg">
              <Link href="/audit-trail">
                View audit trail <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="py-5">
              <p className="text-xs font-medium text-text-secondary">Evidence on file</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{evidence.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <p className="text-xs font-medium text-text-secondary">Data points pending review</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{needsReview.length}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const myUploads = evidence.filter((e) => e.uploadedBy === user?.name);

  if (role === "store_manager") {
    return (
      <div>
        <div className="mb-8">
          <p className="text-sm text-text-secondary">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">
            Good morning, {user?.name?.split(" ")[0] ?? ""}
          </h1>
        </div>

        <Card className="mb-8 bg-accent-primary/[0.03]">
          <CardContent className="flex items-center justify-between py-6">
            <div>
              <p className="text-lg font-semibold text-text-primary">
                {myUploads.length > 0
                  ? `${myUploads.length} document${myUploads.length === 1 ? "" : "s"} you've uploaded so far`
                  : "Upload evidence to start the review pipeline"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Upload utility bills, invoices, or other source documents — an Admin verifies the extracted values afterward.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/evidence">
                Upload evidence <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Your recent uploads</h2>
          {hasAnyData && (
            <Link href="/evidence" className="text-sm font-medium text-accent-primary hover:underline">
              View all
            </Link>
          )}
        </div>

        {myUploads.length > 0 ? (
          <Card>
            <CardContent className="divide-y divide-border-subtle p-0">
              {myUploads.slice(0, 8).map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-text-primary">{e.fileName}</span>
                  <span className="text-xs text-text-tertiary">{e.status.replace(/_/g, " ")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={Inbox}
            title="You haven't uploaded anything yet"
            description="Once you upload a document, it's automatically queued for extraction and review — no further action needed from you."
            actionLabel="Upload Evidence"
            onAction={() => (window.location.href = "/evidence")}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm text-text-secondary">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-text-primary">Good morning, {user?.name?.split(" ")[0] ?? ""}</h1>
      </div>

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
        <Card className="mb-8 bg-accent-primary/[0.03]">
          <CardContent className="flex items-center justify-between py-6">
            <div>
              <p className="text-lg font-semibold text-text-primary">
                {needsReview.length > 0
                  ? `${needsReview.length} data point${needsReview.length === 1 ? "" : "s"} need${
                      needsReview.length === 1 ? "s" : ""
                    } your review`
                  : "Nothing needs your review right now"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {needsReview.length > 0
                  ? "Verify extracted values against their source evidence."
                  : "New extractions will appear here as evidence is uploaded."}
              </p>
            </div>
            {needsReview.length > 0 && (
              <Button asChild size="lg">
                <Link href="/data-points">
                  Review now <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Recently uploaded</h2>
        {hasAnyData && (
          <Link href="/evidence" className="text-sm font-medium text-accent-primary hover:underline">
            View all
          </Link>
        )}
      </div>

      {hasAnyData ? (
        <Card>
          <CardContent className="divide-y divide-border-subtle p-0">
            {recentEvidence.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-text-primary">{e.fileName}</span>
                <span className="text-xs text-text-tertiary">{e.status.replace(/_/g, " ")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Inbox}
          title="No evidence uploaded yet"
          description="Upload your first document to start building disclosure-ready data. Utility bills, invoices, audit reports, and policy documents all work."
          actionLabel="Upload Evidence"
          onAction={() => (window.location.href = "/evidence")}
        />
      )}

      {!hasAnyData && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-dashed border-border-subtle px-4 py-3 text-sm text-text-tertiary">
          <UploadCloud className="size-4" />
          Once evidence is uploaded, extraction, verification tasks, and PWI/CDP readiness will populate automatically — nothing here is preloaded.
        </div>
      )}
    </div>
  );
}
