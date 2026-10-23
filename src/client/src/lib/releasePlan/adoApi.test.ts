import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBacklog, makeConnectResponse } from "../../test/adoFixtures";
import { ApiError } from "../monteCarlo/api";
import { adoBacklog, adoConnect } from "./adoApi";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const REQ = { source: "cloud", projectUrl: "https://dev.azure.com/o/P", pat: "pat-1" } as const;

describe("adoApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adoConnect POSTs the JSON body (PAT in the body only) with the signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(makeConnectResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await expect(adoConnect(REQ, controller.signal)).resolves.toEqual(makeConnectResponse());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ado/connect");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal });
    expect(JSON.parse(String(init.body))).toEqual(REQ);
  });

  it("adoBacklog POSTs the scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(makeBacklog()));
    vi.stubGlobal("fetch", fetchMock);
    const req = { ...REQ, scopeType: "area", scopePath: "P\\Team" } as const;
    await expect(adoBacklog(req)).resolves.toEqual(makeBacklog());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ado/backlog");
    expect(JSON.parse(String(init.body))).toEqual(req);
  });

  it("turns a 422 {errors} into an ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ errors: ["Project not found: P. Check the URL."] }, 422)));
    const error = await adoConnect(REQ).catch((exc: unknown) => exc);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).errors).toEqual(["Project not found: P. Check the URL."]);
    expect((error as ApiError).status).toBe(422);
  });

  it("uses a generic message for a non-JSON error page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 })));
    const error = await adoBacklog({ ...REQ, scopeType: "area", scopePath: "P" }).catch((exc: unknown) => exc);
    expect((error as ApiError).errors).toEqual(["Unexpected server error (HTTP 502)."]);
  });

  it("rethrows an abort unchanged (not as an ApiError)", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    const error = await adoConnect(REQ, new AbortController().signal).catch((exc: unknown) => exc);
    expect(error).toBe(abort);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});
