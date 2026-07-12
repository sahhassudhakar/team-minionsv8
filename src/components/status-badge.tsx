import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The single status vocabulary for the whole app (per the Staff Designer
 * redesign pass): three states only, expressed through color + one dot icon.
 * Every domain status (evidence, data point, gap, report...) maps onto one
 * of these three, plus a distinct "neutral" for not-yet-started and a
 * visually separate "advisory" treatment reserved exclusively for
 * AI-generated content so it is never confused with verified fact.
 */
export type StatusTone = "confirmed" | "attention" | "blocked" | "neutral" | "advisory";

const toneStyles: Record<StatusTone, { bg: string; text: string; dot: string }> = {
  confirmed: { bg: "bg-status-verified-bg", text: "text-status-verified", dot: "bg-status-verified" },
  attention: { bg: "bg-status-proposed-bg", text: "text-status-proposed", dot: "bg-status-proposed" },
  blocked: { bg: "bg-status-insufficient-bg", text: "text-status-insufficient", dot: "bg-status-insufficient" },
  neutral: { bg: "bg-status-neutral-bg", text: "text-status-neutral", dot: "bg-status-neutral" },
  advisory: { bg: "bg-ai-advisory-bg", text: "text-ai-advisory", dot: "bg-ai-advisory" },
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  const s = toneStyles[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        s.bg,
        s.text,
        className
      )}
    >
      {tone === "advisory" ? (
        <Sparkles className="size-3" />
      ) : (
        <span className={cn("size-1.5 rounded-full", s.dot)} />
      )}
      {children}
    </span>
  );
}

export function evidenceStatusBadge(status: string) {
  switch (status) {
    case "verified":
      return { tone: "confirmed" as const, label: "Verified" };
    case "uploaded":
      return { tone: "neutral" as const, label: "Uploaded" };
    case "queued_for_extraction":
      return { tone: "neutral" as const, label: "Processing" };
    case "extracted":
      return { tone: "attention" as const, label: "Needs review" };
    case "rejected":
      return { tone: "blocked" as const, label: "Rejected" };
    case "archived":
      return { tone: "neutral" as const, label: "Archived" };
    default:
      return { tone: "neutral" as const, label: status };
  }
}

export function dataPointStatusBadge(status: string) {
  switch (status) {
    case "verified":
      return { tone: "confirmed" as const, label: "Verified" };
    case "proposed":
      return { tone: "attention" as const, label: "Needs review" };
    case "needs_manual_entry":
      return { tone: "blocked" as const, label: "Needs manual entry" };
    case "rejected":
      return { tone: "blocked" as const, label: "Rejected" };
    case "superseded":
      return { tone: "neutral" as const, label: "Superseded" };
    default:
      return { tone: "neutral" as const, label: status };
  }
}

export function gapStatusBadge(status: string) {
  switch (status) {
    case "resolved":
      return { tone: "confirmed" as const, label: "Resolved" };
    case "escalated":
      return { tone: "blocked" as const, label: "Escalated" };
    case "in_progress":
      return { tone: "attention" as const, label: "In progress" };
    case "open":
      return { tone: "neutral" as const, label: "Open" };
    default:
      return { tone: "neutral" as const, label: status };
  }
}
