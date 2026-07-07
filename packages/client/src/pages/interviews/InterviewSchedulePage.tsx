import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Save, Loader2, Search, X, Check, ChevronDown, Briefcase, Mail, UserRound,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Application, PaginatedResponse, InterviewType } from "@emp-recruit/shared";

type ApplicationRow = Application & {
  candidate_name: string;
  candidate_email?: string;
  job_title: string;
  job_department?: string;
};

interface OrgUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  designation: string | null;
}

const PANELIST_ROLES = ["interviewer", "hiring_manager", "observer", "recruiter"] as const;

function userFullName(u: { first_name?: string; last_name?: string; email?: string }): string {
  return `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || "";
}

// Stages a candidate can still be interviewed at (hide rejected/withdrawn/hired).
const SCHEDULABLE_STAGES = new Set(["applied", "screened", "interview", "offer"]);

const STAGE_BADGE: Record<string, string> = {
  applied: "bg-blue-50 text-blue-700",
  screened: "bg-indigo-50 text-indigo-700",
  interview: "bg-purple-50 text-purple-700",
  offer: "bg-amber-50 text-amber-700",
  hired: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-gray-100 text-gray-600",
};

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

// Deterministic soft avatar color from the name.
const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-fuchsia-100 text-fuchsia-700",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < (seed || "").length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const INTERVIEW_TYPES: { value: InterviewType; label: string }[] = [
  { value: "phone" as InterviewType, label: "Phone Screen" },
  { value: "video" as InterviewType, label: "Video Interview" },
  { value: "onsite" as InterviewType, label: "On-site Interview" },
  { value: "assignment" as InterviewType, label: "Assignment" },
  { value: "panel" as InterviewType, label: "Panel Interview" },
];

// #18 — keep `round` and `duration_minutes` as strings so the user can
// clear the field (empty string) without the input snapping back to "0"
// via Number(""). Converted to int in handleSubmit.
interface FormData {
  application_id: string;
  type: string;
  round: string;
  title: string;
  scheduled_at: string;
  scheduled_time: string;
  duration_minutes: string;
  location: string;
  meeting_link: string;
  notes: string;
}

const INITIAL: FormData = {
  application_id: "",
  type: "video",
  round: "1",
  title: "",
  scheduled_at: "",
  scheduled_time: "10:00",
  duration_minutes: "60",
  location: "",
  meeting_link: "",
  notes: "",
};

// Today in YYYY-MM-DD for the date picker min (#17).
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A sensible default interview title based on the picked application.
function defaultTitle(app: { job_title?: string }): string {
  return app.job_title ? `Interview — ${app.job_title}` : "";
}

export function InterviewSchedulePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedAppId = searchParams.get("application_id") || "";

  const [form, setForm] = useState<FormData>({
    ...INITIAL,
    application_id: preselectedAppId,
  });
  // The chosen application (kept in full so the selected card + title
  // autofill work even after the search box is cleared).
  const [selectedApp, setSelectedApp] = useState<ApplicationRow | null>(null);
  // Auto-generate meeting link: which connected provider to use ("" = none).
  const [autoMeeting, setAutoMeeting] = useState("");
  // Panelists assigned at schedule time ({ user_id -> role }).
  const [panelists, setPanelists] = useState<Record<number, string>>({});

  // Assignable org users, for the panelist picker.
  const { data: orgUsersData } = useQuery({
    queryKey: ["org-users", "panelist"],
    queryFn: () => apiGet<OrgUser[]>("/organizations/users"),
  });
  const orgUsers: OrgUser[] = (orgUsersData?.data as any) ?? [];

  // Connected video providers for this org (to offer auto-link generation).
  const { data: meetingConns } = useQuery({
    queryKey: ["meeting-connections"],
    queryFn: () => apiGet<any[]>("/meetings/connections"),
  });
  const connectedProviders: any[] = ((meetingConns as any)?.data || (meetingConns as any) || []).filter(
    (c: any) => c.connected,
  );

  // If we arrived with ?application_id=… (from a candidate's "Schedule" button),
  // fetch that one application so the selected card renders immediately.
  useEffect(() => {
    if (!preselectedAppId || selectedApp) return;
    apiGet<ApplicationRow>(`/applications/${preselectedAppId}`)
      .then((res: any) => {
        const app = res?.data || res;
        if (app?.id) {
          setSelectedApp(app);
          setForm((p) => ({ ...p, application_id: app.id, title: p.title || defaultTitle(app) }));
        }
      })
      .catch(() => {/* ignore — user can search manually */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedAppId]);

  function pickApplication(app: ApplicationRow) {
    setSelectedApp(app);
    setForm((p) => ({ ...p, application_id: app.id, title: p.title || defaultTitle(app) }));
  }
  function clearApplication() {
    setSelectedApp(null);
    setForm((p) => ({ ...p, application_id: "" }));
  }

  const scheduleMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res: any = await apiPost("/interviews", data);
      const interview = res?.data?.data || res?.data || res;
      // If the recruiter chose a video provider, auto-generate the meeting link
      // via the connected Google/Teams/Zoom account (no manual link needed).
      if (autoMeeting && interview?.id) {
        try {
          await apiPost(`/meetings/interviews/${interview.id}/meeting`, { provider: autoMeeting });
        } catch (err: any) {
          // Don't fail the whole schedule — surface a soft warning; the recruiter
          // can still paste a link or retry from the interview.
          toast.error(
            err?.response?.data?.error?.message ||
              `Interview scheduled, but the ${autoMeeting} link couldn't be created. Connect the provider in Settings → Integrations.`,
          );
        }
      }
      return interview;
    },
    onSuccess: () => {
      toast.success("Interview scheduled successfully");
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      navigate("/interviews");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || "Failed to schedule interview";
      toast.error(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.application_id) {
      toast.error("Please select an application");
      return;
    }
    if (!form.scheduled_at) {
      toast.error("Please select a date");
      return;
    }
    if (!form.title) {
      toast.error("Please enter a title");
      return;
    }

    // #17 — no past dates. Backend currently accepts any ISO date so
    // the guard lives here.
    const today = todayIso();
    if (form.scheduled_at < today) {
      toast.error("Interview date cannot be in the past");
      return;
    }

    // #19 — backend requires round and duration_minutes to be non-zero
    // positive integers; `!round` in the route handler rejects 0 with a
    // "Missing required fields" error. Fail fast with a clearer message.
    const round = parseInt(form.round, 10);
    const durationMinutes = parseInt(form.duration_minutes, 10);
    if (!Number.isFinite(round) || round < 1) {
      toast.error("Round must be a positive number");
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15) {
      toast.error("Duration must be at least 15 minutes");
      return;
    }

    // Combine date and time into ISO datetime
    const dateTime = new Date(`${form.scheduled_at}T${form.scheduled_time || "10:00"}:00`);

    const payload: Record<string, any> = {
      application_id: form.application_id,
      type: form.type,
      round,
      title: form.title,
      scheduled_at: dateTime.toISOString(),
      duration_minutes: durationMinutes,
    };

    if (form.location) payload.location = form.location;
    if (form.meeting_link) payload.meeting_link = form.meeting_link;
    if (form.notes) payload.notes = form.notes;

    // Seed panelists at schedule time (POST /interviews accepts panelists[]).
    const panelistList = Object.entries(panelists).map(([userId, role]) => ({
      user_id: Number(userId),
      role,
    }));
    if (panelistList.length) payload.panelists = panelistList;

    scheduleMutation.mutate(payload);
  }

  function togglePanelist(userId: number) {
    setPanelists((prev) => {
      const next = { ...prev };
      if (next[userId]) delete next[userId];
      else next[userId] = "interviewer";
      return next;
    });
  }
  function setPanelistRole(userId: number, role: string) {
    setPanelists((prev) => ({ ...prev, [userId]: role }));
  }

  const saving = scheduleMutation.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Schedule Interview</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Candidate / application selection */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Candidate</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Search a candidate by name, email, or job to schedule their interview.
            </p>
          </div>

          {selectedApp ? (
            <SelectedApplicationCard app={selectedApp} onChange={clearApplication} />
          ) : (
            <ApplicationCombobox onSelect={pickApplication} />
          )}
        </div>

        {/* Interview Details */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Interview Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Technical Interview Round 1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interview Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Round</label>
              {/* #18 — store as string so the user can clear the field
                  with backspace without Number("") snapping back to 0. */}
              <input
                type="number"
                min={1}
                value={form.round}
                onChange={(e) => setForm((p) => ({ ...p, round: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              {/* #17 — can't schedule in the past. */}
              <input
                type="date"
                required
                value={form.scheduled_at}
                min={todayIso()}
                onChange={(e) => setForm((p) => ({ ...p, scheduled_at: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                required
                value={form.scheduled_time}
                onChange={(e) => setForm((p) => ({ ...p, scheduled_time: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
              {/* #18 — same string-state pattern as Round. */}
              <input
                type="number"
                min={15}
                max={480}
                value={form.duration_minutes}
                onChange={(e) => setForm((p) => ({ ...p, duration_minutes: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Location & Meeting */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Location & Meeting Link</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="e.g. Conference Room A, 3rd Floor"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Auto-generate meeting via a connected provider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Video meeting</label>
            {connectedProviders.length > 0 ? (
              <select
                value={autoMeeting}
                onChange={(e) => setAutoMeeting(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">No auto meeting (paste a link below)</option>
                {connectedProviders.map((c: any) => (
                  <option key={c.provider} value={c.provider}>
                    Auto-generate {c.provider === "google" ? "Google Meet" : c.provider === "microsoft" ? "Microsoft Teams" : "Zoom"} link
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Connect Google Meet, Teams, or Zoom in <span className="font-medium">Settings → Integrations</span> to auto-generate a meeting link.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Meeting Link {autoMeeting && <span className="font-normal text-gray-400">(auto-generated on schedule)</span>}
            </label>
            <input
              type="url"
              value={form.meeting_link}
              disabled={!!autoMeeting}
              onChange={(e) => setForm((p) => ({ ...p, meeting_link: e.target.value }))}
              placeholder={autoMeeting ? "Will be created automatically…" : "https://meet.google.com/..."}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              placeholder="Additional notes for the interview..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Panelists (optional at schedule time; can also be added later) */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Panelists <span className="font-normal text-gray-400">(optional)</span></h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Assign interviewers now, or add them later from the interview page. Panelists get the invitation email and can submit feedback.
            </p>
          </div>

          {orgUsers.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">No team members found for your organization.</p>
          ) : (
            <div className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
              {orgUsers.map((u) => {
                const picked = !!panelists[u.id];
                return (
                  <div key={u.id} className={cn("flex items-center gap-3 px-3 py-2.5", picked && "bg-brand-50/50")}>
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() => togglePanelist(u.id)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{userFullName(u)}</p>
                      <p className="truncate text-xs text-gray-500">{u.designation || u.role?.replace(/_/g, " ")}{u.email ? ` · ${u.email}` : ""}</p>
                    </div>
                    {picked && (
                      <select
                        value={panelists[u.id]}
                        onChange={(e) => setPanelistRole(u.id, e.target.value)}
                        className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs capitalize focus:border-brand-500 focus:outline-none"
                      >
                        {PANELIST_ROLES.map((r) => (
                          <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {Object.keys(panelists).length > 0 && (
            <p className="text-xs text-gray-500">{Object.keys(panelists).length} panelist{Object.keys(panelists).length !== 1 ? "s" : ""} selected.</p>
          )}
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
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Schedule Interview
          </button>
        </div>
      </form>
    </div>
  );
}

// ===========================================================================
// SelectedApplicationCard — the compact "chosen candidate" state that replaces
// the search box once an application is picked.
// ===========================================================================
function SelectedApplicationCard({ app, onChange }: { app: ApplicationRow; onChange: () => void }) {
  const stage = String(app.stage || "");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold", avatarColor(app.candidate_name))}>
        {initials(app.candidate_name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-gray-900">{app.candidate_name || "Unknown candidate"}</p>
          {stage && (
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", STAGE_BADGE[stage] || "bg-gray-100 text-gray-600")}>
              {stage}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{app.job_title || "—"}</span>
          {app.candidate_email && <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3.5 w-3.5" />{app.candidate_email}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        Change
      </button>
    </div>
  );
}

// ===========================================================================
// ApplicationCombobox — a real autocomplete: nothing is shown until you type;
// then a dropdown of matches appears with avatars, job, and stage. Keyboard
// navigable (↑/↓/Enter/Esc), debounced, and closes on outside click.
// ===========================================================================
function ApplicationCombobox({ onSelect }: { onSelect: (app: ApplicationRow) => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Debounce the query so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const canSearch = debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["applications-search", debounced],
    queryFn: () =>
      apiGet<PaginatedResponse<ApplicationRow>>("/applications", { page: 1, perPage: 20, search: debounced }),
    enabled: canSearch,
  });

  // Only show candidates who can still be interviewed.
  const results = ((data as any)?.data?.data || []).filter((a: ApplicationRow) =>
    SCHEDULABLE_STAGES.has(String(a.stage)),
  ) as ApplicationRow[];

  useEffect(() => { setActiveIdx(0); }, [debounced, open]);

  function choose(app: ApplicationRow) {
    onSelect(app);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[activeIdx]) choose(results[activeIdx]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  const showDropdown = open && canSearch;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search candidate by name, email, or job…"
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-9 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {isFetching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              <UserRound className="mx-auto mb-1 h-6 w-6 text-gray-300" />
              No matching candidates with an active application.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map((app, idx) => {
                const stage = String(app.stage || "");
                return (
                  <li key={app.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => choose(app)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left",
                        idx === activeIdx ? "bg-brand-50" : "hover:bg-gray-50",
                      )}
                    >
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", avatarColor(app.candidate_name))}>
                        {initials(app.candidate_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-gray-900">{app.candidate_name || "Unknown"}</p>
                          {stage && (
                            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize", STAGE_BADGE[stage] || "bg-gray-100 text-gray-600")}>
                              {stage}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-gray-500">
                          {app.job_title || "—"}{app.candidate_email ? ` · ${app.candidate_email}` : ""}
                        </p>
                      </div>
                      {idx === activeIdx && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Hint line under the search box. */}
      {!showDropdown && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
          <ChevronDown className="h-3.5 w-3.5" />
          {query.length > 0 && query.length < 2 ? "Keep typing…" : "Start typing to find a candidate"}
        </p>
      )}
    </div>
  );
}
