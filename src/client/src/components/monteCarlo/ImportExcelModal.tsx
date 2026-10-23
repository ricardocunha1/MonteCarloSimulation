import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useDialog } from "../useDialog";

const FILE_ERROR = "Select an .xlsx file.";

/**
 * Modal for choosing the sprint history Excel file on the Monte Carlo data
 * source page. Esc, Cancel and a backdrop click close it. "Continue" requires a
 * file whose name ends in `.xlsx` (case-insensitive; "Select an .xlsx file."
 * inline otherwise, the modal stays open) and hands it to `onFileSelected`. The
 * file is not read here: its content is validated by the server on submit.
 */
export function ImportExcelModal({
  open,
  onClose,
  onFileSelected,
}: {
  /** Whether the modal is shown; reopening resets the chosen file and error. */
  open: boolean;
  /** Called on Cancel, Esc and a backdrop click. */
  onClose: () => void;
  /** Called with the chosen `.xlsx` file; the caller closes the modal. */
  onFileSelected: (file: File) => void;
}) {
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDialog({ open, onClose, dialogRef, initialFocusRef: inputRef });

  // Reset only when the modal opens (false → true), not on parent re-renders.
  useEffect(() => {
    if (open) {
      setFile(null);
      setError(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
  };

  const onContinue = () => {
    if (!file || !file.name.toLowerCase().endsWith(".xlsx")) {
      setError(FILE_ERROR);
      return;
    }
    onFileSelected(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" data-testid="import-excel-backdrop" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
      >
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 id={titleId} className="text-lg font-semibold">
            Import an Excel file
          </h2>
        </div>
        <div className="px-6 py-5 space-y-3 text-sm">
          <p className="text-slate-300">Select the sprint history extract (.xlsx) to run the simulation on.</p>
          <label htmlFor={inputId} className="block font-medium text-slate-200">
            Sprint history file
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".xlsx"
            onChange={onChange}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="block w-full text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-100 hover:file:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)]"
          />
          <p className="text-slate-400" data-testid="import-excel-file-name">
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
            onClick={onContinue}
            className="rounded px-4 py-2 text-sm font-medium hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-light-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            style={{ backgroundColor: "var(--cm-light-blue)", color: "#04101d" }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
