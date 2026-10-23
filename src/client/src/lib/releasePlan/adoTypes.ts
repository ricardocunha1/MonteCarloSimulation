/**
 * Azure DevOps API types (`/api/ado/*`), mirroring the server schemas and the
 * API contract in `plans/release-plan-ado.md`.
 */

/** Azure DevOps source: `"onprem"` (On-Prem server) or `"cloud"` (Collaboration Hub). */
export type AdoSource = "onprem" | "cloud";

/** Which classification tree a board is scoped to. */
export type AdoScopeType = "area" | "iteration";

/** The part of every `/api/ado/*` request that identifies the project. The PAT is never persisted. */
export interface AdoConnectionRequest {
  source: AdoSource;
  projectUrl: string;
  pat: string;
}

/** `POST /api/ado/backlog` request. */
export interface AdoBacklogRequest extends AdoConnectionRequest {
  scopeType: AdoScopeType;
  /** Normalized path (`Proj\Team A`); matched case-insensitively by the server. */
  scopePath: string;
}

/** A classification node with its path normalized to the `System.AreaPath`/`System.IterationPath` format. */
export interface AdoTreeNode {
  name: string;
  path: string;
  /** Iteration nodes only: `YYYY-MM-DD` or `""`. Area nodes have no such key. */
  finishDate?: string;
  children: AdoTreeNode[];
}

export interface AdoProjectInfo {
  id: string;
  /** Canonical project name. */
  name: string;
}

/** `POST /api/ado/connect` 200 response. */
export interface AdoConnectResponse {
  project: AdoProjectInfo;
  /** Canonical project URL (encoded, no trailing slash). */
  projectUrl: string;
  areas: AdoTreeNode;
  iterations: AdoTreeNode;
}

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

/**
 * The connection a backlog was fetched with (everything but the PAT); stored in
 * `plan.source` so Sync can pre-fill its form.
 */
export interface AdoConnection {
  source: AdoSource;
  /** Canonical project URL returned by Connect. */
  projectUrl: string;
  scopeType: AdoScopeType;
  scopePath: string;
}
