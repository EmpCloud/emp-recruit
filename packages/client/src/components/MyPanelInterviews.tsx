// ============================================================================
// MyPanelInterviews — panelist-facing list of interviews the current user is
// assigned to conduct, with feedback status. Shown on the dashboard so any
// interviewer (including non-admin employees) can find their interviews and
// submit feedback. Backend: GET /interviews/my-panel.
// ============================================================================

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Calendar, Clock, Video, MapPin, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { apiGet } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";

interface PanelInterview {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number | null;
  location: string | null;
  meeting_link: string | null;
  panelist_role: string | null;
  candidate_name: string;
  job_title: string;
  feedback_submitted: boolean;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function MyPanelInterviews() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-panel-interviews"],
    queryFn: () => apiGet<PanelInterview[]>("/interviews/my-panel"),
  });
  const interviews: PanelInterview[] = (data?.data as any) ?? [];

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      </div>
    );
  }

  if (interviews.length === 0) return null; // nothing to show if not a panelist anywhere

  const pending = interviews.filter((i) => !i.feedback_submitted && i.status !== "cancelled");

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <ClipboardList className="h-5 w-5 text-brand-600" /> My interviews to review
        </h2>
        {pending.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            {pending.length} pending feedback
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {interviews.map((iv) => (
          <Link
            key={iv.id}
            to={`/interviews/${iv.id}`}
            className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-gray-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{iv.title}</p>
              <p className="truncate text-xs text-gray-500">
                {iv.candidate_name} · {iv.job_title}
                {iv.panelist_role ? ` · ${iv.panelist_role.replace(/_/g, " ")}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(iv.scheduled_at)}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(iv.scheduled_at)}</span>
                {iv.meeting_link ? (
                  <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" />Online</span>
                ) : iv.location ? (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{iv.location}</span>
                ) : null}
              </div>
            </div>
            <div className="shrink-0">
              {iv.feedback_submitted ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Feedback given
                </span>
              ) : (
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", iv.status === "cancelled" ? "bg-gray-100 text-gray-500" : "bg-amber-50 text-amber-700")}>
                  {iv.status === "cancelled" ? "Cancelled" : "Give feedback →"}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
