import type { AdoSource } from "./adoTypes";

/**
 * Client-side check of an Azure DevOps project URL, mirroring the server's
 * `app/services/ado_url.py` (`parse_project_url`) so the same input gets the
 * same message without a network call. The host allowlist stays server-only.
 */

export const SOURCE_REQUIRED = "Choose the Azure DevOps source (On-Prem or Collaboration Hub).";
export const URL_REQUIRED = "Enter the Azure DevOps project URL.";
export const PAT_REQUIRED = "Enter a Personal Access Token.";
export const HTTPS_REQUIRED = "The URL must start with https://.";
export const CLOUD_SHAPE = "Collaboration Hub URLs look like https://dev.azure.com/<organization>/<project>.";
export const ONPREM_SHAPE = "On-Prem URLs look like https://<server>/<collection>/<project>.";

/** Example project URL shown as the input placeholder, per source. */
export const PLACEHOLDER: Readonly<Record<AdoSource, string>> = {
  onprem: "https://tfs-projects.cmf.criticalmanufacturing.com/ImplementationProjects/<PROJECT_NAME>",
  cloud: "https://dev.azure.com/<ORGANIZATION>/<PROJECT_NAME>",
};

/** Display label of each source. */
export const SOURCE_LABELS: Readonly<Record<AdoSource, string>> = {
  onprem: "On-Prem",
  cloud: "Collaboration Hub",
};

const CLOUD_HOST = "dev.azure.com";
const VISUALSTUDIO_SUFFIX = ".visualstudio.com";
const LDH_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** Characters Python's `str.strip()` removes (`str.isspace()`). */
const PY_SPACE = "\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP = new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, "g");
const PERCENT_RUN = /(?:%[0-9A-Fa-f]{2})+/g;

function pyStrip(text: string): string {
  return text.replace(PY_STRIP, "");
}

/**
 * The lower-case ASCII (IDNA) form of `host`, or `null` when it is not a valid
 * DNS name (LDH labels of 1-63 chars, no leading/trailing hyphen, valid `xn--`
 * punycode). Non-ASCII hosts are converted with the browser's URL parser (UTS
 * #46), which is close to, but not exactly, Python's IDNA 2003 codec.
 */
function asciiHost(host: string): string | null {
  let ascii = host.toLowerCase();
  if (/[^\x00-\x7f]/.test(ascii)) {
    if (/[^a-z0-9.\-\u0080-￿]/.test(ascii)) {
      return null;
    }
    try {
      ascii = new URL(`https://${ascii}/`).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  const labels = ascii.split(".");
  if (ascii.length > 253 || !labels.every((label) => LDH_LABEL.test(label))) {
    return null;
  }
  for (const label of labels) {
    if (label.startsWith("xn--")) {
      try {
        new URL(`https://${label}/`);
      } catch {
        return null;
      }
    }
  }
  return ascii;
}

/**
 * Python's `unquote(text, errors="strict")`: runs of `%XX` escapes are decoded
 * as UTF-8; a `%` that is not an escape stays literal.
 * @throws TypeError when an escape run is not valid UTF-8.
 */
function unquoteStrict(text: string): string {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return text.replace(PERCENT_RUN, (run) => {
    const bytes = new Uint8Array(run.length / 3);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(run.slice(i * 3 + 1, i * 3 + 3), 16);
    }
    return decoder.decode(bytes);
  });
}

/** Decoded, non-empty path segments up to the first `_…` one; `[]` when a segment is unusable. */
function pathSegments(path: string): string[] {
  const segments: string[] = [];
  for (const raw of path.split("/")) {
    if (!raw) {
      continue;
    }
    if (raw.startsWith("_")) {
      break;
    }
    let decoded: string;
    try {
      decoded = pyStrip(unquoteStrict(raw));
    } catch {
      return [];
    }
    if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || CONTROL_CHARS.test(decoded)) {
      return [];
    }
    segments.push(decoded);
  }
  return segments;
}

/** Python `urlsplit` netloc checks: `null` when the netloc is unusable, else the parsed host and port. */
function splitNetloc(netloc: string): { host: string; port: number | null } | null {
  if (netloc.includes("[") || netloc.includes("]") || netloc.includes("@")) {
    return null;
  }
  if (/[^\x00-\x7f]/.test(netloc)) {
    const normalized = netloc.replace(/[@:#?]/g, "").normalize("NFKC");
    if (/[/?#@:]/.test(normalized)) {
      return null;
    }
  }
  const colon = netloc.indexOf(":");
  const hostname = colon < 0 ? netloc : netloc.slice(0, colon);
  const portText = colon < 0 ? "" : netloc.slice(colon + 1);
  let port: number | null = null;
  if (portText) {
    if (!/^[0-9]+$/.test(portText) || Number(portText) > 65535) {
      return null;
    }
    port = Number(portText);
  }
  const host = hostname ? asciiHost(hostname) : null;
  return host === null ? null : { host, port };
}

/**
 * The first rule `url` breaks for the selected source, as the server's message,
 * or `null` when its shape is valid. Checked in order: https scheme, host
 * syntax, then the shape for the source (Collaboration Hub:
 * `https://dev.azure.com/<org>/<project>` or `https://<org>.visualstudio.com/<project>`;
 * On-Prem: `https://<host>/<collection>/<project>`). A trailing `/`, the first
 * `/_…` segment and everything after it, the query and the fragment are ignored.
 * Blank input gives `URL_REQUIRED`. Whether the host is allowed is only known
 * to the server.
 */
export function validateProjectUrl(source: AdoSource, url: string): string | null {
  const shapeError = source === "cloud" ? CLOUD_SHAPE : ONPREM_SHAPE;
  const stripped = pyStrip(url);
  if (!stripped) {
    return URL_REQUIRED;
  }
  if (!stripped.toLowerCase().startsWith("https://")) {
    return HTTPS_REQUIRED;
  }
  if (LONE_SURROGATE.test(stripped)) {
    return shapeError;
  }

  const rest = stripped.replace(/[\t\r\n]/g, "").slice("https://".length);
  const netlocEnd = rest.search(/[/?#]/);
  const netloc = netlocEnd < 0 ? rest : rest.slice(0, netlocEnd);
  const path = (netlocEnd < 0 ? "" : rest.slice(netlocEnd)).split("#")[0].split("?")[0];

  const parsed = splitNetloc(netloc);
  if (parsed === null) {
    return shapeError;
  }
  const { host } = parsed;
  const segments = pathSegments(path);
  const isVisualStudio = host.endsWith(VISUALSTUDIO_SUFFIX) && host.split(".").length === 3;
  const valid =
    (source === "cloud" && host === CLOUD_HOST && segments.length === 2) ||
    (source === "cloud" && isVisualStudio && segments.length === 1) ||
    (source === "onprem" && segments.length === 2);
  return valid ? null : shapeError;
}
