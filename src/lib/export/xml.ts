/**
 * `xml` — the two things every OOXML part needs: a declaration and escaping.
 *
 * DOCX and XLSX are ZIP containers full of XML, and every one of those parts
 * interpolates user text into markup. That makes escaping a correctness
 * requirement rather than a formatting detail: a document body containing
 * `<script>` or `&` must land in `word/document.xml` as `&lt;script&gt;` and
 * `&amp;`, never as markup.
 *
 * The escaping here also removes characters XML 1.0 cannot represent at all
 * (C0 control characters and lone surrogates), because those produce a file
 * that parsers reject outright. A lone surrogate is a realistic input: block
 * text is capped by length elsewhere in the app, and a cap can cut an emoji in
 * half.
 *
 * Dependency-free, DOM-free, and allocation-light so it can run in the browser.
 */

/**
 * Control characters XML 1.0 forbids: tab, newline and carriage return are the
 * only C0 characters a document may contain, so everything else is dropped.
 */
const invalidXmlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

/** Unpaired UTF-16 surrogates, which cannot be encoded as valid UTF-8. */
const loneSurrogates = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Standard XML declaration for the parts we emit. */
export function xmlDeclaration(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
}

/** Normalize line endings and drop characters XML cannot carry. */
export function sanitizeXmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(invalidXmlCharacters, "")
    .replace(loneSurrogates, "")
}

/**
 * Escape one text value for use inside an element or a double-quoted attribute.
 *
 * All five XML entities are escaped, including the single quote, so the same
 * function is safe for either quoting style.
 */
export function escapeXml(value: unknown): string {
  return sanitizeXmlText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
