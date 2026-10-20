import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Board } from "../components/releasePlan/Board";
import { BoardToolbar, type BoardView } from "../components/releasePlan/BoardToolbar";
import "../components/releasePlan/releasePlan.css";
import { ReleasePlanLayout } from "../components/releasePlan/ReleasePlanLayout";
import { SummaryCards } from "../components/releasePlan/SummaryCards";
import { TableView } from "../components/releasePlan/TableView";
import { WorkItemModal } from "../components/releasePlan/WorkItemModal";
import { useToast } from "../components/Toast";
import { computeLayout } from "../lib/releasePlan/layout";
import type { ReleasePlan, WorkItemRef } from "../lib/releasePlan/types";
import { fitZoom, zoomIn, zoomOut } from "../lib/releasePlan/zoom";
import { useReleasePlan } from "../releasePlanStore";

/** Board/Table workspace for a plan. UI-only state (view, zoom, open item) lives here, not in the store. */
function BoardWorkspace({ plan }: { plan: ReleasePlan }) {
  const [view, setView] = useState<BoardView>("board");
  const [zoom, setZoom] = useState(1);
  const [openItem, setOpenItem] = useState<WorkItemRef | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => computeLayout(plan), [plan]);
  const closeItem = useCallback(() => setOpenItem(null), []);

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
      />
      <SummaryCards plan={plan} />
      {view === "board" ? (
        <Board plan={plan} layout={layout} zoom={zoom} scrollRef={scrollRef} onOpenItem={setOpenItem} />
      ) : (
        <TableView plan={plan} onOpenItem={setOpenItem} />
      )}
      <WorkItemModal plan={plan} item={openItem} onNavigate={setOpenItem} onClose={closeItem} />
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
