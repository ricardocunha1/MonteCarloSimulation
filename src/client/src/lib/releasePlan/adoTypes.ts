/**
 * Release Plan's Azure DevOps API types (`/api/ado/backlog`), mirroring the
 * server schemas and the API contract in `plans/release-plan-ado.md`. The
 * shared connection types are re-exported from `lib/ado/types.ts`.
 */

import type { AdoProjectInfo, AdoScopedRequest } from "../ado/types";

export type {
  AdoConnectResponse,
  AdoConnection,
  AdoConnectionRequest,
  AdoProjectInfo,
  AdoScopeType,
  AdoSource,
  AdoTreeNode,
} from "../ado/types";

/** `POST /api/ado/backlog` request: the connection plus the Area/Iteration scope. */
export type AdoBacklogRequest = AdoScopedRequest;

/** An Epic or Feature as returned by the backlog route (flat, ascending id). */
export interface AdoWorkItem {
  id: number;
  type: "Epic" | "Feature";
  title: string;
  state: string;
  /** Raw HTML (sanitized on display) or `""`. */
  description: string;
  /** `Custom.EstimatedSize`, trimmed and upper-cased; `""` when missing. */
  size: string;
  iterationPath: string;
  parentId: number | null;
}

export interface AdoIteration {
  path: string;
  /** `YYYY-MM-DD` or `""`. */
  finishDate: string;
}

/** `POST /api/ado/backlog` 200 response. */
export interface AdoBacklog {
  project: AdoProjectInfo;
  projectUrl: string;
  /** Display text, e.g. `Area Path: Proj\Team A`. */
  scope: string;
  /** Server UTC time, ISO with `Z`. */
  fetchedAt: string;
  workItems: AdoWorkItem[];
  iterations: AdoIteration[];
  warnings: string[];
}
