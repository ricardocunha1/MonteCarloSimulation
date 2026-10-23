import { postJson } from "../ado/api";
import type { AdoBacklog, AdoBacklogRequest } from "./adoTypes";

/**
 * POST /api/ado/backlog: the Epics and Features under the chosen Area/Iteration path.
 * @throws ApiError with the server's messages (422 `{errors}`); an `AbortError` when `signal` aborts.
 */
export function adoBacklog(req: AdoBacklogRequest, signal?: AbortSignal): Promise<AdoBacklog> {
  return postJson<AdoBacklog>("/api/ado/backlog", req, signal);
}
