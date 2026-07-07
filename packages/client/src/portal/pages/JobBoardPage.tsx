// ============================================================================
// PUBLIC JOB BOARD — every organization's open roles, searchable.
// ============================================================================

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, MapPin, Briefcase, Building2, Loader2, IndianRupee, ChevronLeft, ChevronRight, Clock, ArrowRight } from "lucide-react";
import { pget } from "../api";

interface Job {
  id: string;
  title: string;
  slug: string;
  department?: string;
  location?: string;
  employment_type?: string;
  experience_min?: number;
  experience_max?: number;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  skills?: string[];
  organization_name?: string;
  published_at?: string;
}

const EMPLOYMENT_TYPES = [
  { value: "", label: "All types" },
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

function fmtSalary(j: Job): string | null {
  if (!j.salary_min && !j.salary_max) return null;
  const sym = j.salary_currency === "INR" ? "₹" : j.salary_currency ? j.salary_currency + " " : "";
  // Compact Indian-style: ≥1L shown as "12L", ≥1k as "50k", else raw.
  const amt = (n?: number) => {
    if (!n) return "";
    if (n >= 100000) return `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return n.toLocaleString("en-IN");
  };
  const lo = amt(j.salary_min);
  const hi = amt(j.salary_max);
  if (lo && hi) return lo === hi ? `${sym}${lo}` : `${sym}${lo} – ${sym}${hi}`;
  return `${sym}${lo || hi}`;
}

function fmtType(t?: string): string {
  return (t || "full_time").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtExp(j: Job): string | null {
  const has = j.experience_min != null || j.experience_max != null;
  if (!has) return null;
  const lo = j.experience_min ?? 0;
  const hi = j.experience_max;
  if (hi == null) return `${lo}+ yrs`;
  if (lo === hi) return `${lo} yr${lo === 1 ? "" : "s"}`;
  return `${lo}–${hi} yrs`;
}

function initials(name?: string): string {
  const parts = (name || "Company").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "C";
}

// Deterministic soft accent color per company so cards feel varied but calm.
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
];
function avatarColor(name?: string): string {
  let h = 0;
  for (const ch of name || "C") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function JobBoardPage() {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["portal-jobs", { search, location, type, page }],
    queryFn: () =>
      pget<any>("/careers/jobs", {
        search: search || undefined,
        location: location || undefined,
        employment_type: type || undefined,
        page,
        per_page: 12,
      }),
  });

  const jobs: Job[] = data?.data || data || [];
  const meta = data?.meta || {};
  const totalPages = meta.totalPages || 1;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Open roles</h1>
        <p className="mt-1 text-gray-500">Browse jobs from every company on EMP Recruit and apply with one account.</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search title, skill, or company"
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <div className="relative sm:w-48">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={location}
            onChange={(e) => { setLocation(e.target.value); setPage(1); }}
            placeholder="Location"
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 sm:w-40"
        >
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-20 text-center">
          <Briefcase className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">No jobs match your search yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((j) => {
              const salary = fmtSalary(j);
              const exp = fmtExp(j);
              const company = j.organization_name || "Company";
              return (
                <Link
                  key={j.id}
                  to={`/jobs-portal/jobs/${j.slug || j.id}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg"
                >
                  {/* Header: avatar + company */}
                  <div className="mb-4 flex items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${avatarColor(company)}`}>
                      {initials(company)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-700">{company}</p>
                      {j.department && <p className="truncate text-xs text-gray-400">{j.department}</p>}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="mb-3 line-clamp-2 text-[17px] font-semibold leading-snug text-gray-900 group-hover:text-brand-700">
                    {j.title}
                  </h3>

                  {/* Meta chips */}
                  <div className="mb-4 flex flex-wrap gap-2">
                    {j.location && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" />{j.location}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                      <Briefcase className="h-3.5 w-3.5 text-gray-400" />{fmtType(j.employment_type)}
                    </span>
                    {exp && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />{exp}
                      </span>
                    )}
                  </div>

                  {/* Salary */}
                  {salary && (
                    <div className="mb-4 inline-flex w-fit items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">
                      <IndianRupee className="h-3.5 w-3.5" />{salary}
                      <span className="text-xs font-normal text-emerald-600/70">/ year</span>
                    </div>
                  )}

                  {/* Skills */}
                  {j.skills && j.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {j.skills.slice(0, 3).map((s) => (
                        <span key={s} className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500">{s}</span>
                      ))}
                      {j.skills.length > 3 && (
                        <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-400">+{j.skills.length - 3} more</span>
                      )}
                    </div>
                  )}

                  {/* Footer: apply affordance appears on hover */}
                  <div className="mt-auto flex items-center justify-between pt-4">
                    {j.published_at && (
                      <span className="text-xs text-gray-400">
                        {new Date(j.published_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                      View & apply <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <span className="px-2 text-sm text-gray-500">
                Page {page} of {totalPages} {isFetching && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
