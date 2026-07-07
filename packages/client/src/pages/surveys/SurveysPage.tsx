// ============================================================================
// SURVEYS — recruiter view of candidate experience surveys + aggregate NPS.
// Backend: /api/v1/surveys (list, /nps).
// ============================================================================

import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquareHeart, Smile, Meh, Frown } from "lucide-react";
import { apiGet } from "@/api/client";
import { cn } from "@/lib/utils";

interface SurveyRow {
  id: string;
  survey_type: string;
  status: string;
  candidate_name?: string;
  created_at: string;
  completed_at: string | null;
}
interface Nps { nps: number; promoters: number; passives: number; detractors: number; total?: number }

const TYPE_LABEL: Record<string, string> = {
  post_interview: "Post-interview",
  post_offer: "Post-offer",
  post_rejection: "Post-rejection",
};
const STATUS_BADGE: Record<string, string> = {
  sent: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  expired: "bg-gray-100 text-gray-500",
};

export function SurveysPage() {
  const { data: listData, isLoading } = useQuery({
    queryKey: ["surveys"],
    queryFn: () => apiGet<{ data: SurveyRow[] } | SurveyRow[]>("/surveys"),
  });
  const { data: npsData } = useQuery({
    queryKey: ["surveys-nps"],
    queryFn: () => apiGet<Nps>("/surveys/nps"),
  });

  const raw = (listData?.data as any) ?? [];
  const surveys: SurveyRow[] = Array.isArray(raw) ? raw : (raw.data ?? []);
  const nps: Nps | undefined = (npsData?.data as any) ?? undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Candidate surveys</h1>
        <p className="mt-1 text-sm text-gray-500">
          Experience surveys sent to candidates, and your overall Net Promoter Score.
        </p>
      </div>

      {/* NPS summary */}
      {nps && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="text-3xl font-bold text-gray-900">{nps.nps}</div>
            <div className="mt-1 text-xs font-medium text-gray-500">Net Promoter Score</div>
          </div>
          <NpsTile icon={Smile} color="text-emerald-600" label="Promoters" value={nps.promoters} />
          <NpsTile icon={Meh} color="text-amber-600" label="Passives" value={nps.passives} />
          <NpsTile icon={Frown} color="text-red-600" label="Detractors" value={nps.detractors} />
        </div>
      )}

      {/* Survey list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : surveys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <MessageSquareHeart className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">No surveys sent yet.</p>
          <p className="mt-1 text-xs text-gray-400">Send one from a candidate's detail page.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {surveys.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.candidate_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{TYPE_LABEL[s.survey_type] || s.survey_type}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_BADGE[s.status] || "bg-gray-100 text-gray-600")}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NpsTile({ icon: Icon, color, label, value }: { icon: any; color: string; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-5 w-5", color)} />
        <span className="text-2xl font-bold text-gray-900">{value}</span>
      </div>
      <div className="mt-1 text-xs font-medium text-gray-500">{label}</div>
    </div>
  );
}
