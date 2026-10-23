import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Board } from "../components/releasePlan/Board";
import { BoardToolbar, type BoardView } from "../components/releasePlan/BoardToolbar";
import { ImportJsonModal } from "../components/releasePlan/ImportJsonModal";
import "../components/releasePlan/releasePlan.css";
import { ReleasePlanLayout } from "../components/releasePlan/ReleasePlanLayout";
import { ReplaceBoardDialog } from "../components/releasePlan/ReplaceBoardDialog";
import { SummaryCards } from "../components/releasePlan/SummaryCards";
import { TableView } from "../components/releasePlan/TableView";
import { useExportPng } from "../components/releasePlan/useExportPng";
import { WorkItemModal } from "../components/releasePlan/WorkItemModal";
import { useToast } from "../components/Toast";
import { downloadBlob, fileBase, planToJson } from "../lib/releasePlan/exportFile";
import { computeLayout } from "../lib/releasePlan/layout";
import type { ReleasePlan, WorkItemRef } from "../lib/releasePlan/types";
import { fitZoom, zoomIn, zoomOut } from "../lib/releasePlan/zoom";
import { useReleasePlan } from "../releasePlanStore";

/**
 * Board/Table workspace for a plan. UI-only state (view, zoom, open item, the
 * Load Plan modal and its pending plan) lives here, not in the store.
 *
 * Save Plan downloads `planToJson(plan)` as `<fileBase>.json` without touching
 * the store. Load Plan opens {@link ImportJsonModal}; a valid file asks
 * {@link ReplaceBoardDialog}, then replaces the plan, closes the work-item
 * modal and remounts `Board` (new `key`) so its selection, gap menu and drag
 * state reset. View and zoom are kept. Export PNG ({@link useExportPng}) works
 * from both views.
 */
function BoardWorkspace({ plan }: { plan: ReleasePlan }) {
  const { replacePlan } = useReleasePlan();
  const { showInfo } = useToast();
  const [view, setView] = useState<BoardView>("board");
  const [zoom, setZoom] = useState(1);
  const [openItem, setOpenItem] = useState<WorkItemRef | null>(null);
  const [loadOpen, setLoadOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<ReleasePlan | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => computeLayout(plan), [plan]);
  const closeItem = useCallback(() => setOpenItem(null), []);
  const closeLoad = useCallback(() => setLoadOpen(false), []);
  const { exporting, exportPng } = useExportPng(plan);

  const onSave = () => {
    const now = new Date();
    downloadBlob(new Blob([planToJson(plan, now)], { type: "application/json" }), `${fileBase(plan.name, now)}.json`);
    showInfo("Plan saved");
  };

  const onConfirmLoad = () => {
    if (!pendingPlan) {
      return;
    }
    replacePlan(pendingPlan);
    setPendingPlan(null);
    setLoadOpen(false);
    setOpenItem(null);
    setBoardKey((k) => k + 1);
    showInfo(`Plan loaded: ${pendingPlan.name}`);
  };

  const onFit = () => {
    const box = scrollRef.current;
    if (box) {
      setZoom(fitZoom(box.clientWidth, layout.width));
    }
  };

  return (
    <div className="rp">
      <BoardToolbar
        plan={plan}
        view={view}
        onViewChange={setView}
        zoom={zoom}
        onZoomIn={() => setZoom(zoomIn)}
        onZoomOut={() => setZoom(zoomOut)}
        onFit={onFit}
        onLoad={() => setLoadOpen(true)}
        onSave={onSave}
        onExportPng={() => void exportPng()}
        exporting={exporting}
      />
      <SummaryCards plan={plan} />
      {view === "board" ? (
        <Board key={boardKey} plan={plan} layout={layout} zoom={zoom} scrollRef={scrollRef} onOpenItem={setOpenItem} />
      ) : (
        <TableView plan={plan} onOpenItem={setOpenItem} />
      )}
      <WorkItemModal plan={plan} item={openItem} onNavigate={setOpenItem} onClose={closeItem} />
      <ImportJsonModal open={loadOpen} onClose={closeLoad} onPlanLoaded={setPendingPlan} title="Load a plan" submitLabel="Load" />
      <ReplaceBoardDialog
        currentName={plan.name}
        nextName={pendingPlan ? pendingPlan.name : null}
        onConfirm={onConfirmLoad}
        onCancel={() => setPendingPlan(null)}
      />
    </div>
  );
}

/**
 * Release Plan board page (`/release-plan/board`). Redirects to `/release-plan`
 * when there is no plan; shows "Restored your last session" once when the plan
 * was hydrated from storage.
 */
export function ReleasePlanBoardPage() {
  const { plan, consumeRestoredNotice } = useReleasePlan();
  const { showInfo } = useToast();
  const hasPlan = plan !== null;

  useEffect(() => {
    if (hasPlan && consumeRestoredNotice()) {
      showInfo("Restored your last session");
    }
  }, [hasPlan, consumeRestoredNotice, showInfo]);

  if (!plan) {
    return <Navigate to="/release-plan" replace />;
  }
  return (
    <ReleasePlanLayout page="Board">
      <BoardWorkspace plan={plan} />
    </ReleasePlanLayout>
  );
}
