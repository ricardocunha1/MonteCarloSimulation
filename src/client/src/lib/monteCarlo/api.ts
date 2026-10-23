import type {
  ErrorResponse,
  SimulateResponse,
  SimulationParams,
  SprintSummaryRecord,
  ValidateResponse,
} from "./types";

/** A server-reported failure; `errors` are user-facing messages. */
export class ApiError extends Error {
  readonly errors: string[];
  readonly status: number;

  constructor(errors: string[], status: number) {
    super(errors.join("; "));
    this.name = "ApiError";
    this.errors = errors;
    this.status = status;
  }
}

function isErrorResponse(body: unknown): body is ErrorResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as ErrorResponse).errors)
  );
}

const MAX_TEXT_MESSAGE_LENGTH = 300;

/** The server's own messages from an error body, whatever its shape: the
 * app's `{errors: [...]}`, FastAPI's `{detail: str | [{msg}]}`, a
 * `{message}` object, or a short plain-text body. Empty when there is none
 * worth showing (e.g. a proxy's HTML error page). */
function extractErrorMessages(body: unknown, text: string): string[] {
  if (isErrorResponse(body)) {
    return body.errors.map(String).filter(Boolean);
  }
  if (typeof body === "object" && body !== null) {
    const { detail, message } = body as { detail?: unknown; message?: unknown };
    if (typeof detail === "string" && detail) {
      return [detail];
    }
    if (Array.isArray(detail)) {
      return detail
        .map((item) => (typeof item === "string" ? item : (item as { msg?: unknown })?.msg))
        .filter((msg): msg is string => typeof msg === "string" && msg !== "");
    }
    if (typeof message === "string" && message) {
      return [message];
    }
    return [];
  }
  const trimmed = text.trim();
  if (trimmed && trimmed.length <= MAX_TEXT_MESSAGE_LENGTH && !trimmed.startsWith("<")) {
    return [trimmed];
  }
  return [];
}

/**
 * `fetch` + JSON parse; a non-2xx response becomes an {@link ApiError} with the
 * server's messages, a network failure an `ApiError` with status 0. An aborted
 * request (`init.signal`) rethrows the fetch's `AbortError` unchanged. Shared
 * with `lib/releasePlan/adoApi.ts`.
 */
export async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (exc) {
    if (typeof exc === "object" && exc !== null && (exc as { name?: unknown }).name === "AbortError") {
      throw exc;
    }
    throw new ApiError([`Could not reach the server: ${(exc as Error).message}`], 0);
  }

  const text = await response.text().catch(() => "");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON body (e.g. plain text or a proxy error page); handled below.
  }

  if (!response.ok) {
    const errors = extractErrorMessages(body, text);
    throw new ApiError(
      errors.length > 0 ? errors : [`Unexpected server error (HTTP ${response.status}).`],
      response.status,
    );
  }
  return body as T;
}

/** POST /api/validate: multipart form with the Data Input fields and the
 * `sprint_history_file` upload. */
export function validate(formData: FormData): Promise<ValidateResponse> {
  return request<ValidateResponse>("/api/validate", {
    method: "POST",
    body: formData,
  });
}

/** POST /api/simulate: the validate response (summary + params) as JSON. */
export function simulate(
  summary: SprintSummaryRecord[],
  params: SimulationParams,
): Promise<SimulateResponse> {
  return request<SimulateResponse>("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary, params }),
  });
}
