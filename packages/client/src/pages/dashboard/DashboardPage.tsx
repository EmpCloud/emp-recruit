import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Briefcase,
  Users,
  FileText,
  TrendingUp,
  ChevronRight,
  Calendar,
  ArrowUpRight,
} from "lucide-react";
import { apiGet } from "@/api/client";
import type { JobPosting, Candidate, PaginatedResponse } from "@emp-recruit/shared";
import { cn, formatDate } from "@/lib/utils";

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  applied: { label: "Applied", color: "bg-blue-500" },
  screened: { label: "Screened", color: "bg-indigo-500" },
  interview: { label: "Interview", color: "bg-purple-500" },
  offer: { label: "Offer", color: "bg-amber-500" },
  hired: { label: "Hired", color: "bg-green-500" },
  rejected: { label: "Rejected", color: "bg-red-500" },
};

const STAGE_BADGE: Record<string, string> = {
  applied: "bg-blue-100 text-blue-700",
  screened: "bg-indigo-100 text-indigo-700",
  interview: "bg-purple-100 text-purple-700",
  offer: "bg-amber-100 text-amber-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-700",
};

interface DashboardStats {
  openJobsCount: number;
  totalCandidates: number;
  totalApplications: number;
  stageDistribution: Record<string, number>;
  recentApplications: any[];
}

export function DashboardPage() {
  // Fetch open jobs count
  const { data: jobsData } = useQuery({
    queryKey: ["dashboard-jobs"],
    queryFn: () => apiGet<PaginatedResponse<JobPosting>>("/jobs", { status: "open", perPage: 1 }),
  });

  // Fetch all jobs for total count
  const { data: allJobsData } = useQuery({
    queryKey: ["dashboard-all-jobs"],
    queryFn: () => apiGet<PaginatedResponse<JobPosting>>("/jobs", { perPage: 1 }),
  });

  // Fetch candidates count
  const { data: candidatesData } = useQuery({
    queryKey: ["dashboard-candidates"],
    queryFn: () => apiGet<PaginatedResponse<Candidate>>("/candidates", { perPage: 1 }),
  });

  // Fetch recent applications
  const { data: appsData } = useQuery({
    queryKey: ["dashboard-applications"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { perPage: 10, sort: "applied_at", order: "desc" }),
  });

  // Fetch application stage distribution via multiple stage queries
  const { data: appliedData } = useQuery({
    queryKey: ["dashboard-stage-applied"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "applied", perPage: 1 }),
  });
  const { data: screenedData } = useQuery({
    queryKey: ["dashboard-stage-screened"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "screened", perPage: 1 }),
  });
  const { data: interviewData } = useQuery({
    queryKey: ["dashboard-stage-interview"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "interview", perPage: 1 }),
  });
  const { data: offerData } = useQuery({
    queryKey: ["dashboard-stage-offer"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "offer", perPage: 1 }),
  });
  const { data: hiredData } = useQuery({
    queryKey: ["dashboard-stage-hired"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "hired", perPage: 1 }),
  });
  const { data: rejectedData } = useQuery({
    queryKey: ["dashboard-stage-rejected"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "rejected", perPage: 1 }),
  });

  const openJobsCount = jobsData?.data?.total ?? 0;
  const totalJobs = allJobsData?.data?.total ?? 0;
  const totalCandidates = candidatesData?.data?.total ?? 0;
  const totalApplications = appsData?.data?.total ?? 0;
  const recentApps = appsData?.data?.data ?? [];

  const stageDistribution: Record<string, number> = {
    applied: appliedData?.data?.total ?? 0,
    screened: screenedData?.data?.total ?? 0,
    interview: interviewData?.data?.total ?? 0,
    offer: offerData?.data?.total ?? 0,
    hired: hiredData?.data?.total ?? 0,
    rejected: rejectedData?.data?.total ?? 0,
  };

  const maxStageCount = Math.max(...Object.values(stageDistribution), 1);

  const statCards = [
    {
      label: "Open Jobs",
      value: openJobsCount,
      icon: Briefcase,
      color: "bg-brand-50 text-brand-600",
      link: "/jobs?status=open",
    },
    {
      label: "Total Candidates",
      value: totalCandidates,
      icon: Users,
      color: "bg-purple-50 text-purple-600",
      link: "/candidates",
    },
    {
      label: "Total Applications",
      value: totalApplications,
      icon: FileText,
      color: "bg-blue-50 text-blue-600",
      link: "/jobs",
    },
    {
      label: "Total Jobs",
      value: totalJobs,
      icon: TrendingUp,
      color: "bg-green-50 text-green-600",
      link: "/jobs",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Recruitment overview and pipeline metrics.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            to={stat.link}
            className="group rounded-lg border border-gray-200 bg-white p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className={cn("rounded-lg p-2.5", stat.color)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            </div>
            <p className="mt-4 text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="mt-1 text-sm text-gray-500">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pipeline Stage Distribution */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pipeline Distribution</h2>
          <div className="space-y-3">
            {Object.entries(STAGE_LABELS).map(([key, { label, color }]) => {
              const count = stageDistribution[key] ?? 0;
              const percentage = maxStageCount > 0 ? (count / maxStageCount) * 100 : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{label}</span>
                    <span className="text-gray-500">{count}</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-gray-100">
                    <div
                      className={cn("h-3 rounded-full transition-all", color)}
                      style={{ width: `${Math.max(percentage, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Applications */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Applications</h2>
            <Link
              to="/jobs"
              className="text-sm text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
            >
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {recentApps.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No applications yet.</p>
          ) : (
            <div className="space-y-3">
              {recentApps.map((app: any) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {app.candidate_first_name} {app.candidate_last_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{app.job_title}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        STAGE_BADGE[app.stage] ?? "bg-gray-100 text-gray-700",
                      )}
                    >
                      {app.stage}
                    </span>
                    <span className="text-xs text-gray-400 inline-flex items-center gap-1 whitespace-nowrap">
                      <Calendar className="h-3 w-3" />
                      {formatDate(app.applied_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
