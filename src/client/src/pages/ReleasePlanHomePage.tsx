import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DatabaseIcon } from "../components/icons/DatabaseIcon";
import { FileJsonIcon } from "../components/icons/FileJsonIcon";
import { ImportJsonModal } from "../components/releasePlan/ImportJsonModal";
import { ReleasePlanLayout } from "../components/releasePlan/ReleasePlanLayout";
import { ReplaceBoardDialog } from "../components/releasePlan/ReplaceBoardDialog";
import { useToast } from "../components/Toast";
import { sourceInfo } from "../lib/releasePlan/selectors";
import type { ReleasePlan } from "../lib/releasePlan/types";
import { useReleasePlan } from "../releasePlanStore";

const cardBase = "flex h-full w-full flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-5 text-left";

const BOARD_PATH = "/release-plan/board";

/**
 * Release Plan entry page (`/release-plan`): choose how to create a board.
 * The "Create from Azure DevOps" card is disabled ("Coming soon",
 * `aria-disabled`); the "Import a JSON file" card opens {@link ImportJsonModal}.
 * A valid file replaces the store's plan (after a "Replace the current board?"
 * confirmation when one exists) and opens the board. With a plan in the store,
 * a "Continue last board" action links to the board.
 */
export function ReleasePlanHomePage() {
  const { plan, replacePlan } = useReleasePlan();
  const { showInfo } = useToast();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<ReleasePlan | null>(null);
  const closeImport = useCallback(() => setImportOpen(false), []);

  const openBoard = useCallback(
    (next: ReleasePlan) => {
      replacePlan(next);
      setPendingPlan(null);
      setImportOpen(false);
      navigate(BOARD_PATH);
      showInfo(`Plan loaded: ${next.name}`);
    },
    [replacePlan, navigate, showInfo],
  );

  const onPlanLoaded = useCallback(
    (next: ReleasePlan) => {
      if (plan) {
        setPendingPlan(next);
      } else {
        openBoard(next);
      }
    },
    [plan, openBoard],
  );

  return (
    <ReleasePlanLayout>
      <div className="max-w-5xl mx-auto">
        {plan && (
          <section aria-label="Last board" className="mb-8 flex flex-wrap items-center gap-4 rounded-lg border border-slate-700 bg-slate-900 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-slate-400">Last board</p>
              <p className="truncate font-semibold">{plan.name}</p>
              <p className="truncate text-sm text-slate-400">
                {sourceInfo(plan.source)}
                {plan.savedAt ? ` · saved ${new Date(plan.savedAt).toLocaleString()}` : ""}
              </p>
            </div>
            <Link
              to={BOARD_PATH}
              className="rounded px-4 py-2 text-sm font-medium text-white hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)]"
              style={{ backgroundColor: "var(--cm-light-blue)" }}
            >
              Continue last board
            </Link>
          </section>
        )}
        <h3 className="text-2xl font-semibold">Create a release plan board</h3>
        <p className="mt-2 text-slate-400">Choose where the board's Epics and Features come from.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          <li>
            <div role="button" aria-disabled="true" tabIndex={-1} className={`${cardBase} cursor-not-allowed opacity-60`}>
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md" style={{ backgroundColor: "var(--cm-dark-blue)", color: "var(--cm-teal)" }}>
                  <DatabaseIcon className="h-6 w-6" />
                </span>
                <span className="text-lg font-semibold">Create from Azure DevOps</span>
                <span className="ml-auto rounded-full border border-slate-600 px-2 py-0.5 text-xs font-medium text-slate-300">Coming soon</span>
              </span>
              <span className="text-sm text-slate-300">Connect to an Azure DevOps project and build a board from its Epics and Features.</span>
            </div>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className={`${cardBase} transition-colors hover:border-[color:var(--cm-light-blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)]`}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md" style={{ backgroundColor: "var(--cm-dark-blue)", color: "var(--cm-teal)" }}>
                  <FileJsonIcon className="h-6 w-6" />
                </span>
                <span className="text-lg font-semibold">Import a JSON file</span>
              </span>
              <span className="text-sm text-slate-300">Open a previously saved release plan from a JSON file.</span>
            </button>
          </li>
        </ul>
      </div>
      <ImportJsonModal open={importOpen} onClose={closeImport} onPlanLoaded={onPlanLoaded} />
      <ReplaceBoardDialog
        currentName={plan?.name ?? ""}
        nextName={plan && pendingPlan ? pendingPlan.name : null}
        onConfirm={() => {
          if (pendingPlan) {
            openBoard(pendingPlan);
          }
        }}
        onCancel={() => setPendingPlan(null)}
      />
    </ReleasePlanLayout>
  );
}
