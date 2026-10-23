import { request } from "../monteCarlo/api";
import type { AdoBacklog, AdoBacklogRequest, AdoConnectResponse, AdoConnectionRequest } from "./adoTypes";

function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * POST /api/ado/connect: validates the URL + PAT and returns the project with
 * its Area and Iteration trees. The PAT travels in the JSON body only.
 * @throws ApiError with the server's messages (422 `{errors}`); an `AbortError` when `signal` aborts.
 */
export function adoConnect(req: AdoConnectionRequest, signal?: AbortSignal): Promise<AdoConnectResponse> {
  return postJson<AdoConnectResponse>("/api/ado/connect", req, signal);
}

/**
 * POST /api/ado/backlog: the Epics and Features under the chosen Area/Iteration path.
 * @throws ApiError with the server's messages (422 `{errors}`); an `AbortError` when `signal` aborts.
 */
export function adoBacklog(req: AdoBacklogRequest, signal?: AbortSignal): Promise<AdoBacklog> {
  return postJson<AdoBacklog>("/api/ado/backlog", req, signal);
}
