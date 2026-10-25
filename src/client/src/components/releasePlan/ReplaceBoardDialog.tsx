import { ConfirmDialog } from "../ConfirmDialog";

/** Title (and accessible name) of the "replace the current board" confirmation. */
export const REPLACE_BOARD_TITLE = "Replace the current board?";

/** Body of the "replace the current board" confirmation. */
export function replaceBoardMessage(currentName: string, nextName: string): string {
  return `The current board "${currentName}" will be replaced by "${nextName}". Changes to the current board will be lost.`;
}

/**
 * The one "Replace the current board?" confirmation, shared by the Release
 * Plan home page (import) and the board page (Load Plan) so the text can't
 * drift. Open while `nextName` is not `null`; the caller closes it from
 * `onConfirm`/`onCancel`.
 */
export function ReplaceBoardDialog({
  currentName,
  nextName,
  onConfirm,
  onCancel,
}: {
  /** Name of the plan currently in the store. */
  currentName: string;
  /** Name of the plan that would replace it; `null` keeps the dialog closed. */
  nextName: string | null;
  /** "Replace": the caller swaps the plan in and clears `nextName`. */
  onConfirm: () => void;
  /** Cancel, Esc or a backdrop click: the caller keeps the current plan and clears `nextName`. */
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={nextName !== null}
      title={REPLACE_BOARD_TITLE}
      message={nextName !== null ? replaceBoardMessage(currentName, nextName) : ""}
      confirmLabel="Replace"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
