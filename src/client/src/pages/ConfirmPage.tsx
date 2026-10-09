import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { errorMessages, useToast } from "../components/Toast";
import { runSimulation } from "../lib/runSimulation";
import { useForecast } from "../store";

// Port of confirm.html.
export function ConfirmPage() {
  const navigate = useNavigate();
  const { validation, setExecution } = useForecast();
  const { showError } = useToast();
  const [submitting, setSubmitting] = useState(false);

  if (!validation) {
    return <Navigate to="/" replace />;
  }

  async function onRun() {
    setSubmitting(true);
    try {
      setExecution(await runSimulation(validation!));
      navigate("/results");
    } catch (exc) {
      showError(errorMessages(exc), "Simulation error");
      setSubmitting(false);
    }
  }

  return (
    <Layout title="Monte Carlo Simulator – Confirm Sprint Data" currentStep={2}>
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-x-auto mb-6">
        <table className="min-w-full text-sm text-left">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-2">Sprint</th>
              <th className="px-4 py-2">Items Resolved</th>
              <th className="px-4 py-2">Story Points</th>
              <th className="px-4 py-2">Last Resolved Date</th>
              <th className="px-4 py-2">Recency Rank</th>
              <th className="px-4 py-2">In Sampling Pool?</th>
            </tr>
          </thead>
          <tbody>
            {validation.summary.map((row) => (
              <tr key={row.Sprint} className="border-b border-slate-800/60">
                <td className="px-4 py-2">{row.Sprint}</td>
                <td className="px-4 py-2">{row["Items Resolved"]}</td>
                <td className="px-4 py-2">{row["Story Points"]}</td>
                <td className="px-4 py-2">{row["Last Resolved Date"]}</td>
                <td className="px-4 py-2">{row["Recency Rank"]}</td>
                <td className="px-4 py-2">{row["In Sampling Pool"] ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRun}
          disabled={submitting}
          className="rounded px-4 py-2 font-medium disabled:opacity-60"
          style={{ backgroundColor: "var(--cm-light-blue)", color: "#04101d" }}
        >
          {submitting ? "Running…" : "Confirm and Run Simulation"}
        </button>
      </div>
    </Layout>
  );
}
