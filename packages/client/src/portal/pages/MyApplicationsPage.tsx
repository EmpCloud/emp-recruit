// ============================================================================
// MY APPLICATIONS — the candidate's applications across all organizations.
// ============================================================================

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, Briefcase, Loader2, Clock } from "lucide-react";
import { pget } from "../api";

interface AppRow {
  id: string;
  stage: string;
  applied_at: string;
  job_id: string;
  job_title: string;
  job_location?: string;
  employment_type?: string;
  organization_name?: string;
}

const STAGE_STYLE: Record<string, string> = {
  applied: "bg-blue-50 text-blue-700",
  screening: "bg-indigo-50 text-indigo-700",
  interview: "bg-amber-50 text-amber-700",
  offer: "bg-emerald-50 text-emerald-700",
  hired: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
};

function stageLabel(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()); }

export function MyApplicationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-my-applications"],
    queryFn: () => pget<AppRow[]>("/careers/my/applications"),
  });
  const apps: AppRow[] = data || [];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">My applications</h1>
      <p className="mb-6 text-gray-500">Every role you've applied to, across all companies.</p>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>
      ) : apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <Briefcase className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">You haven't applied to any jobs yet.</p>
          <Link to="/jobs-portal" className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Browse jobs</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <Building2 className="h-3.5 w-3.5" /> {a.organization_name || "Company"}
                </div>
                <Link to={`/jobs-portal/jobs/${a.job_id}`} className="block truncate text-base font-semibold text-gray-900 hover:text-brand-700">
                  {a.job_title}
                </Link>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                  {a.job_location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{a.job_location}</span>}
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Applied {new Date(a.applied_at).toLocaleDateString()}</span>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STAGE_STYLE[a.stage] || "bg-gray-100 text-gray-600"}`}>
                {stageLabel(a.stage)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
