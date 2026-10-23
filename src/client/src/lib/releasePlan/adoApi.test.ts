import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBacklog } from "../../test/adoFixtures";
import { ApiError } from "../monteCarlo/api";
import { adoBacklog } from "./adoApi";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const REQ = { source: "cloud", projectUrl: "https://dev.azure.com/o/P", pat: "pat-1" } as const;

describe("adoApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adoBacklog POSTs the scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(makeBacklog()));
    vi.stubGlobal("fetch", fetchMock);
    const req = { ...REQ, scopeType: "area", scopePath: "P\\Team" } as const;
    await expect(adoBacklog(req)).resolves.toEqual(makeBacklog());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ado/backlog");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(init.body))).toEqual(req);
  });

  it("uses a generic message for a non-JSON error page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 })));
    const error = await adoBacklog({ ...REQ, scopeType: "area", scopePath: "P" }).catch((exc: unknown) => exc);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).errors).toEqual(["Unexpected server error (HTTP 502)."]);
  });
});
