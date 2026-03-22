import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { apiPost } from "@/api/client";
import type { Candidate } from "@emp-recruit/shared";
import toast from "react-hot-toast";

const SOURCES = [
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "naukri", label: "Naukri" },
  { value: "other", label: "Other" },
];

interface FormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  source: string;
  linkedin_url: string;
  portfolio_url: string;
  current_company: string;
  current_title: string;
  experience_years: string;
  skills: string;
  notes: string;
  tags: string;
}

const INITIAL: FormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  source: "direct",
  linkedin_url: "",
  portfolio_url: "",
  current_company: "",
  current_title: "",
  experience_years: "",
  skills: "",
  notes: "",
  tags: "",
};

export function CandidateCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(INITIAL);

  const mutation = useMutation({
    mutationFn: (data: Record<string, any>) => apiPost<Candidate>("/candidates", data),
    onSuccess: (res) => {
      toast.success("Candidate added successfully");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      navigate(`/candidates/${res.data?.id}`);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message ?? "Failed to add candidate";
      toast.error(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: Record<string, any> = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      source: form.source,
    };

    if (form.phone) payload.phone = form.phone;
    if (form.linkedin_url) payload.linkedin_url = form.linkedin_url;
    if (form.portfolio_url) payload.portfolio_url = form.portfolio_url;
    if (form.current_company) payload.current_company = form.current_company;
    if (form.current_title) payload.current_title = form.current_title;
    if (form.experience_years) payload.experience_years = Number(form.experience_years);
    if (form.skills) payload.skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (form.notes) payload.notes = form.notes;
    if (form.tags) payload.tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);

    mutation.mutate(payload);
  }

  function field(label: string, name: keyof FormData, type = "text", opts?: { required?: boolean; placeholder?: string }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {opts?.required && <span className="text-red-500">*</span>}
        </label>
        <input
          type={type}
          value={form[name]}
          onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))}
          placeholder={opts?.placeholder}
          required={opts?.required}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add Candidate</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Personal Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("First Name", "first_name", "text", { required: true, placeholder: "John" })}
            {field("Last Name", "last_name", "text", { required: true, placeholder: "Doe" })}
          </div>
          {field("Email", "email", "email", { required: true, placeholder: "john@example.com" })}
          {field("Phone", "phone", "tel", { placeholder: "+91 98765 43210" })}
        </div>

        {/* Professional Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Professional Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("Current Company", "current_company", "text", { placeholder: "Acme Corp" })}
            {field("Current Title", "current_title", "text", { placeholder: "Software Engineer" })}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("Experience (years)", "experience_years", "number", { placeholder: "5" })}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Links & Skills */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Links & Skills</h2>
          {field("LinkedIn URL", "linkedin_url", "url", { placeholder: "https://linkedin.com/in/..." })}
          {field("Portfolio URL", "portfolio_url", "url", { placeholder: "https://..." })}
          {field("Skills (comma separated)", "skills", "text", { placeholder: "React, TypeScript, Node.js" })}
          {field("Tags (comma separated)", "tags", "text", { placeholder: "senior, frontend, remote" })}
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={4}
            placeholder="Any internal notes about the candidate..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Add Candidate
          </button>
        </div>
      </form>
    </div>
  );
}
