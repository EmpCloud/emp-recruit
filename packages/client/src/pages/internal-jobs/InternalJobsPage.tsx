import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Briefcase,
  MapPin,
  Clock,
  Building2,
  Send,
  CheckCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { getUser } from "@/lib/auth-store";
import toast from "react-hot-toast";

interface JobPosting {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string;
  experience_min: number | null;
  experience_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  description: string;
  requirements: string | null;
  benefits: string | null;
  status: string;
}

export function InternalJobsPage() {
  const user = getUser();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [coverLetter, setCoverLetter] = useState("");

  const jobsQuery = useQuery({
    queryKey: ["internal-jobs"],
    queryFn: async () => {
      const res = await apiGet<{ data: JobPosting[] }>("/jobs", {
        status: "open",
        limit: 100,
      });
      return res.data?.data || [];
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ jobId }: { jobId: string }) => {
      return apiPost("/referrals", {
        job_id: jobId,
        first_name: user?.firstName || "",
        last_name: user?.lastName || "",
        email: user?.email || "",
        relationship: "internal_employee",
        notes: coverLetter || "Internal application",
      });
    },
    onSuccess: () => {
      toast.success("Application submitted successfully!");
      setSelectedJob(null);
      setCoverLetter("");
      queryClient.invalidateQueries({ queryKey: ["internal-jobs"] });
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.error?.message || "Failed to submit application",
      );
    },
  });

  const jobs: JobPosting[] = jobsQuery.data || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Internal Job Postings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse open positions within the company and apply for internal
          transfers or promotions.
        </p>
      </div>

      {jobsQuery.isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No Open Positions
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            There are no open positions at this time. Check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-medium text-gray-500">
            {jobs.length} open position{jobs.length !== 1 ? "s" : ""}
          </p>
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {job.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    {job.department && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        {job.department}
                      </span>
                    )}
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {job.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-4 w-4" />
                      {job.employment_type.replace(/_/g, " ")}
                    </span>
                    {(job.experience_min != null ||
                      job.experience_max != null) && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {job.experience_min ?? 0}–{job.experience_max ?? "10+"}{" "}
                        yrs
                      </span>
                    )}
                  </div>
                  {job.description && (
                    <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                      {job.description.replace(/<[^>]+>/g, "").slice(0, 200)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedJob(job)}
                  className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Send className="h-4 w-4" />
                  Apply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              Apply for {selectedJob.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Submit your interest for this internal position.
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Applying as:</span>{" "}
                  {user?.firstName} {user?.lastName} ({user?.email})
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Cover Note (optional)
                </label>
                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  rows={4}
                  placeholder="Why are you interested in this role?"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setSelectedJob(null);
                  setCoverLetter("");
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  applyMutation.mutate({ jobId: selectedJob.id })
                }
                disabled={applyMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {applyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Submit Application
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
