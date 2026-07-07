import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Clock,
  Globe,
  Linkedin,
  FileText,
  ExternalLink,
  Pencil,
  Download,
  Trash2,
} from "lucide-react";
import { apiGet, apiDelete } from "@/api/client";
import { resolveUploadUrl } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Candidate, Application } from "@emp-recruit/shared";
import { CandidateAssessmentsPanel } from "@/components/CandidateAssessmentsPanel";
import { CandidateBackgroundChecksPanel } from "@/components/CandidateBackgroundChecksPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn, formatDate } from "@/lib/utils";

const STAGE_BADGE: Record<string, string> = {
  applied: "bg-blue-100 text-blue-700",
  screened: "bg-indigo-100 text-indigo-700",
  interview: "bg-purple-100 text-purple-700",
  offer: "bg-amber-100 text-amber-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-700",
};

interface AppWithJob extends Application {
  job_title?: string;
  job_department?: string;
}

export function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: candidateData, isLoading: loadingCandidate } = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => apiGet<Candidate>(`/candidates/${id}`),
    enabled: Boolean(id),
  });

  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ["candidate-applications", id],
    queryFn: () => apiGet<Application[]>(`/candidates/${id}/applications`),
    enabled: Boolean(id),
  });

  const candidate = candidateData?.data;
  const applications = appsData?.data ?? [];

  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/candidates/${id}`),
    onSuccess: () => {
      toast.success("Candidate deleted");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      navigate("/candidates");
    },
    onError: (err: any) => {
      setShowDeleteConfirm(false);
      toast.error(err?.response?.data?.error?.message || "Could not delete candidate");
    },
  });

  // Resume stored as a MySQL BLOB (portal uploads). Served via the org-scoped
  // recruiter endpoint; token passed as a query param so it opens in a new tab.
  const resumeFileId = (candidate as any)?.resume_file_id as string | undefined;
  const hasBlobResume = !!resumeFileId;
  const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";
  const authToken = localStorage.getItem("access_token") || "";
  const resumeUrl = `${API_BASE}/candidates/${id}/resume?token=${encodeURIComponent(authToken)}`;

  if (loadingCandidate) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Candidate not found.</p>
      </div>
    );
  }

  // #15 — mysql2 returns JSON columns as already-parsed arrays. Calling
  // JSON.parse on an array throws, which crashed this page to blank after
  // clicking a candidate. Handle array | string | null defensively.
  const parseJsonArray = (v: unknown): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v as string[];
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  const skills = parseJsonArray(candidate.skills);
  const tags = parseJsonArray(candidate.tags);

  const fullName = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || "Candidate";
  const avatarInitials = ((candidate.first_name?.[0] || "") + (candidate.last_name?.[0] || "")).toUpperCase() || "C";
  const subtitle = candidate.current_title
    ? `${candidate.current_title}${candidate.current_company ? ` · ${candidate.current_company}` : ""}`
    : candidate.current_company || "";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate("/candidates")}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Candidates
      </button>

      {/* Header card — avatar, name, quick facts + actions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700">
            {avatarInitials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-gray-900">{fullName}</h1>
            {subtitle && <p className="mt-0.5 truncate text-gray-500">{subtitle}</p>}
            {/* Quick facts row */}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`mailto:${candidate.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">
                <Mail className="h-3.5 w-3.5 text-gray-400" />{candidate.email}
              </a>
              {candidate.phone && (
                <a href={`tel:${candidate.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />{candidate.phone}
                </a>
              )}
              {candidate.experience_years != null && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />{candidate.experience_years} yr{candidate.experience_years === 1 ? "" : "s"} exp
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium capitalize text-gray-600">
                <Building2 className="h-3.5 w-3.5 text-gray-400" />via {candidate.source}
              </span>
              {candidate.linkedin_url && (
                <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100">
                  <Linkedin className="h-3.5 w-3.5" />LinkedIn
                </a>
              )}
              {candidate.portfolio_url && (
                <a href={candidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100">
                  <Globe className="h-3.5 w-3.5" />Portfolio
                </a>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {hasBlobResume && (
              <a href={`${resumeUrl}&download=1`} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                <Download className="h-4 w-4" /> Resume
              </a>
            )}
            <Link to={`/candidates/${id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>

        {/* Skills row (if any) */}
        {skills.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-100 pt-4">
            {skills.map((skill: string) => (
              <span key={skill} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{skill}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* LEFT (prominent): Resume */}
        <div className="lg:col-span-3">
          {hasBlobResume || candidate.resume_path ? (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <FileText className="h-4 w-4 text-gray-400" /> Resume
                </h2>
                {hasBlobResume && (
                  <div className="flex items-center gap-2">
                    <a href={resumeUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                    <a href={`${resumeUrl}&download=1`}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </div>
                )}
              </div>
              {hasBlobResume ? (
                <iframe title="Resume preview" src={resumeUrl} className="h-[720px] w-full bg-gray-50" />
              ) : (
                <div className="p-6">
                  <a href={resolveUploadUrl(candidate.resume_path!)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <FileText className="h-4 w-4" /> View Resume <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-center">
              <FileText className="h-10 w-10 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No resume on file.</p>
            </div>
          )}
        </div>

        {/* RIGHT: Applications + About + Notes */}
        <div className="space-y-6 lg:col-span-2">
          {/* Applications — THIS org only */}
          <div>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-gray-900">
                Applications at your company ({applications.length})
              </h2>
              <p className="text-xs text-gray-400">Only applications to your organization are shown.</p>
            </div>
            {loadingApps ? (
              <div className="flex justify-center py-6"><div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>
            ) : applications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center">
                <p className="text-sm text-gray-500">No applications yet.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {applications.map((app: any) => (
                  <div key={app.id} className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/jobs/${app.job_id}`} className="block truncate text-sm font-semibold text-gray-900 hover:text-brand-600">
                          {app.job_title || "Job"}
                        </Link>
                        {app.job_department && <p className="truncate text-xs text-gray-500">{app.job_department}</p>}
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STAGE_BADGE[app.stage] ?? "bg-gray-100 text-gray-700")}>
                        {app.stage}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>Applied {formatDate(app.applied_at)}</span>
                      <span className="capitalize">via {app.source}</span>
                      {app.rating != null && <span className="text-amber-600">★ {app.rating}/5</span>}
                    </div>
                    {app.notes && <p className="mt-2 line-clamp-2 text-xs text-gray-600">{app.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assessments — invite + results */}
          {id && <CandidateAssessmentsPanel candidateId={id} />}

          {/* Background checks — initiate + track + record results */}
          {id && <CandidateBackgroundChecksPanel candidateId={id} />}

          {/* About — professional details, only rendered when there's something */}
          {(candidate.current_company || candidate.current_title || candidate.experience_years != null || tags.length > 0) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">About</h2>
              <dl className="space-y-2.5 text-sm">
                {candidate.current_company && <Row icon={Building2} label="Company" value={candidate.current_company} />}
                {candidate.current_title && <Row icon={Briefcase} label="Title" value={candidate.current_title} />}
                {candidate.experience_years != null && <Row icon={Clock} label="Experience" value={`${candidate.experience_years} year${candidate.experience_years === 1 ? "" : "s"}`} />}
              </dl>
              {tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
                  {tags.map((tag: string) => (
                    <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {candidate.notes && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-semibold text-gray-900">Notes</h2>
              <p className="whitespace-pre-line text-sm text-gray-700">{candidate.notes}</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        variant="danger"
        title="Delete this candidate?"
        message="This permanently removes the candidate. Candidates with applications can't be deleted — reject or withdraw their applications instead."
        confirmLabel="Delete candidate"
        cancelLabel="Cancel"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

// Small labelled row for the About card.
function Row({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="w-20 shrink-0 text-xs text-gray-400">{label}</span>
      <span className="truncate font-medium text-gray-700">{value}</span>
    </div>
  );
}
