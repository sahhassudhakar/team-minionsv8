"use client";

import { motion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  tone = "default",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** "positive" is used for the rare empty states that are good news (e.g. zero open gaps) */
  tone?: "default" | "positive";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-subtle bg-bg-surface px-6 py-16 text-center"
    >
      <div
        className={
          tone === "positive"
            ? "mb-4 flex size-12 items-center justify-center rounded-full bg-status-verified-bg text-status-verified"
            : "mb-4 flex size-12 items-center justify-center rounded-full bg-bg-surface-sunken text-text-tertiary"
        }
      >
        <Icon className="size-6" strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
