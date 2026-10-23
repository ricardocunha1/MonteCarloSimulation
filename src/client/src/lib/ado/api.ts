import { request } from "../monteCarlo/api";
import type { AdoConnectResponse, AdoConnectionRequest } from "./types";

/**
 * POSTs `body` as JSON through the shared `request` helper (ApiError on a
 * non-2xx, the fetch's `AbortError` unchanged when `signal` aborts). Used by
 * every `/api/ado/*` client.
 */
export function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
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
