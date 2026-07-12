"use client";

import { AlertTriangle, Inbox } from "lucide-react";
import { motion } from "framer-motion";
import type { CalculationResult } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Renders a calculated metric OR its explicit non-calculable state.
 * This component is the load-bearing guarantee of the whole app: it is
 * structurally impossible to pass it a fabricated number, because the
 * CalculationResult type has no "estimated" variant — only `calculable: true`
 * (with a real value from real inputs) or `calculable: false` with a named
 * reason. There is no code path that prints a placeholder as if it were data.
 */
export function MetricResult({
  result,
  unit,
  size = "lg",
}: {
  result: CalculationResult;
  unit?: string;
  size?: "lg" | "md";
}) {
  const numeralClass = size === "lg" ? "text-[40px] leading-none" : "text-2xl leading-none";

  if (!result.calculable) {
    const isNoEvidence = result.reason === "no_evidence_uploaded";
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="flex items-start gap-3"
      >
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-status-insufficient-bg text-status-insufficient">
          {isNoEvidence ? <Inbox className="size-4.5" /> : <AlertTriangle className="size-4.5" />}
        </div>
        <div>
          <p className={cn("font-semibold text-status-insufficient", size === "lg" ? "text-xl" : "text-base")}>
            {isNoEvidence ? "Awaiting Evidence" : "Unable to Calculate"}
          </p>
          {result.missing.length > 0 && (
            <p className="mt-0.5 text-sm text-text-secondary">
              Missing: {result.missing.join(", ")}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-baseline gap-2"
    >
      <span className={cn("font-semibold tabular-nums text-text-primary", numeralClass)}>
        {result.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </span>
      {unit && <span className="text-sm text-text-secondary">{unit}</span>}
    </motion.div>
  );
}
