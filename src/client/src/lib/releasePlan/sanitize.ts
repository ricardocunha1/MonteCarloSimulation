/** Formatting tags kept (attributes stripped, except an http(s) `href` on `A`). */
const KEEP = new Set([
  "P", "BR", "B", "STRONG", "I", "EM", "U", "S", "UL", "OL", "LI", "A", "DIV", "SPAN",
  "H1", "H2", "H3", "H4", "H5", "H6", "CODE", "PRE", "BLOCKQUOTE",
  "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "HR", "SUB", "SUP",
]);

/** Tags removed together with their whole subtree. */
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "IMG", "SVG", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT"]);

const COMMENT_NODE = 8;
const ELEMENT_NODE = 1;

function walk(node: Node): void {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === COMMENT_NODE) {
      child.parentNode?.removeChild(child);
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const element = child as Element;
    // Upper-cased so foreign (SVG/MathML) elements, whose tagName is lower-case, still match.
    const tag = element.tagName.toUpperCase();
    if (DROP.has(tag)) {
      element.remove();
      continue;
    }
    walk(element);
    if (!KEEP.has(tag)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    const href = tag === "A" ? element.getAttribute("href") : null;
    for (const attr of [...element.attributes]) {
      element.removeAttribute(attr.name);
    }
    if (href && /^https?:\/\//i.test(href)) {
      element.setAttribute("href", href);
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }
}

/**
 * Sanitizes Azure DevOps description HTML with a tag whitelist (template `safeHtml`):
 * keeps formatting tags without attributes, keeps only http(s) links (opened in a
 * new tab), drops scripts/styles/media/forms with their content, drops comments and
 * unwraps any other tag. Returns an HTML string safe for `dangerouslySetInnerHTML`.
 */
export function safeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const root = doc.body;
  walk(root);
  return root.innerHTML;
}
