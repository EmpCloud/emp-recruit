// ============================================================================
// RichText — renders stored rich-text HTML (job description / requirements /
// benefits) safely and consistently everywhere it appears (recruiter detail,
// public careers page, candidate portal).
//
// - Sanitizes via the shared DOM-based cleanHtml() (allow-list of semantic tags,
//   scheme-checked links, all other attributes dropped) before injecting.
// - Falls back to whitespace-preserving plain text for legacy non-HTML values.
// - Styles lists/headings with arbitrary-variant classes (no Typography plugin).
// ============================================================================

import { cleanHtml, looksLikeHtml, RICH_TEXT_CLASSES } from "@/lib/richText";
import { cn } from "@/lib/utils";

interface Props {
  html: string | null | undefined;
  className?: string;
}

export function RichText({ html, className }: Props) {
  const value = html || "";
  if (!value.trim()) return null;

  if (looksLikeHtml(value)) {
    return (
      <div
        className={cn("text-sm leading-relaxed text-gray-700", RICH_TEXT_CLASSES, className)}
        dangerouslySetInnerHTML={{ __html: cleanHtml(value) }}
      />
    );
  }

  // Legacy plain-text description — preserve line breaks, no HTML interpretation.
  return (
    <div className={cn("whitespace-pre-wrap text-sm leading-relaxed text-gray-700", className)}>
      {value}
    </div>
  );
}
