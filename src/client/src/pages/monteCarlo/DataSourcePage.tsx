import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DatabaseIcon } from "../../components/icons/DatabaseIcon";
import { FileSpreadsheetIcon } from "../../components/icons/FileSpreadsheetIcon";
import { ImportExcelModal } from "../../components/monteCarlo/ImportExcelModal";
import { MonteCarloLayout } from "../../components/monteCarlo/MonteCarloLayout";
import { MONTE_CARLO_ROUTES } from "../../lib/monteCarlo/routes";
import { useForecast } from "../../monteCarloStore";

const cardBase = "flex h-full w-full flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-5 text-left";
const iconBox = "flex h-10 w-10 items-center justify-center rounded-md";
const iconBoxStyle = { backgroundColor: "var(--cm-dark-blue)", color: "var(--cm-teal)" };

/**
 * Monte Carlo entry page (`/monte-carlo`, breadcrumb step 1): choose where the
 * sprint history comes from. The "Load from Azure DevOps" card is disabled
 * ("Coming soon", `aria-disabled`); the "Import an Excel file" card opens
 * `ImportExcelModal`, and a chosen file becomes the store's data source
 * (clearing any previous validation/execution) before going to the input form.
 */
export function DataSourcePage() {
  const navigate = useNavigate();
  const { setDataSource, setValidation, setExecution } = useForecast();
  const [excelOpen, setExcelOpen] = useState(false);
  const closeExcel = useCallback(() => setExcelOpen(false), []);

  const onFileSelected = (file: File) => {
    setDataSource({ kind: "excel", file });
    setValidation(null);
    setExecution(null);
    setExcelOpen(false);
    navigate(MONTE_CARLO_ROUTES.input);
  };

  return (
    <MonteCarloLayout pageTitle="Data Source" currentStep={1}>
      <h3 className="text-2xl font-semibold">Load sprint history</h3>
      <p className="mt-2 text-slate-400">Choose where the historical sprint data for the simulation comes from.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        <li>
          <div role="button" aria-disabled="true" tabIndex={-1} className={`${cardBase} cursor-not-allowed opacity-60`}>
            <span className="flex items-center gap-3">
              <span className={iconBox} style={iconBoxStyle}>
                <DatabaseIcon className="h-6 w-6" />
              </span>
              <span className="text-lg font-semibold">Load from Azure DevOps</span>
              <span className="ml-auto rounded-full border border-slate-600 px-2 py-0.5 text-xs font-medium text-slate-300">Coming soon</span>
            </span>
            <span className="text-sm text-slate-300">Connect to an Azure DevOps project and load its sprint history directly.</span>
          </div>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setExcelOpen(true)}
            aria-haspopup="dialog"
            className={`${cardBase} transition-colors hover:border-[color:var(--cm-light-blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)]`}
          >
            <span className="flex items-center gap-3">
              <span className={iconBox} style={iconBoxStyle}>
                <FileSpreadsheetIcon className="h-6 w-6" />
              </span>
              <span className="text-lg font-semibold">Import an Excel file</span>
            </span>
            <span className="text-sm text-slate-300">Select a sprint history extract (.xlsx), then set the simulation parameters.</span>
          </button>
        </li>
      </ul>
      <ImportExcelModal open={excelOpen} onClose={closeExcel} onFileSelected={onFileSelected} />
    </MonteCarloLayout>
  );
}
