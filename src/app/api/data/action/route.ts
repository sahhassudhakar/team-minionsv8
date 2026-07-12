import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/get-session";
import * as store from "@/lib/server/data-store";

/**
 * Every mutation here requires the Admin role — Store Manager's only write
 * permission is the upload endpoint; Auditor has none. Consolidating these
 * into one action-dispatch endpoint keeps the route count manageable; each
 * action still maps 1:1 to a real, persisted, audit-logged operation in
 * data-store.ts — this is a routing convenience, not a shortcut on rigor.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — Admin only." }, { status: 403 });
  }

  const actor = { name: session.name, role: session.role };
  const body = await request.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "Missing action." }, { status: 400 });

  const { action, payload } = body as { action: string; payload: Record<string, unknown> };

  try {
    switch (action) {
      case "verifyDataPoint": {
        const data = await store.verifyDataPoint(payload.id as string, actor, payload.correctedValue as number | undefined);
        return NextResponse.json({ data });
      }
      case "rejectDataPoint": {
        const data = await store.rejectDataPoint(payload.id as string, actor, payload.reason as string);
        return NextResponse.json({ data });
      }
      case "saveManualEntry": {
        const data = await store.saveManualEntry(payload.id as string, payload.value as number, payload.unit as string, actor);
        return NextResponse.json({ data });
      }
      case "validateQuestionnaireField": {
        const data = await store.validateQuestionnaireField(payload.id as string, actor);
        return NextResponse.json({ data });
      }
      case "rejectQuestionnaireField": {
        const data = await store.rejectQuestionnaireField(payload.id as string, actor, payload.reason as string);
        return NextResponse.json({ data });
      }
      case "saveQuestionnaireFieldManually": {
        const data = await store.saveQuestionnaireFieldManually(payload.id as string, payload.value as number, actor);
        return NextResponse.json({ data });
      }
      case "addFramework": {
        const { data, frameworkId } = await store.addFramework(payload.name as string, payload.version as string, actor);
        return NextResponse.json({ data, frameworkId });
      }
      case "addFrameworkItem": {
        const data = await store.addFrameworkItem(
          payload.frameworkId as string,
          payload.item as Parameters<typeof store.addFrameworkItem>[1],
          actor
        );
        return NextResponse.json({ data });
      }
      case "linkDataPointToItem": {
        const data = await store.linkDataPointToItem(payload.frameworkId as string, payload.itemId as string, payload.dataPointId as string, actor);
        return NextResponse.json({ data });
      }
      case "unlinkDataPointFromItem": {
        const data = await store.unlinkDataPointFromItem(payload.frameworkId as string, payload.itemId as string, payload.dataPointId as string, actor);
        return NextResponse.json({ data });
      }
      case "linkEvidenceToItem": {
        const data = await store.linkEvidenceToItem(payload.frameworkId as string, payload.itemId as string, payload.evidenceId as string, actor);
        return NextResponse.json({ data });
      }
      case "unlinkEvidenceFromItem": {
        const data = await store.unlinkEvidenceFromItem(payload.frameworkId as string, payload.itemId as string, payload.evidenceId as string, actor);
        return NextResponse.json({ data });
      }
      case "generateDraftAnswer": {
        const data = await store.generateDraftAnswer(payload.frameworkId as string, payload.itemId as string, actor);
        return NextResponse.json({ data });
      }
      case "approveDraftAnswer": {
        const data = await store.approveDraftAnswer(payload.frameworkId as string, payload.itemId as string, actor);
        return NextResponse.json({ data });
      }
      case "resolveGap": {
        const data = await store.resolveGap(payload.gapId as string, actor);
        return NextResponse.json({ data });
      }
      case "addSite": {
        const { data, siteId } = await store.addSite(payload.name as string, payload.basinName as string, actor);
        return NextResponse.json({ data, siteId });
      }
      case "setSiteBaseline": {
        const data = await store.setSiteBaseline(
          payload.siteId as string,
          payload.baseline as Parameters<typeof store.setSiteBaseline>[1],
          actor
        );
        return NextResponse.json({ data });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
