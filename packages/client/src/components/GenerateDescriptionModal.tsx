// ============================================================================
// GenerateDescriptionModal — AI-assisted job description generator. Collects
// title / seniority / skills, calls POST /job-descriptions/generate-description,
// and returns { description (HTML), requirements (HTML), benefits (HTML) } to
// populate the job form.
// ============================================================================

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, X } from "lucide-react";
import { apiPost } from "@/api/client";
import { aiErrorMessage } from "@/lib/utils";
import toast from "react-hot-toast";

interface GeneratedJD {
  overview: string;
  responsibilities: string[];
  requirements: string[];
  nice_to_have: string[];
  benefits: string[];
  skills: string[];
  full_description: string;
}

const SENIORITY = [
  { value: "intern", label: "Intern" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "director", label: "Director" },
  { value: "vp", label: "VP" },
  { value: "c_level", label: "C-level" },
] as const;

// Turn the structured JD into the HTML the RichText fields expect.
function listHtml(items: string[]): string {
  if (!items?.length) return "";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}
function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function GenerateDescriptionModal({
  initialTitle,
  initialSkills,
  onApply,
  onClose,
}: {
  initialTitle?: string;
  initialSkills?: string;
  onApply: (v: { description: string; requirements: string; benefits: string; skills: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle || "");
  const [seniority, setSeniority] = useState<string>("mid");
  const [skills, setSkills] = useState(initialSkills || "");
  const [department, setDepartment] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const skillsArr = skills.split(",").map((s) => s.trim()).filter(Boolean);
      return apiPost<GeneratedJD>("/job-descriptions/generate-description", {
        title: title.trim(),
        seniority,
        skills: skillsArr,
        department: department.trim() || undefined,
      });
    },
    onSuccess: (res: any) => {
      const jd: GeneratedJD = res?.data || res;
      // Description = overview + responsibilities as HTML; requirements & benefits
      // as their own HTML lists so they land in the right form fields.
      const description =
        `<p>${escapeHtml(jd.overview)}</p>` +
        (jd.responsibilities?.length ? `<h3>Responsibilities</h3>${listHtml(jd.responsibilities)}` : "");
      const requirements =
        listHtml(jd.requirements) +
        (jd.nice_to_have?.length ? `<h3>Nice to have</h3>${listHtml(jd.nice_to_have)}` : "");
      const benefits = listHtml(jd.benefits);
      // Skills go back as a comma-separated string for the form's Skills field.
      const skillsStr = Array.isArray(jd.skills) ? jd.skills.join(", ") : "";
      onApply({ description, requirements, benefits, skills: skillsStr });
      toast.success(`Generated — ${jd.skills?.length || 0} skills suggested`);
      onClose();
    },
    onError: (err: any) => toast.error(aiErrorMessage(err, "Couldn't generate the description. Please try again.")),
  });

  const canGenerate = title.trim().length >= 2 && skills.split(",").map((s) => s.trim()).filter(Boolean).length >= 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Sparkles className="h-5 w-5 text-brand-600" /> Generate description
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Job title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Backend Engineer"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Seniority</label>
              <select value={seniority} onChange={(e) => setSeniority(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                {SENIORITY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
              <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Optional"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Key skills * <span className="font-normal text-gray-400">(comma-separated — AI adds more)</span>
            </label>
            <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. Node.js, AWS"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <p className="mt-1 text-xs text-gray-400">Enter a few core skills; the AI will suggest a fuller skill set for the role.</p>
          </div>
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            This fills the Description, Requirements, Benefits, and Skills fields with a generated draft you can edit.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!canGenerate || mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
