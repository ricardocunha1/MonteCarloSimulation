import { AdoConnectModal as SharedAdoConnectModal, type AdoScopeTypes } from "../ado/AdoConnectModal";
import { adoBacklog } from "../../lib/releasePlan/adoApi";
import type { AdoBacklog, AdoConnection } from "../../lib/releasePlan/adoTypes";
import { ADO_CONNECTION_KEY } from "../../lib/releasePlan/constants";

interface AdoConnectModalProps {
  /** Whether the modal is shown; it starts fresh every time it opens. */
  open: boolean;
  /** Cancel, Esc or a backdrop click; an in-flight request is aborted. */
  onClose: () => void;
  /** The fetched backlog and the connection it came from (canonical URL, no PAT); the caller closes the modal. */
  onBacklog: (backlog: AdoBacklog, connection: AdoConnection) => void;
}

const SCOPE_TYPES: AdoScopeTypes = ["area", "iteration"];

/**
 * Release Plan's "Create from Azure DevOps" modal: the shared
 * {@link SharedAdoConnectModal} with the Area/Iteration toggle, Release Plan's
 * remembered connection and `POST /api/ado/backlog` as the loader ("Create
 * board"). Syncing an existing board uses `AdoSyncModal` instead.
 */
export function AdoConnectModal({ open, onClose, onBacklog }: AdoConnectModalProps) {
  return (
    <SharedAdoConnectModal<AdoBacklog>
      open={open}
      title="Create from Azure DevOps"
      submitLabel="Create board"
      scopeTypes={SCOPE_TYPES}
      connectionKey={ADO_CONNECTION_KEY}
      onClose={onClose}
      load={adoBacklog}
      onLoaded={onBacklog}
    />
  );
}
