import { AdoConnectModal as SharedAdoConnectModal, type AdoConnectInitial, type AdoScopeTypes } from "../ado/AdoConnectModal";
import { adoBacklog } from "../../lib/releasePlan/adoApi";
import type { AdoBacklog, AdoConnection } from "../../lib/releasePlan/adoTypes";
import { ADO_CONNECTION_KEY } from "../../lib/releasePlan/constants";

export type { AdoConnectInitial };

/** What the modal is opened for: a new board (home card) or a sync of the open board (toolbar). */
export type AdoConnectPurpose = "create" | "sync";

interface AdoConnectModalProps {
  /** Whether the modal is shown; it starts fresh every time it opens. */
  open: boolean;
  purpose: AdoConnectPurpose;
  /** Pre-fills the form and pre-selects the path after Connect; otherwise the remembered connection pre-fills it. */
  initial?: AdoConnectInitial;
  /** Cancel, Esc or a backdrop click; an in-flight request is aborted. */
  onClose: () => void;
  /** The fetched backlog and the connection it came from (canonical URL, no PAT); the caller closes the modal. */
  onBacklog: (backlog: AdoBacklog, connection: AdoConnection) => void;
}

const TEXT = {
  create: { title: "Create from Azure DevOps", submit: "Create board" },
  sync: { title: "Sync from Azure DevOps", submit: "Preview changes" },
} as const;

const SCOPE_TYPES: AdoScopeTypes = ["area", "iteration"];

/**
 * Release Plan's Azure DevOps modal: the shared {@link SharedAdoConnectModal}
 * with the Area/Iteration toggle, Release Plan's remembered connection and
 * `POST /api/ado/backlog` as the loader. `purpose` picks the title and submit
 * label ("Create board" / "Preview changes").
 */
export function AdoConnectModal({ open, purpose, initial, onClose, onBacklog }: AdoConnectModalProps) {
  const text = TEXT[purpose];
  return (
    <SharedAdoConnectModal<AdoBacklog>
      open={open}
      title={text.title}
      submitLabel={text.submit}
      scopeTypes={SCOPE_TYPES}
      connectionKey={ADO_CONNECTION_KEY}
      initial={initial}
      onClose={onClose}
      load={adoBacklog}
      onLoaded={onBacklog}
    />
  );
}
