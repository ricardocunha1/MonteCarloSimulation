import { describe, expect, it } from "vitest";
import { XSS_DESCRIPTION } from "../../test/releasePlanFixtures";
import { safeHtml } from "./sanitize";

describe("safeHtml", () => {
  it("keeps whitelisted formatting tags and strips their attributes", () => {
    expect(safeHtml('<p class="x" style="color:red">a <b>b</b> <em id="e">c</em></p><ul><li>d</li></ul>')).toBe(
      "<p>a <b>b</b> <em>c</em></p><ul><li>d</li></ul>",
    );
    expect(safeHtml("<table><tbody><tr><td>1</td></tr></tbody></table><h2>t</h2><hr><sub>s</sub>")).toBe(
      "<table><tbody><tr><td>1</td></tr></tbody></table><h2>t</h2><hr><sub>s</sub>",
    );
  });

  it("drops dangerous elements with their whole subtree", () => {
    const out = safeHtml(
      "<div>a<script>alert(1)</script><style>p{}</style><iframe src=x></iframe><img src=x onerror=alert(1)>" +
        "<svg><script>alert(2)</script><text>t</text></svg><form><input value=v><button>b</button><textarea>t</textarea><select><option>o</option></select></form>z</div>",
    );
    expect(out).toBe("<div>az</div>");
  });

  it("drops comments and unwraps unknown tags", () => {
    expect(safeHtml("<!-- c --><section><font color=red>x</font><custom-el>y</custom-el></section>")).toBe("xy");
  });

  it("keeps only http(s) links, opened in a new tab", () => {
    expect(safeHtml('<a href="https://e.com/a" onclick="x()" title="t">ok</a>')).toBe(
      '<a href="https://e.com/a" target="_blank" rel="noopener noreferrer">ok</a>',
    );
    expect(safeHtml('<a href="HTTP://e.com">up</a>')).toBe('<a href="HTTP://e.com" target="_blank" rel="noopener noreferrer">up</a>');
    expect(safeHtml('<a href="javascript:alert(1)">js</a>')).toBe("<a>js</a>");
    expect(safeHtml('<a href="/relative">rel</a>')).toBe("<a>rel</a>");
  });

  it("neutralizes the fixture description and handles empty input", () => {
    const out = safeHtml(XSS_DESCRIPTION);
    expect(out).not.toMatch(/script|onerror|onclick|javascript|<img|<!--/i);
    expect(out).toContain('<a href="https://example.com/doc" target="_blank" rel="noopener noreferrer">good link</a>');
    expect(safeHtml("")).toBe("");
  });
});
