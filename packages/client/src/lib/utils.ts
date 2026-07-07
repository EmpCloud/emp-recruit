import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Turn any API/AI error into a clean, user-safe message. Prefers the backend's
// friendly message (already sanitized server-side); otherwise maps common
// network/status cases to plain language. Never surfaces raw provider text.
export function aiErrorMessage(err: any, fallback = "Something went wrong. Please try again."): string {
  const backend = err?.response?.data?.error?.message;
  // The server already sanitizes AI errors, so trust a short backend message.
  if (typeof backend === "string" && backend.length > 0 && backend.length < 200) {
    return backend;
  }
  const status = err?.response?.status;
  if (status === 503 || status === 429) return "The AI service is busy right now. Please wait a few seconds and try again.";
  if (status === 504) return "The AI took too long to respond. Please try again in a moment.";
  if (err?.code === "ERR_NETWORK" || err?.message === "Network Error") {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return fallback;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

// Resolve a stored upload path (resume, offer letter, etc.) to a fully
// qualified URL. Server stores values like "/uploads/resumes/<file>" or
// "uploads/resumes/<file>"; in dev the Vite proxy handles same-origin
// requests, in production the frontend and API live on different hosts so
// the URL must be anchored to the API origin (derived from VITE_API_URL).
export function resolveUploadUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || "/api/v1";
  let origin = "";
  if (/^https?:\/\//i.test(apiBase)) {
    try {
      origin = new URL(apiBase).origin;
    } catch {
      origin = "";
    }
  }
  if (!origin && typeof window !== "undefined") {
    origin = window.location.origin;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}
