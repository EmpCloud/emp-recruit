// ============================================================================
// NOTETAKER PANEL — AI Interview Assistant on the interview detail page.
// Dispatch a bot into the meeting → it records + transcribes → Claude evaluates.
// Also supports pasting a transcript manually (works without the bot vendor).
// ============================================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot, Loader2, Sparkles, ThumbsUp, ThumbsDown, FileText, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";

interface Session {
  id: string; status: string; provider: string; duration_seconds?: number;
  transcript?: string; ai_score?: number; ai_recommendation?: string;
  ai_summary?: string; ai_analysis?: any; error?: string;
}

const REC_STYLE: Record<string, { label: string; cls: string; Icon: any }> = {
  strong_hire: { label: "Strong Hire", cls: "bg-emerald-100 text-emerald-800", Icon: ThumbsUp },
  hire: { label: "Hire", cls: "bg-green-100 text-green-700", Icon: ThumbsUp },
  no_hire: { label: "No Hire", cls: "bg-orange-100 text-orange-700", Icon: ThumbsDown },
  strong_no_hire: { label: "Strong No Hire", cls: "bg-red-100 text-red-700", Icon: ThumbsDown },
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested", joining: "Bot joining the call…", recording: "Recording…",
  transcribing: "Transcribing + evaluating…", completed: "Completed", failed: "Failed",
};

export function NotetakerPanel({ interviewId, hasMeetingLink }: { interviewId: string; hasMeetingLink: boolean }) {
  const [busy, setBusy] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  const { data: cfgData } = useQuery({ queryKey: ["notetaker-status"], queryFn: () => apiGet<{ configured: boolean }>("/notetaker/status") });
  const configured = ((cfgData as any)?.data || (cfgData as any))?.configured;

  const { data, refetch } = useQuery({
    queryKey: ["notetaker-session", interviewId],
    queryFn: () => apiGet<Session>(`/notetaker/interviews/${interviewId}`),
    // Poll while a session is in progress.
    refetchInterval: (q) => {
      const s: any = (q.state.data as any)?.data || (q.state.data as any);
      return s && ["requested", "joining", "recording", "transcribing"].includes(s.status) ? 5000 : false;
    },
  });
  const session: Session | null = (data as any)?.data || (data as any) || null;
  const inProgress = session && ["requested", "joining", "recording", "transcribing"].includes(session.status);
  const done = session?.status === "completed";

  async function dispatch() {
    setBusy(true); setBanner(null);
    try {
      await apiPost(`/notetaker/interviews/${interviewId}/dispatch`);
      refetch();
    } catch (e: any) {
      setBanner(e?.response?.data?.error?.message || "Could not dispatch the notetaker");
    } finally {
      setBusy(false);
    }
  }

  async function evaluateManual() {
    setBusy(true); setBanner(null);
    try {
      await apiPost(`/notetaker/interviews/${interviewId}/evaluate`, { transcript: manualText });
      setManual(false); setManualText("");
      refetch();
    } catch (e: any) {
      setBanner(e?.response?.data?.error?.message || "Could not evaluate the transcript");
    } finally {
      setBusy(false);
    }
  }

  const rec = session?.ai_recommendation ? REC_STYLE[session.ai_recommendation] : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <Bot className="h-5 w-5 text-brand-600" />
        <h3 className="text-base font-semibold text-gray-900">AI Interview Assistant</h3>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Paste the interview transcript and let AI generate a candidate evaluation — score, hire
        recommendation, strengths, and concerns. Works with any recording tool (Google Meet, Zoom,
        Fathom, Otter…).
      </p>

      {banner && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{banner}</div>}

      {/* Actions */}
      {!done && !inProgress && (
        <div className="flex flex-wrap gap-2">
          {/* Primary (free) path — evaluate a pasted transcript. */}
          <button
            onClick={() => setManual((m) => !m)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <FileText className="h-4 w-4" /> {manual ? "Hide transcript box" : "Paste transcript & evaluate"}
          </button>

          {/* Optional paid path — only offered when a bot vendor is configured. */}
          {configured && (
            <button
              onClick={dispatch}
              disabled={busy || !hasMeetingLink}
              title={!hasMeetingLink ? "Generate a meeting link first" : ""}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              Auto-join bot
            </button>
          )}
        </div>
      )}
      {!done && !inProgress && (
        <p className="mt-2 text-xs text-gray-400">
          Tip: enable a transcript in your meeting tool (Google Meet &amp; Zoom both offer one), then paste it here.
          {!configured && " Automatic bot-join is an optional paid add-on and isn't required."}
        </p>
      )}

      {/* Manual transcript */}
      {manual && !done && (
        <div className="mt-3">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={5}
            placeholder="Paste the interview transcript here…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button
            onClick={evaluateManual}
            disabled={busy || manualText.trim().length < 40}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Evaluate transcript
          </button>
        </div>
      )}

      {/* In progress */}
      {inProgress && (
        <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          {STATUS_LABEL[session!.status] || session!.status}
        </div>
      )}

      {/* Failed */}
      {session?.status === "failed" && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>Notetaker failed. {session.error}<button onClick={dispatch} className="ml-2 underline">Retry</button></div>
        </div>
      )}

      {/* Completed → evaluation */}
      {done && (
        <div className="mt-1">
          <div className="mb-4 flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">{session.ai_score ?? "—"}</div>
              <div className="text-xs text-gray-500">AI score</div>
            </div>
            {rec && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${rec.cls}`}>
                <rec.Icon className="h-4 w-4" /> {rec.label}
              </span>
            )}
            {session.duration_seconds ? (
              <span className="ml-auto text-xs text-gray-400">{Math.round(session.duration_seconds / 60)} min</span>
            ) : null}
          </div>

          {session.ai_summary && <p className="mb-4 text-sm leading-relaxed text-gray-700">{session.ai_summary}</p>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {session.ai_analysis?.strengths?.length > 0 && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                <div className="mb-1 text-xs font-semibold text-emerald-700">Strengths</div>
                <ul className="list-disc space-y-0.5 pl-4 text-sm text-gray-700">
                  {session.ai_analysis.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {session.ai_analysis?.concerns?.length > 0 && (
              <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3">
                <div className="mb-1 text-xs font-semibold text-orange-700">Concerns</div>
                <ul className="list-disc space-y-0.5 pl-4 text-sm text-gray-700">
                  {session.ai_analysis.concerns.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>

          {Array.isArray(session.ai_analysis?.competencies) && session.ai_analysis.competencies.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {session.ai_analysis.competencies.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0 text-gray-600">{c.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, c.rating || 0)}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs font-medium text-gray-500">{c.rating}</span>
                </div>
              ))}
            </div>
          )}

          {session.transcript && (
            <div className="mt-4">
              <button onClick={() => setShowTranscript((s) => !s)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
                {showTranscript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showTranscript ? "Hide" : "Show"} transcript
              </button>
              {showTranscript && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                  {session.transcript}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
