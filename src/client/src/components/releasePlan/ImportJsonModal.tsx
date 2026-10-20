import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import type { ReleasePlan } from "../../lib/releasePlan/types";
import { parsePlanFile } from "../../lib/releasePlan/validate";
import { useDialog } from "../useDialog";

const FILE_ERROR = "Select a .json file.";

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsText(file);
  });
}

/**
 * Modal for picking a previously exported release plan JSON file. Esc, Cancel
 * and a backdrop click close it. "Create board" requires a file whose name ends
 * in `.json` ("Select a .json file." otherwise), reads and validates it with
 * `parsePlanFile`, shows any validation error inline (the modal stays open) and
 * hands a valid plan to `onPlanLoaded`; the caller decides what happens next
 * (confirmation, store, navigation) and closes the modal.
 */
export function ImportJsonModal({
  open,
  onClose,
  onPlanLoaded,
}: {
  /** Whether the modal is shown; reopening resets the chosen file and error. */
  open: boolean;
  /** Called on Cancel, Esc and a backdrop click. */
  onClose: () => void;
  /** Called with the normalized plan when the chosen file is a valid plan. */
  onPlanLoaded?: (plan: ReleasePlan) => void;
}) {
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useDialog({ open, onClose, dialogRef, initialFocusRef: inputRef });

  // Reset only when the modal opens (false → true), not on parent re-renders.
  useEffect(() => {
    if (open) {
      setFile(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
  };

  const onCreate = async () => {
    if (!file || !file.name.toLowerCase().endsWith(".json")) {
      setError(FILE_ERROR);
      return;
    }
    setBusy(true);
    try {
      const plan = parsePlanFile(await readFileText(file));
      setError(null);
      onPlanLoaded?.(plan);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" data-testid="import-json-backdrop" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
      >
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 id={titleId} className="text-lg font-semibold">
            Import a JSON file
          </h2>
        </div>
        <div className="px-6 py-5 space-y-3 text-sm">
          <p className="text-slate-300">Select a release plan previously exported as JSON to create a board from it.</p>
          <label htmlFor={inputId} className="block font-medium text-slate-200">
            Release plan file
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".json,application/json"
            onChange={onChange}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="block w-full text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-100 hover:file:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)]"
          />
          <p className="text-slate-400" data-testid="import-json-file-name">
            {file ? (
              <>
                Selected file: <span className="font-medium text-slate-200">{file.name}</span>
              </>
            ) : (
              "No file selected."
            )}
          </p>
          {error && (
            <p id={errorId} role="alert" className="text-red-400">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={busy}
            className="rounded px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            style={{ backgroundColor: "var(--cm-light-blue)" }}
          >
            Create board
          </button>
        </div>
      </div>
    </div>
  );
}
