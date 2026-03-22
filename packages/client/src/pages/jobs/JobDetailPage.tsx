import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Edit,
  MapPin,
  Briefcase,
  Clock,
  DollarSign,
  Users,
  Star,
  Calendar,
} from "lucide-react";
import { apiGet, apiPatch } from "@/api/client";
import type { JobPosting, PaginatedResponse, ApplicationStage } from "@emp-recruit/shared";
import { cn, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  open: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  closed: "bg-red-100 text-red-700",
  filled: "bg-blue-100 text-blue-700",
};

const STAGE_ORDER: ApplicationStage[] = [
  "applied" as any,
  "screened" as any,
  "interview" as any,
  "offer" as any,
  "hired" as any,
  "rejected" as any,
  "withdrawn" as any,
];

const STAGE_COLORS: Record<string, string> = {
  applied: "bg-blue-50 border-blue-200",
  screened: "bg-indigo-50 border-indigo-200",
  interview: "bg-purple-50 border-purple-200",
  offer: "bg-amber-50 border-amber-200",
  hired: "bg-green-50 border-green-200",
  rejected: "bg-red-50 border-red-200",
  withdrawn: "bg-gray-50 border-gray-200",
};

const STAGE_HEADER: Record<string, string> = {
  applied: "bg-blue-100 text-blue-800",
  screened: "bg-indigo-100 text-indigo-800",
  interview: "bg-purple-100 text-purple-800",
  offer: "bg-amber-100 text-amber-800",
  hired: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  withdrawn: "bg-gray-100 text-gray-800",
};

interface AppWithCandidate {
  id: string;
  stage: string;
  rating: number | null;
  applied_at: string;
  candidate_first_name: string;
  candidate_last_name: string;
  candidate_email: string;
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: jobData, isLoading: loadingJob } = useQuery({
    queryKey: ["job", id],
    queryFn: () => apiGet<JobPosting>(`/jobs/${id}`),
    enabled: Boolean(id),
  });

  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ["job-applications", id],
    queryFn: () =>
      apiGet<PaginatedResponse<AppWithCandidate>>(`/jobs/${id}/applications`, { perPage: 100 }),
    enabled: Boolean(id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiPatch<JobPosting>(`/jobs/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("Job status updated");
      queryClient.invalidateQueries({ queryKey: ["job", id] });
    },
    onError: () => toast.error("Failed to update status"),
  });

  const job = jobData?.data;
  const applications = appsData?.data?.data ?? [];

  // Group applications by stage
  const grouped: Record<string, AppWithCandidate[]> = {};
  for (const stage of STAGE_ORDER) {
    grouped[stage] = [];
  }
  for (const app of applications) {
    if (grouped[app.stage]) {
      grouped[app.stage].push(app);
    }
  }

  if (loadingJob) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Job not found.</p>
      </div>
    );
  }

  const skills = job.skills ? JSON.parse(job.skills) as string[] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate("/jobs")}
            className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                  STATUS_BADGE[job.status] ?? "bg-gray-100 text-gray-700",
                )}
              >
                {job.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
              {job.department && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-4 w-4" /> {job.department}
                </span>
              )}
              {job.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {job.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1 capitalize">
                <Clock className="h-4 w-4" /> {job.employment_type.replace(/_/g, " ")}
              </span>
              {(job.salary_min || job.salary_max) && (
                <span className="inline-flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  {job.salary_min?.toLocaleString()} - {job.salary_max?.toLocaleString()} {job.salary_currency}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {job.status === "draft" && (
            <button
              onClick={() => statusMutation.mutate("open")}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Publish
            </button>
          )}
          {job.status === "open" && (
            <button
              onClick={() => statusMutation.mutate("closed")}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Close
            </button>
          )}
          <Link
            to={`/jobs/${job.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Edit className="h-4 w-4" />
            Edit
          </Link>
        </div>
      </div>

      {/* Job details card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Description</h2>
          <p className="mt-2 text-gray-700 whitespace-pre-line">{job.description}</p>
        </div>
        {job.requirements && (
          <div>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Requirements</h2>
            <p className="mt-2 text-gray-700 whitespace-pre-line">{job.requirements}</p>
          </div>
        )}
        {skills.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Skills</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {skills.map((skill: string) => (
                <span
                  key={skill}
                  className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
        {(job.experience_min !== null || job.experience_max !== null) && (
          <div>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Experience</h2>
            <p className="mt-2 text-gray-700">
              {job.experience_min ?? 0} - {job.experience_max ?? "any"} years
            </p>
          </div>
        )}
        <div className="flex gap-6 text-sm text-gray-500">
          <span>Created: {formatDate(job.created_at)}</span>
          {job.published_at && <span>Published: {formatDate(job.published_at)}</span>}
          {job.closes_at && <span>Closes: {formatDate(job.closes_at)}</span>}
        </div>
      </div>

      {/* Kanban Pipeline */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Application Pipeline ({applications.length} applicant{applications.length !== 1 ? "s" : ""})
        </h2>

        {loadingApps ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
            <Users className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No applications yet for this job.</p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGE_ORDER.map((stage) => {
              const cards = grouped[stage] ?? [];
              if (stage === "withdrawn" && cards.length === 0) return null;
              return (
                <div
                  key={stage}
                  className="flex-shrink-0 w-64"
                >
                  {/* Stage header */}
                  <div
                    className={cn(
                      "rounded-t-lg px-3 py-2 text-sm font-semibold capitalize",
                      STAGE_HEADER[stage] ?? "bg-gray-100 text-gray-800",
                    )}
                  >
                    {stage} ({cards.length})
                  </div>

                  {/* Cards */}
                  <div
                    className={cn(
                      "min-h-[120px] rounded-b-lg border p-2 space-y-2",
                      STAGE_COLORS[stage] ?? "bg-gray-50 border-gray-200",
                    )}
                  >
                    {cards.length === 0 ? (
                      <p className="py-4 text-center text-xs text-gray-400">No applicants</p>
                    ) : (
                      cards.map((app) => (
                        <Link
                          key={app.id}
                          to={`/candidates/${app.id}`}
                          className="block rounded-lg bg-white border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <p className="text-sm font-medium text-gray-900">
                            {app.candidate_first_name} {app.candidate_last_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{app.candidate_email}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(app.applied_at)}
                            </span>
                            {app.rating !== null && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                                <Star className="h-3 w-3 fill-amber-400" />
                                {app.rating}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
