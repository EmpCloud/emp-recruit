import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ClipboardList,
  Plus,
  Calendar,
  User,
  Search,
  X,
  Loader2,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import toast from "react-hot-toast";
import type { OnboardingStatus, PaginatedResponse } from "@emp-recruit/shared";

interface EnrichedChecklist {
  id: string;
  organization_id: number;
  application_id: string;
  candidate_id: string;
  template_id: string;
  status: OnboardingStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  candidate_name: string;
  job_title: string;
  joining_date: string | null;
  progress: { total: number; completed: number; percentage: number };
}

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Not Started", value: "not_started" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  not_started: { label: "Not Started", className: "bg-gray-100 text-gray-700" },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "---";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-gray-200">
        <div
          className={`h-2 rounded-full transition-all ${
            percentage >= 100 ? "bg-green-500" : percentage > 0 ? "bg-brand-500" : "bg-gray-300"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600 tabular-nums">{percentage}%</span>
    </div>
  );
}

export function OnboardingListPage() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-checklists", activeTab, page],
    queryFn: () =>
      apiGet<PaginatedResponse<EnrichedChecklist>>("/onboarding/checklists", {
        ...(activeTab !== "all" && { status: activeTab }),
        page,
        limit: 20,
      }),
  });

  const checklists = data?.data;
  const filtered = checklists?.data?.filter(
    (c) =>
      !search ||
      c.candidate_name.toLowerCase().includes(search.toLowerCase()) ||
      c.job_title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
          <p className="mt-1 text-sm text-gray-500">Track new hire onboarding checklists</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/onboarding/templates"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Manage Templates
          </Link>
          <button
            onClick={() => setShowGenerate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> New checklist
          </button>
        </div>
      </div>

      {showGenerate && <GenerateChecklistModal onClose={() => setShowGenerate(false)} />}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by candidate name or job title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Status Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Onboarding status tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setActiveTab(tab.value); setPage(1); }}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white">
          <ClipboardList className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-medium text-gray-900">No checklists found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Onboarding checklists are generated when an offer is accepted.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((checklist) => {
            const sConfig = STATUS_CONFIG[checklist.status] || STATUS_CONFIG.not_started;
            return (
              <Link
                key={checklist.id}
                to={`/onboarding/${checklist.id}`}
                className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-brand-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 group-hover:text-brand-600 transition-colors">
                        {checklist.candidate_name}
                      </p>
                      <p className="text-sm text-gray-500">{checklist.job_title}</p>
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sConfig.className}`}>
                    {sConfig.label}
                  </span>
                </div>

                <div className="mt-4">
                  <ProgressBar percentage={checklist.progress.percentage} />
                  <p className="mt-1 text-xs text-gray-500">
                    {checklist.progress.total > 0
                      ? `${checklist.progress.completed} of ${checklist.progress.total} tasks completed`
                      : "No tasks in this template yet"}
                  </p>
                </div>

                {checklist.joining_date && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
                    <Calendar className="h-3.5 w-3.5" />
                    Joining: {formatDate(checklist.joining_date)}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {checklists && checklists.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {checklists.page} of {checklists.totalPages} ({checklists.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= (checklists?.totalPages || 1)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate a checklist from a template for a hired candidate's application.
// POST /onboarding/checklists { application_id, template_id, joining_date }.
// ---------------------------------------------------------------------------
function GenerateChecklistModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [joiningDate, setJoiningDate] = useState("");

  const { data: templatesData } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: () => apiGet<any[]>("/onboarding/templates"),
  });
  const templates: any[] = (templatesData?.data as any) ?? [];

  // Hired candidates' applications are the valid targets for onboarding.
  const { data: appsData } = useQuery({
    queryKey: ["applications", "hired"],
    queryFn: () => apiGet<any>("/applications", { stage: "hired", perPage: 100 }),
  });
  const apps: any[] = ((appsData?.data as any)?.data) ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      apiPost("/onboarding/checklists", {
        application_id: applicationId,
        template_id: templateId,
        joining_date: joiningDate,
      }),
    onSuccess: () => {
      toast.success("Onboarding checklist created");
      queryClient.invalidateQueries({ queryKey: ["onboarding-checklists"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Could not create checklist"),
  });

  const canSubmit = templateId && applicationId && joiningDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">New onboarding checklist</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Hired candidate</label>
            {apps.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">No hired candidates yet. Move a candidate to "hired" first.</p>
            ) : (
              <select value={applicationId} onChange={(e) => setApplicationId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Select…</option>
                {apps.map((a) => <option key={a.id} value={a.id}>{a.candidate_name} — {a.job_title}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Template</label>
            {templates.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">No templates yet. Create one under Manage Templates.</p>
            ) : (
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Select…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Joining date</label>
            <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create checklist
          </button>
        </div>
      </div>
    </div>
  );
}
