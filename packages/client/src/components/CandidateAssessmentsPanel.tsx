// ============================================================================
// CandidateAssessmentsPanel — on the candidate detail page: list the
// candidate's assessments, invite them to a template, and copy the take-link.
// Backend: GET /assessments/candidate/:id, POST /assessments/invite.
// ============================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Loader2, Plus, X, Copy, Check, ExternalLink } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { AssessmentTemplate, CandidateAssessment } from "@emp-recruit/shared";

const STATUS_BADGE: Record<string, string> = {
  invited: "bg-blue-50 text-blue-700",
  started: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  expired: "bg-gray-100 text-gray-500",
};

type Row = CandidateAssessment & { template_name?: string; assessment_type?: string };

export function CandidateAssessmentsPanel({ candidateId }: { candidateId: string }) {
  const [showInvite, setShowInvite] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["candidate-assessments", candidateId],
    queryFn: () => apiGet<Row[]>(`/assessments/candidate/${candidateId}`),
    enabled: !!candidateId,
  });
  const assessments: Row[] = (data?.data as any) ?? [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <ClipboardCheck className="h-5 w-5 text-gray-400" /> Assessments ({assessments.length})
        </h2>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Invite
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : assessments.length === 0 ? (
          <p className="px-6 py-6 text-center text-sm text-gray-500">
            No assessments sent yet. Invite this candidate to a psychometric or skills assessment.
          </p>
        ) : (
          assessments.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-6 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{a.template_name || "Assessment"}</p>
                <p className="text-xs text-gray-500">
                  {a.status === "completed" && a.score != null
                    ? `Score: ${a.score}${a.max_score ? ` / ${a.max_score}` : ""}${a.percentile != null ? ` · ${a.percentile}th pct` : ""}`
                    : `Invited ${new Date(a.created_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_BADGE[a.status] || "bg-gray-100 text-gray-600")}>
                  {a.status}
                </span>
                {a.status !== "completed" && a.status !== "expired" && <CopyLink token={a.token} />}
              </div>
            </div>
          ))
        )}
      </div>

      {showInvite && (
        <InviteModal candidateId={candidateId} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/assessment/${token}`;
  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      toast.success("Assessment link copied");
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={copy} title="Copy candidate link" className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      Link
    </button>
  );
}

function InviteModal({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["assessment-templates"],
    queryFn: () => apiGet<AssessmentTemplate[]>("/assessments/templates"),
  });
  const templates: AssessmentTemplate[] = (data?.data as any) ?? [];

  const inviteMutation = useMutation({
    mutationFn: () => apiPost<CandidateAssessment>("/assessments/invite", { candidate_id: candidateId, template_id: templateId }),
    onSuccess: (res: any) => {
      const rec = res?.data || res;
      setCreatedToken(rec.token);
      toast.success("Assessment invitation created");
      queryClient.invalidateQueries({ queryKey: ["candidate-assessments", candidateId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Could not send invitation"),
  });

  const link = createdToken ? `${window.location.origin}/assessment/${createdToken}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">Invite to assessment</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5">
          {createdToken ? (
            <div>
              <p className="mb-2 text-sm text-gray-600">Invitation created. Share this link with the candidate:</p>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                <input readOnly value={link} className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 focus:outline-none" />
                <button onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }}
                  className="shrink-0 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">Copy</button>
                <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-gray-500 hover:bg-white"><ExternalLink className="h-3.5 w-3.5" /></a>
              </div>
              <button onClick={onClose} className="mt-4 w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700">Done</button>
            </div>
          ) : templates.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              No assessment templates yet. Create one under <span className="font-medium">Assessments</span> first.
            </p>
          ) : (
            <>
              <label className="mb-1 block text-sm font-medium text-gray-700">Choose a template</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Select…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.assessment_type})</option>)}
              </select>
              <button
                onClick={() => inviteMutation.mutate()}
                disabled={!templateId || inviteMutation.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Send invitation
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
