// ============================================================================
// JOB DETAIL + APPLY
// Full job view. Apply opens a modal: upload resume (stored in MySQL) + optional
// cover letter. Requires candidate sign-in (redirects to login, returns here).
// ============================================================================

import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Briefcase, Building2, IndianRupee, Loader2, ArrowLeft,
  CheckCircle2, Upload, X, FileText,
} from "lucide-react";
import { pget, papplyForm } from "../api";
import { isCandidateLoggedIn } from "../store";
import { RichText } from "@/components/RichText";

interface Job {
  id: string; title: string; slug: string; department?: string; location?: string;
  employment_type?: string; experience_min?: number; experience_max?: number;
  salary_min?: number; salary_max?: number; salary_currency?: string;
  description: string; requirements?: string; benefits?: string;
  skills?: string[]; organization_name?: string; closes_at?: string;
}

function fmtType(t?: string) { return (t || "full_time").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()); }
function fmtSalary(j: Job): string | null {
  if (!j.salary_min && !j.salary_max) return null;
  const c = j.salary_currency === "INR" ? "₹" : (j.salary_currency || "") + " ";
  const lpa = (n?: number) => (n ? (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n.toLocaleString()) : "");
  if (j.salary_min && j.salary_max) return `${c}${lpa(j.salary_min)} – ${c}${lpa(j.salary_max)}`;
  return `${c}${lpa(j.salary_min || j.salary_max)}`;
}

export function JobDetailPage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const navigate = useNavigate();
  const [showApply, setShowApply] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["portal-job", idOrSlug],
    queryFn: () => pget<Job>(`/careers/jobs/${idOrSlug}`),
    enabled: !!idOrSlug,
  });

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  }
  if (!job) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">This job is no longer available.</p>
        <Link to="/jobs-portal" className="mt-3 inline-block text-brand-600 hover:underline">Back to jobs</Link>
      </div>
    );
  }

  const salary = fmtSalary(job);

  function onApplyClick() {
    if (!isCandidateLoggedIn()) {
      navigate(`/jobs-portal/login?redirect=/jobs-portal/jobs/${idOrSlug}`);
      return;
    }
    setShowApply(true);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/jobs-portal" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> All jobs
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500">
          <Building2 className="h-4 w-4" /> {job.organization_name || "Company"}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{job.title}</h1>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
          {job.location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{job.location}</span>}
          <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{fmtType(job.employment_type)}</span>
          {(job.experience_min != null || job.experience_max != null) && (
            <span>{job.experience_min ?? 0}–{job.experience_max ?? "+"} yrs</span>
          )}
          {salary && <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><IndianRupee className="h-4 w-4" />{salary}</span>}
        </div>

        {job.skills && job.skills.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {job.skills.map((s) => (
              <span key={s} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{s}</span>
            ))}
          </div>
        )}

        <button
          onClick={onApplyClick}
          className="mt-6 w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto sm:px-8"
        >
          Apply now
        </button>

        <Section title="About the role" body={job.description} />
        {job.requirements && <Section title="Requirements" body={job.requirements} />}
        {job.benefits && <Section title="Benefits" body={job.benefits} />}
      </div>

      {showApply && (
        <ApplyModal jobId={job.id} jobTitle={job.title} onClose={() => setShowApply(false)} />
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6 border-t border-gray-100 pt-6">
      <h2 className="mb-2 text-lg font-semibold text-gray-900">{title}</h2>
      <RichText html={body} />
    </div>
  );
}

function ApplyModal({ jobId, jobTitle, onClose }: { jobId: string; jobTitle: string; onClose: () => void }) {
  const [resume, setResume] = useState<File | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!resume) { setError("Please attach your resume."); return; }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("resume", resume);
      if (coverLetter) form.append("cover_letter", coverLetter);
      await papplyForm(`/careers/jobs/${jobId}/apply`, form);
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
            <h3 className="text-lg font-semibold text-gray-900">Application submitted!</h3>
            <p className="mt-1 text-sm text-gray-500">You applied for <span className="font-medium">{jobTitle}</span>. Track it under My Applications.</p>
            <button onClick={onClose} className="mt-5 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700">Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Apply — {jobTitle}</h3>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <label className="mb-1 block text-sm font-medium text-gray-700">Resume *</label>
            <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gray-300 px-4 py-4 hover:border-brand-400">
              {resume ? <FileText className="h-5 w-5 text-brand-600" /> : <Upload className="h-5 w-5 text-gray-400" />}
              <span className="text-sm text-gray-600">
                {resume ? resume.name : "Click to upload PDF or Word (max 8 MB)"}
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={(e) => setResume(e.target.files?.[0] || null)}
              />
            </label>

            <label className="mb-1 block text-sm font-medium text-gray-700">Cover letter <span className="font-normal text-gray-400">(optional)</span></label>
            <textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={4}
              placeholder="Tell them why you're a great fit…"
              className="mb-5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit application
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
