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

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (exc) {
    throw new ApiError([`Could not reach the server: ${(exc as Error).message}`], 0);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (e.g. a proxy error page); handled below.
  }

  if (!response.ok) {
    if (isErrorResponse(body)) {
      throw new ApiError(body.errors, response.status);
    }
    throw new ApiError(
      [`Unexpected server error (HTTP ${response.status}).`],
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
