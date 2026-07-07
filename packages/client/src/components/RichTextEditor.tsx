// ============================================================================
// RichTextEditor — a lightweight, dependency-free WYSIWYG editor.
//
// Built on contentEditable + document.execCommand (still supported across
// browsers for these basic commands). Emits HTML via onChange. Used for job
// description / requirements / benefits so recruiters can format postings
// (bold, lists, headings, links) instead of typing plain text.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, List, ListOrdered, Heading2, Heading3,
  Link as LinkIcon, Quote, Undo, Redo, RemoveFormatting,
} from "lucide-react";
import { cleanHtml, escapeText } from "@/lib/richText";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichTextEditor({ value, onChange, placeholder = "Write here…", minHeight = 200 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  // Sync incoming value into the DOM only when it differs from what's already
  // rendered (so typing doesn't get its cursor reset on every keystroke).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  function exec(command: string, arg?: string) {
    document.execCommand(command, false, arg);
    ref.current?.focus();
    emit();
  }

  function emit() {
    if (!ref.current) return;
    let html = cleanHtml(ref.current.innerHTML);
    // Treat an "empty" editor as truly empty (browsers leave <br> behind).
    if (html === "<br>" || html === "<div><br></div>" || html === "<p></p>") html = "";
    onChange(html);
  }

  // Paste as CLEAN content — never let the browser bring inline styles (esp.
  // Tailwind's --tw-* variables) or foreign markup into the editor.
  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    const toInsert = html ? cleanHtml(html) : escapeText(text).replace(/\n/g, "<br>");
    document.execCommand("insertHTML", false, toInsert);
    emit();
  }

  function addLink() {
    const url = window.prompt("Link URL", "https://");
    if (url) exec("createLink", url);
  }

  const isEmpty = !value || value === "<br>";

  return (
    <div className={`overflow-hidden rounded-lg border ${focused ? "border-brand-500 ring-2 ring-brand-200" : "border-gray-300"}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
        <Btn onClick={() => exec("bold")} title="Bold"><Bold className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("italic")} title="Italic"><Italic className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("underline")} title="Underline"><Underline className="h-4 w-4" /></Btn>
        <Divider />
        <Btn onClick={() => exec("formatBlock", "<h2>")} title="Heading"><Heading2 className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("formatBlock", "<h3>")} title="Subheading"><Heading3 className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("formatBlock", "<blockquote>")} title="Quote"><Quote className="h-4 w-4" /></Btn>
        <Divider />
        <Btn onClick={() => exec("insertUnorderedList")} title="Bullet list"><List className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("insertOrderedList")} title="Numbered list"><ListOrdered className="h-4 w-4" /></Btn>
        <Btn onClick={addLink} title="Link"><LinkIcon className="h-4 w-4" /></Btn>
        <Divider />
        <Btn onClick={() => exec("removeFormat")} title="Clear formatting"><RemoveFormatting className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("undo")} title="Undo"><Undo className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("redo")} title="Redo"><Redo className="h-4 w-4" /></Btn>
      </div>

      {/* Editable area */}
      <div className="relative">
        {isEmpty && !focused && (
          <div className="pointer-events-none absolute left-3 top-3 text-sm text-gray-400">{placeholder}</div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onPaste={onPaste}
          onBlur={() => { setFocused(false); emit(); }}
          onFocus={() => setFocused(true)}
          style={{ minHeight }}
          className="px-3 py-3 text-sm text-gray-800 focus:outline-none [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600 [&_a]:text-brand-600 [&_a]:underline"
        />
      </div>
    </div>
  );
}

function Btn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      // preventDefault on mousedown keeps the editor's selection while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded p-1.5 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-gray-300" />;
}
