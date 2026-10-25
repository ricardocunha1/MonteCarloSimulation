import { describe, expect, it } from "vitest";
import { safeHtml } from "./sanitize";

// QA hardening: safeHtml returns a *string* that React re-parses through
// innerHTML (the template appended a DOM fragment instead). Check that known
// mutation-XSS / namespace-confusion / raw-text payloads cannot produce
// anything but whitelisted, attribute-free tags (plus a safe http(s) href)
// after that second parse, and that sanitizing is idempotent.
const KEEP = new Set([
  "P", "BR", "B", "STRONG", "I", "EM", "U", "S", "UL", "OL", "LI", "A", "DIV", "SPAN",
  "H1", "H2", "H3", "H4", "H5", "H6", "CODE", "PRE", "BLOCKQUOTE",
  "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "HR", "SUB", "SUP",
]);

const PAYLOADS = [
  `<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>`,
  `<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">`,
  `<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">`,
  `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`,
  `<math><mi><a href="javascript:alert(1)">l</a></mi></math>`,
  `<math><style><img src=x onerror=alert(1)></style></math>`,
  `<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>`,
  `<xmp><img src=x onerror=alert(1)></xmp>`,
  `<noembed><img src=x onerror=alert(1)></noembed>`,
  `<template><img src=x onerror=alert(1)></template>`,
  `<table><tr><td>a</td></tr><script>alert(1)</script></table>`,
  `<a href=" javascript:alert(1)">sp</a><a href="data:text/html,<script>alert(1)</script>">d</a>`,
  `<details open ontoggle=alert(1)><summary>x</summary></details>`,
  `<p style="background:url(javascript:alert(1))" onclick="alert(1)">styled</p>`,
];

function violations(html: string): string[] {
  const host = document.createElement("div");
  host.innerHTML = html;
  const bad: string[] = [];
  host.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toUpperCase();
    if (!KEEP.has(tag)) {
      bad.push(`tag ${tag}`);
    }
    for (const attr of [...el.attributes]) {
      if (!(tag === "A" && ["href", "target", "rel"].includes(attr.name))) {
        bad.push(`attr ${tag}.${attr.name}`);
      }
    }
    const href = el.getAttribute("href");
    if (href !== null && !/^https?:\/\//i.test(href)) {
      bad.push(`href ${href}`);
    }
  });
  return bad;
}

describe("safeHtml – re-parse (mXSS) safety", () => {
  it.each(PAYLOADS)("neutralizes %s", (payload) => {
    const out = safeHtml(payload);
    expect(violations(out)).toEqual([]);
    expect(safeHtml(out)).toBe(out);
  });

  it("keeps text that looks like markup as escaped text", () => {
    const out = safeHtml("<xmp><img src=x onerror=alert(1)></xmp>");
    expect(out).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });
});
