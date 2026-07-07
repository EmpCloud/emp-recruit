// ============================================================================
// CandidateBackgroundChecksPanel — on the candidate detail page: initiate and
// track background checks, and record results for manual checks.
// Backend: GET /background-checks/candidate/:id, POST /initiate, PUT /:id.
// ============================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Loader2, Plus, X, ExternalLink } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/api/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { BackgroundCheck } from "@emp-recruit/shared";

const CHECK_TYPES = ["criminal", "employment", "education", "credit", "reference", "identity"] as const;
const PROVIDERS = ["manual", "checkr", "sterling", "hireright"] as const;

const RESULT_BADGE: Record<string, string> = {
  clear: "bg-emerald-50 text-emerald-700",
  consider: "bg-amber-50 text-amber-700",
  adverse: "bg-red-50 text-red-700",
  pending: "bg-gray-100 text-gray-500",
};
const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

function label(s: string) { return s.replace(/_/g, " "); }

export function CandidateBackgroundChecksPanel({ candidateId }: { candidateId: string }) {
  const [showInitiate, setShowInitiate] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["candidate-bgchecks", candidateId],
    queryFn: () => apiGet<BackgroundCheck[]>(`/background-checks/candidate/${candidateId}`),
    enabled: !!candidateId,
  });
  const checks: BackgroundCheck[] = (data?.data as any) ?? [];

  const resultMutation = useMutation({
    mutationFn: ({ id, result }: { id: string; result: string }) =>
      apiPut(`/background-checks/${id}`, { result }),
    onSuccess: () => {
      toast.success("Result recorded");
      queryClient.invalidateQueries({ queryKey: ["candidate-bgchecks", candidateId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Could not update result"),
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <ShieldCheck className="h-5 w-5 text-gray-400" /> Background checks ({checks.length})
        </h2>
        <button
          onClick={() => setShowInitiate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Initiate
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : checks.length === 0 ? (
          <p className="px-6 py-6 text-center text-sm text-gray-500">No background checks yet.</p>
        ) : (
          checks.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-6 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium capitalize text-gray-900">{label(c.check_type)} check</p>
                <p className="text-xs capitalize text-gray-500">
                  {c.provider} · requested {new Date(c.requested_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.report_url && (
                  <a href={c.report_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-brand-600"><ExternalLink className="h-4 w-4" /></a>
                )}
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_BADGE[c.status] || "bg-gray-100 text-gray-600")}>
                  {label(c.status)}
                </span>
                {c.result && (
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", RESULT_BADGE[c.result] || "bg-gray-100 text-gray-600")}>
                    {c.result}
                  </span>
                )}
                {/* Manual result entry for manual checks not yet resolved. */}
                {c.provider === "manual" && (!c.result || c.result === "pending") && (
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && resultMutation.mutate({ id: c.id, result: e.target.value })}
                    disabled={resultMutation.isPending}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">Set result…</option>
                    <option value="clear">Clear</option>
                    <option value="consider">Consider</option>
                    <option value="adverse">Adverse</option>
                  </select>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {showInitiate && (
        <InitiateModal candidateId={candidateId} onClose={() => setShowInitiate(false)} />
      )}
    </div>
  );
}

function InitiateModal({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [checkType, setCheckType] = useState<string>("criminal");
  const [provider, setProvider] = useState<string>("manual");

  const mutation = useMutation({
    mutationFn: () => apiPost("/background-checks/initiate", { candidate_id: candidateId, check_type: checkType, provider }),
    onSuccess: () => {
      toast.success("Background check initiated");
      queryClient.invalidateQueries({ queryKey: ["candidate-bgchecks", candidateId] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Could not initiate check"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">Initiate background check</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Check type</label>
            <select value={checkType} onChange={(e) => setCheckType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm capitalize focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              {CHECK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm capitalize focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              {PROVIDERS.map((p) => <option key={p} value={p}>{p === "manual" ? "Manual (record result yourself)" : p}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Third-party providers require an API integration; use Manual to track a check you run yourself.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Initiate
          </button>
        </div>
      </div>
    </div>
  );
}
