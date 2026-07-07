// ============================================================================
// RESUME TEXT EXTRACTION
//
// Extracts plain, readable text from a resume buffer using real parsers:
//   - PDF  → pdf-parse (pdf.js under the hood — handles compressed/FlateDecode
//            streams that a naive `(...)`-scan cannot read; the old regex parser
//            returned binary garbage for most real-world PDFs, which is what made
//            AI scoring collapse to ~0% skill matches).
//   - DOCX → mammoth (unzips the OOXML and pulls the document text properly).
//   - TXT  → decoded as UTF-8.
//
// Everything downstream (AI parse/score) consumes the returned string unchanged.
// ============================================================================

import { logger } from "../../utils/logger";

/** Collapse excess whitespace; keep line structure. */
function tidy(text: string): string {
  return (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 is ESM-only and exposes a PDFParse class. Use dynamic import so
  // this works whether the server runs as CJS (tsx) or ESM.
  const mod: any = await import("pdf-parse");
  const PDFParse = mod.PDFParse || mod.default?.PDFParse;
  if (!PDFParse) throw new Error("pdf-parse: PDFParse export not found");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return tidy(result?.text || "");
  } finally {
    await parser.destroy?.();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth: any = await import("mammoth");
  const fn = mammoth.extractRawText || mammoth.default?.extractRawText;
  const result = await fn({ buffer });
  return tidy(result?.value || "");
}

export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  if (!buffer?.length) return "";
  const mime = (mimeType || "").toLowerCase();

  try {
    if (mime.includes("pdf")) {
      return await extractPdf(buffer);
    }
    if (mime.includes("word") || mime.includes("officedocument") || mime.includes("docx")) {
      return await extractDocx(buffer);
    }
    if (mime.includes("text") || mime.includes("plain")) {
      return tidy(buffer.toString("utf8"));
    }

    // Unknown type: sniff by magic bytes.
    const head = buffer.subarray(0, 4).toString("latin1");
    if (head.startsWith("%PDF")) return await extractPdf(buffer);
    if (head.startsWith("PK")) return await extractDocx(buffer); // zip → likely docx
    return tidy(buffer.toString("utf8"));
  } catch (err) {
    logger.warn(`Resume text extraction failed (${mime}): ${(err as Error).message}`);
    // Last-ditch: return any readable ASCII so scoring has *something*.
    return tidy(buffer.toString("utf8").replace(/[^\x20-\x7E\n]/g, " "));
  }
}
