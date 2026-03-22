import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Briefcase,
  Users,
  UserCheck,
  TrendingUp,
  Clock,
  BarChart3,
} from "lucide-react";
import { apiGet } from "@/api/client";

interface OverviewData {
  openJobs: number;
  totalCandidates: number;
  activeApplications: number;
  recentHires: number;
}

interface PipelineStage {
  stage: string;
  count: number;
}

interface TimeToHireData {
  averageDays: number;
  hiredCount: number;
}

interface SourceData {
  source: string;
  total: number;
  hired: number;
  hireRate: number;
}

const STAGE_COLORS: Record<string, string> = {
  applied: "bg-blue-500",
  screened: "bg-cyan-500",
  interview: "bg-yellow-500",
  offer: "bg-purple-500",
  hired: "bg-green-500",
  rejected: "bg-red-400",
  withdrawn: "bg-gray-400",
};

const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screened: "Screened",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function AnalyticsPage() {
  const overviewQuery = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: async () => {
      const res = await apiGet<OverviewData>("/analytics/overview");
      return res.data!;
    },
  });

  const pipelineQuery = useQuery({
    queryKey: ["analytics", "pipeline"],
    queryFn: async () => {
      const res = await apiGet<PipelineStage[]>("/analytics/pipeline");
      return res.data!;
    },
  });

  const timeToHireQuery = useQuery({
    queryKey: ["analytics", "time-to-hire"],
    queryFn: async () => {
      const res = await apiGet<TimeToHireData>("/analytics/time-to-hire");
      return res.data!;
    },
  });

  const sourcesQuery = useQuery({
    queryKey: ["analytics", "sources"],
    queryFn: async () => {
      const res = await apiGet<SourceData[]>("/analytics/sources");
      return res.data!;
    },
  });

  const overview = overviewQuery.data;
  const pipeline = pipelineQuery.data || [];
  const timeToHire = timeToHireQuery.data;
  const sources = sourcesQuery.data || [];

  const maxPipelineCount = Math.max(...pipeline.map((s) => s.count), 1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recruitment Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">Hiring funnel, time-to-hire, and source effectiveness.</p>
      </div>

      {/* Stat cards */}
      {overviewQuery.isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : overview ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Briefcase} label="Open Jobs" value={overview.openJobs} color="text-blue-600" bg="bg-blue-50" />
          <StatCard icon={Users} label="Total Candidates" value={overview.totalCandidates} color="text-purple-600" bg="bg-purple-50" />
          <StatCard icon={TrendingUp} label="Active Applications" value={overview.activeApplications} color="text-amber-600" bg="bg-amber-50" />
          <StatCard icon={UserCheck} label="Hires" value={overview.recentHires} color="text-green-600" bg="bg-green-50" />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Pipeline Funnel */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            Pipeline Funnel
          </h2>
          {pipelineQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : pipeline.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No pipeline data available yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {pipeline.map((stage) => (
                <div key={stage.stage}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{STAGE_LABELS[stage.stage] || stage.stage}</span>
                    <span className="text-gray-500">{stage.count}</span>
                  </div>
                  <div className="h-6 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all ${STAGE_COLORS[stage.stage] || "bg-gray-400"}`}
                      style={{ width: `${Math.max((stage.count / maxPipelineCount) * 100, stage.count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Time to Hire + Source breakdown */}
        <div className="space-y-6">
          {/* Time to Hire */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Clock className="h-5 w-5 text-brand-600" />
              Time to Hire
            </h2>
            {timeToHireQuery.isLoading ? (
              <div className="flex h-20 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : timeToHire ? (
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-bold text-gray-900">{timeToHire.averageDays}</span>
                <span className="mb-1 text-sm text-gray-500">days average</span>
              </div>
            ) : null}
            {timeToHire && (
              <p className="mt-2 text-sm text-gray-500">
                Based on {timeToHire.hiredCount} hire{timeToHire.hiredCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Source Effectiveness */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Source Effectiveness</h2>
            {sourcesQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : sources.length === 0 ? (
              <p className="text-sm text-gray-500">No source data available yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-2 font-medium text-gray-600">Source</th>
                      <th className="pb-2 font-medium text-gray-600 text-right">Total</th>
                      <th className="pb-2 font-medium text-gray-600 text-right">Hired</th>
                      <th className="pb-2 font-medium text-gray-600 text-right">Hire Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sources.map((src) => (
                      <tr key={src.source}>
                        <td className="py-2 font-medium text-gray-900 capitalize">{src.source}</td>
                        <td className="py-2 text-right text-gray-700">{src.total}</td>
                        <td className="py-2 text-right text-gray-700">{src.hired}</td>
                        <td className="py-2 text-right">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              src.hireRate >= 30
                                ? "bg-green-100 text-green-700"
                                : src.hireRate >= 10
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {src.hireRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
