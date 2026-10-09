import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, simulate } from "./api";

function respondWith(body: string, status: number, contentType = "application/json") {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status, headers: { "Content-Type": contentType } })));
}

async function errorsFrom(): Promise<string[]> {
  const error = await simulate([], {} as never).catch((exc: unknown) => exc);
  expect(error).toBeInstanceOf(ApiError);
  return (error as ApiError).errors;
}

describe("api error messages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the app's own errors list", async () => {
    respondWith(JSON.stringify({ errors: ["Target Value must be positive.", "Bad date."] }), 422);
    expect(await errorsFrom()).toEqual(["Target Value must be positive.", "Bad date."]);
  });

  it("uses a FastAPI string detail", async () => {
    respondWith(JSON.stringify({ detail: "Not Found" }), 404);
    expect(await errorsFrom()).toEqual(["Not Found"]);
  });

  it("uses the msg of each FastAPI detail item", async () => {
    respondWith(JSON.stringify({ detail: [{ msg: "field required" }, { msg: "bad type" }] }), 422);
    expect(await errorsFrom()).toEqual(["field required", "bad type"]);
  });

  it("uses a message field", async () => {
    respondWith(JSON.stringify({ message: "Upload too large" }), 413);
    expect(await errorsFrom()).toEqual(["Upload too large"]);
  });

  it("uses a short plain-text body", async () => {
    respondWith("Internal Server Error", 500, "text/plain");
    expect(await errorsFrom()).toEqual(["Internal Server Error"]);
  });

  it("falls back to a generic message for an HTML error page", async () => {
    respondWith("<html><body>502 Bad Gateway</body></html>", 502, "text/html");
    expect(await errorsFrom()).toEqual(["Unexpected server error (HTTP 502)."]);
  });

  it("reports an unreachable server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await errorsFrom()).toEqual(["Could not reach the server: Failed to fetch"]);
  });
});
