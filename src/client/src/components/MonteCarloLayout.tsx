import { useCallback, useState, type ReactNode } from "react";
import { HUB_NAME } from "../lib/tools";
import { Breadcrumb } from "./Breadcrumb";
import { HelpModal } from "./HelpModal";
import { Layout } from "./Layout";

/** Hub layout plus the Monte Carlo view header (heading, Help button, step breadcrumb). */
export function MonteCarloLayout({
  pageTitle,
  currentStep,
  children,
}: {
  /** Step name, used in the document title ("CM Estimations Hub – Monte Carlo – <pageTitle>"). */
  pageTitle: string;
  /** 1-based step highlighted in the breadcrumb (1 Data Input, 2 Confirm, 3 Results). */
  currentStep: number;
  children: ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  return (
    <Layout title={`${HUB_NAME} – Monte Carlo – ${pageTitle}`}>
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-800">
        <h2 className="text-lg font-semibold">Monte Carlo</h2>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="ml-auto flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)]"
          style={{ backgroundColor: "var(--cm-teal)", color: "#04101d" }}
        >
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zM11 6a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h.01a1 1 0 100-2V10a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          How to Use
        </button>
      </div>
      <HelpModal open={helpOpen} onClose={closeHelp} />
      <Breadcrumb currentStep={currentStep} />
      <div className="px-6 py-8 max-w-5xl mx-auto">{children}</div>
    </Layout>
  );
}
