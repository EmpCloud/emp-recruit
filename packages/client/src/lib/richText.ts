// ============================================================================
// richText — the single source of truth for cleaning & rendering the HTML that
// the RichTextEditor produces (job description / requirements / benefits, etc.).
//
// Why DOM-based and not regex: a regex sanitizer is fundamentally defeatable.
// It misses `<img src="x"/onerror=…>` (the slash is a spec-compliant attribute
// separator, so there's no whitespace before `onerror`), `<svg/onload=…>`,
// unquoted or entity-obfuscated `javascript:` URLs (`java&#115;cript:`), and
// nested-tag reassembly (`<scri<script></script>pt>`). Parsing to a real DOM and
// keeping ONLY an allow-list of semantic tags — dropping every attribute except
// a scheme-checked href on <a> — closes that entire class at zero bundle cost
// (DOMParser is a browser built-in; no DOMPurify dependency needed).
//
// This is used in two roles:
//   1. In the editor, to clean contentEditable output before saving.
//   2. At render time, as the last line of defense before dangerouslySetInnerHTML.
// ============================================================================

const ALLOWED_TAGS = new Set([
  "P", "BR", "H2", "H3", "UL", "OL", "LI", "B", "STRONG", "I", "EM", "U",
  "A", "BLOCKQUOTE", "DIV", "SPAN",
]);

// Only these headings may exist; a block-level child inside a heading is
// malformed (contentEditable's formatBlock produces `<h2><p>text</p></h2>`).
const HEADING_TAGS = new Set(["H2", "H3"]);

// Schemes we trust on <a href>. Everything else (javascript:, data:, vbscript:,
// obfuscated variants) is dropped — checked against the PARSED node's protocol,
// never the raw string, so entity/whitespace obfuscation can't sneak through.
const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

function isSafeHref(raw: string): boolean {
  const href = raw.trim();
  // Relative/anchor links are fine.
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    // Resolve against a base so relative URLs parse; absolute ones keep their scheme.
    const url = new URL(href, "https://x.invalid/");
    return SAFE_LINK_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

function cleanNode(node: Node, out: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return out.createTextNode(node.textContent || "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as HTMLElement;
  let tag = el.tagName;

  if (!ALLOWED_TAGS.has(tag)) {
    // Unknown/dangerous tag (script, svg, img, style, iframe, table…): unwrap —
    // keep its text children, drop the element itself. Because we walk a real
    // DOM, nested-tag reassembly is structurally impossible.
    const frag = out.createDocumentFragment();
    el.childNodes.forEach((c) => { const cc = cleanNode(c, out); if (cc) frag.appendChild(cc); });
    return frag;
  }
  if (tag === "SPAN" || tag === "DIV") tag = "P"; // collapse generic wrappers

  const clean = out.createElement(tag);

  if (tag === "A") {
    const href = el.getAttribute("href");
    if (href && isSafeHref(href)) {
      clean.setAttribute("href", href);
      clean.setAttribute("target", "_blank");
      clean.setAttribute("rel", "noopener noreferrer");
    }
  }
  // Every other attribute (style, class, data-*, on*, etc.) is intentionally
  // dropped — we never copy them, so there is nothing for a handler to ride in on.

  el.childNodes.forEach((c) => { const cc = cleanNode(c, out); if (cc) clean.appendChild(cc); });
  return clean;
}

// A heading must not contain block-level children. formatBlock('<h2>') on an
// existing <p> yields `<h2><p>text</p></h2>` (and after DIV→P collapse a
// `<h2><div>x</div></h2>` becomes the same). Hoist the inline children of EVERY
// P/DIV child of a heading up into the heading and drop the wrapper. Handles the
// lone-<p>, multi-<p>, text+<p>, and div-in-heading cases uniformly.
function flattenHeadings(root: HTMLElement, out: Document) {
  root.querySelectorAll("h2, h3").forEach((h) => {
    Array.from(h.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const t = (child as HTMLElement).tagName;
        if (t === "P" || t === "DIV") {
          const frag = out.createDocumentFragment();
          child.childNodes.forEach((gc) => frag.appendChild(gc.cloneNode(true)));
          child.replaceWith(frag);
        }
      }
    });
  });
  // Drop any heading left empty after flattening.
  root.querySelectorAll("h2, h3").forEach((h) => {
    if (!h.textContent || !h.textContent.trim()) h.remove();
  });
  void HEADING_TAGS; // referenced for intent; querySelectorAll is the fast path
}

/**
 * Parse HTML, keep only an allow-list of semantic tags, strip every attribute
 * except a scheme-checked href on <a>, and normalize malformed heading nesting.
 * Safe to feed directly to dangerouslySetInnerHTML. Idempotent.
 */
export function cleanHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");
  const container = doc.body;
  const outDoc = document.implementation.createHTMLDocument("");
  const result = outDoc.createElement("div");
  container.childNodes.forEach((c) => { const cc = cleanNode(c, outDoc); if (cc) result.appendChild(cc); });
  flattenHeadings(result, outDoc);
  return result.innerHTML.replace(/<p>\s*<\/p>/g, "").trim();
}

// Detect whether a stored value is HTML (from the editor) vs a legacy plain-text
// description. Requires a real tag (`<tagname`) so stray "a < b" stays plain text.
const HTML_TAG_RE = /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i;
export function looksLikeHtml(s: string): boolean {
  return HTML_TAG_RE.test(s || "");
}

// The one class string that styles rendered rich text everywhere (recruiter,
// careers, portal). Uses arbitrary-variant selectors so it needs no Tailwind
// Typography plugin (which is NOT installed — plugins: [] in tailwind.config.js).
export const RICH_TEXT_CLASSES =
  "[&_h2]:mb-1 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 " +
  "[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-900 " +
  "[&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:mb-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 " +
  "[&_blockquote]:text-gray-600 [&_a]:text-brand-600 [&_a]:underline";

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
