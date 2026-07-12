"use client";

import { useMemo, useState } from "react";
import { Info, Droplets } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { PWIFieldVerificationModal } from "@/components/pwi-field-verification-modal";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { computeSitePWI, computePortfolioPWI } from "@/lib/pwi-methodology";
import { PILLAR_LABEL, DIMENSION_LABEL, QUESTIONNAIRE_FIELD_META } from "@/lib/water-types";
import type { ComputedFigure, QuestionnaireField } from "@/lib/water-types";
import { cn } from "@/lib/utils";

function FigureDisplay({ figure, unit, size = "md" }: { figure: ComputedFigure; unit?: string; size?: "sm" | "md" | "lg" }) {
  const numeralClass = size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-sm";
  if (figure.value == null) {
    const isAwaiting = figure.missing.some((m) => /no verified|no evidence/i.test(m));
    return (
      <Tooltip>
        <TooltipTrigger>
          <span className={cn("font-semibold text-status-insufficient", size === "sm" ? "text-xs" : "text-sm")}>
            {isAwaiting ? "Awaiting Evidence" : "Unable to Calculate"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{figure.formula}</p>
          {figure.missing.map((m, i) => (
            <p key={i} className="mt-1 text-text-tertiary">• {m}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className={cn("font-semibold tabular-nums text-text-primary", numeralClass)}>
          {figure.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {unit && <span className="ml-1 text-xs font-normal text-text-secondary">{unit}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{figure.formula}</p>
        {figure.assumptions.map((a, i) => (
          <p key={i} className="mt-1 text-text-tertiary">• {a}</p>
        ))}
        {figure.confidence && <p className="mt-1 text-text-tertiary">Confidence: {figure.confidence}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

export default function PWIPage() {
  const user = useAuthStore((s) => s.user);
  const sites = useAppStore((s) => s.sites);
  const questionnaireFields = useAppStore((s) => s.questionnaireFields);
  const validateField = useAppStore((s) => s.validateQuestionnaireField);
  const rejectField = useAppStore((s) => s.rejectQuestionnaireField);
  const saveManual = useAppStore((s) => s.saveQuestionnaireFieldManually);

  const isAdmin = user?.role === "admin";
  const myAssignedSite = sites.find((s) => s.storeManagerEmail === user?.email);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(myAssignedSite?.id ?? null);
  const [reviewTarget, setReviewTarget] = useState<QuestionnaireField | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const actor = user ? { name: user.name, role: user.role } : null;

  const siteResults = useMemo(() => sites.map((site) => computeSitePWI(site, questionnaireFields)), [sites, questionnaireFields]);
  const portfolio = useMemo(() => computePortfolioPWI(siteResults), [siteResults]);

  const openReview = (f: QuestionnaireField) => {
    setReviewTarget(f);
    setModalOpen(true);
  };

  if (sites.length === 0) {
    return (
      <div>
        <PageHeader title="PWI" description="Positive Water Impact — 3 Pillars × 3 Dimensions, calculated only from verified evidence." />
        <EmptyState
          icon={Droplets}
          title="No sites configured yet"
          description={
            isAdmin
              ? "Create a site and set its baseline under Admin → Sites to begin tracking PWI."
              : "Ask your Admin to create a site before PWI can be tracked."
          }
        />
      </div>
    );
  }

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;
  const selectedResult = selectedSite ? siteResults.find((r) => r.siteId === selectedSite.id) ?? null : null;
  const siteFields = selectedSite ? questionnaireFields.filter((f) => f.siteId === selectedSite.id) : [];
  const pendingFields = siteFields.filter((f) => f.status === "proposed");
  const needsManualFields = siteFields.filter((f) => f.status === "awaiting_evidence");

  return (
    <div>
      <PageHeader
        title="PWI"
        description="Positive Water Impact — 3 Pillars × 3 Dimensions, calculated only from verified evidence."
      />

      {sites.length > 1 && (
        <Card className="mb-6">
          <CardContent className="py-6">
            <p className="mb-2 text-sm font-medium text-text-secondary">Portfolio PWI Score</p>
            <FigureDisplay figure={portfolio} size="lg" />
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {sites.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSiteId(s.id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium",
              selectedSiteId === s.id
                ? "border-accent-primary bg-accent-primary/5 text-accent-primary"
                : "border-border-subtle text-text-secondary hover:bg-bg-surface-sunken"
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {!selectedSite ? (
        <EmptyState icon={Droplets} title="Select a site" description="Choose a site above to view its PWI grid." />
      ) : (
        <>
          {/* Validation queue — deliberately NOT gated behind baseline being set. */}
          {(pendingFields.length > 0 || needsManualFields.length > 0) && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-semibold text-text-primary">
                {isAdmin
                  ? `Awaiting your validation (${pendingFields.length + needsManualFields.length})`
                  : `${pendingFields.length + needsManualFields.length} field(s) awaiting Admin validation`}
              </h2>
              {isAdmin && (
                <div className="space-y-2">
                  {[...pendingFields, ...needsManualFields].map((f) => {
                    const meta = QUESTIONNAIRE_FIELD_META[f.fieldId];
                    const isManual = f.status === "awaiting_evidence";
                    return (
                      <button
                        key={f.id}
                        onClick={() => openReview(f)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors hover:bg-bg-surface-sunken",
                          isManual ? "border-status-insufficient/30 bg-status-insufficient-bg" : "border-border-subtle bg-bg-surface"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary">{meta.label}</p>
                          <p className="text-xs text-text-tertiary">
                            {isManual
                              ? `Low-confidence extraction from ${f.evidenceFileName} — needs manual entry`
                              : `${f.value?.toLocaleString()} ${f.unit} — from ${f.evidenceFileName}`}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-accent-primary">Review →</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {selectedSite.baseline.baselineReplenishmentNeededL == null ? (
            <EmptyState
              icon={Info}
              title="Baseline not set for this site"
              description={
                isAdmin
                  ? "Set employee count, average family size, and baseline Replenishment Needed under Admin → Sites to calculate scores. Evidence can still be uploaded and validated in the meantime."
                  : "Your Admin hasn't set this site's baseline yet — scores can't be calculated until they do."
              }
            />
          ) : (
            <>
              <Card className="mb-6">
                <CardContent className="py-6">
                  <p className="mb-2 text-sm font-medium text-text-secondary">Site PWI Score</p>
                  <FigureDisplay figure={selectedResult!.score} size="lg" />
                </CardContent>
              </Card>

              <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
                {(["P1", "P2", "P3"] as const).map((pillar) => {
                  const pillarResult = selectedResult!.pillars.find((p) => p.pillar === pillar)!;
                  return (
                    <Card key={pillar}>
                      <CardContent className="py-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-semibold text-text-primary">
                            {pillar} — {PILLAR_LABEL[pillar]}
                          </p>
                          <FigureDisplay figure={pillarResult.score} size="sm" />
                        </div>
                        <div className="space-y-3">
                          {pillarResult.cells.map((cell) => (
                            <div key={cell.dimension} className="border-t border-border-subtle pt-2 first:border-0 first:pt-0">
                              <p className="mb-1 text-xs font-medium text-text-secondary">{DIMENSION_LABEL[cell.dimension]}</p>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-text-tertiary">Benefit</span>
                                <FigureDisplay figure={cell.benefit} size="sm" />
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-text-tertiary">Target</span>
                                <FigureDisplay figure={cell.target} size="sm" />
                              </div>
                              <div className="mt-1 flex items-center justify-between text-xs">
                                <span className="font-medium text-text-secondary">Score</span>
                                <FigureDisplay figure={cell.score} size="sm" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <PWIFieldVerificationModal
        field={reviewTarget}
        open={modalOpen}
        onOpenChange={setModalOpen}
        readOnly={!isAdmin}
        onValidate={(id) => {
          if (actor) validateField(id, actor);
          setModalOpen(false);
        }}
        onReject={(id, reason) => {
          if (actor) rejectField(id, actor, reason);
          setModalOpen(false);
        }}
        onManualEntry={(id, value) => {
          if (actor) saveManual(id, value, actor);
          setModalOpen(false);
        }}
      />
    </div>
  );
}
