import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, MapPin, Briefcase, Search, Users, Calendar, ChevronLeft,
  ChevronRight, X, Bookmark, Grid2X2, SlidersHorizontal,
  Headphones, GraduationCap, Database, UserRoundSearch,
} from "lucide-react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";
import type { JobPosting, CareerPage } from "@emp-recruit/shared";

const PUBLIC_API = "/api/v1/public";
const PER_PAGE = 10;

interface PublicJobsResponse {
  data: (JobPosting & { applicant_count: number })[];
  total: number;
  page: number;
  perPage: number;
  departments: string[];
  locations: string[];
}

const JOB_VISUALS = [
  { icon: UserRoundSearch, surface: "bg-violet-50 text-violet-600" },
  { icon: Headphones, surface: "bg-blue-50 text-blue-600" },
  { icon: GraduationCap, surface: "bg-emerald-50 text-emerald-600" },
  { icon: Database, surface: "bg-orange-50 text-orange-600" },
] as const;

function jobVisual(title: string) {
  const value = title.toLowerCase();
  if (value.includes("support")) return JOB_VISUALS[1];
  if (value.includes("intern")) return JOB_VISUALS[2];
  if (value.includes("data")) return JOB_VISUALS[3];
  return JOB_VISUALS[0];
}

function salaryLabel(job: JobPosting): string | null {
  if (!job.salary_min && !job.salary_max) return null;
  const compact = (value: number) => value >= 100000 ? `${(value / 100000).toFixed(1)}L` : value.toLocaleString();
  const min = job.salary_min ? compact(Number(job.salary_min)) : "";
  const max = job.salary_max ? compact(Number(job.salary_max)) : "";
  return `${job.salary_currency || ""} ${min}${min && max ? " – " : ""}${max}`.trim();
}

export function CareerListPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`career-saved-${slug}`) || "[]")); }
    catch { return new Set(); }
  });

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const careerQuery = useQuery({
    queryKey: ["public-career", slug],
    queryFn: async () => (await axios.get(`${PUBLIC_API}/careers/${slug}`)).data.data as {
      careerPage: CareerPage; orgName: string; orgLogo: string | null;
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["public-jobs", slug, { search, department, location, sort, page }],
    queryFn: async () => (await axios.get(`${PUBLIC_API}/careers/${slug}/jobs`, {
      params: { page, perPage: PER_PAGE, search: search || undefined, department: department || undefined, location: location || undefined, sort },
    })).data.data as PublicJobsResponse,
    placeholderData: (previous) => previous,
  });

  const jobs = jobsQuery.data?.data ?? [];

  if (careerQuery.isLoading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></div>;
  if (careerQuery.isError) return <div className="flex min-h-[70vh] flex-col items-center justify-center text-center"><Briefcase className="h-12 w-12 text-gray-300" /><h2 className="mt-4 text-xl font-semibold text-gray-900">{t("careers.list.notFoundTitle")}</h2><p className="mt-1 text-sm text-gray-500">{t("careers.list.notFoundDesc")}</p></div>;

  const career = careerQuery.data!;
  const result = jobsQuery.data;
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (result?.perPage ?? PER_PAGE)));
  const brand = career.careerPage.primary_color || "#4F46E5";
  const filtersActive = Boolean(search || department || location);
  const description = (career.careerPage.description || "").replace(/<[^>]+>/g, "").trim()
    || t("careers.list.explorePositions", { orgName: career.orgName });

  function clearFilters() { setSearchInput(""); setSearch(""); setDepartment(""); setLocation(""); setPage(1); }
  function toggleSaved(id: string) {
    setSavedJobs((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(`career-saved-${slug}`, JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-[#fbfcff] text-gray-900">
      <section className="relative overflow-hidden border-b border-indigo-50 bg-gradient-to-b from-indigo-50/80 via-white to-white px-4 pb-24 pt-7 text-center sm:pt-10">
        <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="absolute right-[8%] top-16 grid grid-cols-4 gap-2 opacity-30" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, i) => <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: brand }} />)}
        </div>
        <div className="relative mx-auto max-w-4xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-600 shadow-sm backdrop-blur">
            <Users className="h-3.5 w-3.5" /> {t("careers.list.mission")}
          </span>
          {career.orgLogo && <img src={career.orgLogo} alt="" className="mx-auto mt-5 h-10 w-auto" />}
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-gray-950 sm:text-5xl">
            {t("careers.list.careersAt", { orgName: career.orgName })}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600">{description}</p>
        </div>
      </section>

      <main className="relative mx-auto -mt-14 max-w-5xl px-4 pb-16">
        <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_12px_35px_rgba(30,41,59,0.10)] md:grid-cols-[minmax(260px,1fr)_180px_160px_150px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("careers.list.searchPlaceholder")} className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </label>
          <label className="relative">
            <Grid2X2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
            <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white pl-9 pr-8 text-sm outline-none focus:border-brand-500">
              <option value="">{t("careers.list.allDepartments")}</option>{(result?.departments ?? []).map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
            <select value={location} onChange={(e) => { setLocation(e.target.value); setPage(1); }} className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white pl-9 pr-8 text-sm outline-none focus:border-brand-500">
              <option value="">{t("careers.list.allLocations")}</option>{(result?.locations ?? []).map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
            <select value={sort} onChange={(e) => { setSort(e.target.value as "newest" | "oldest"); setPage(1); }} className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white pl-9 pr-8 text-sm font-medium outline-none focus:border-brand-500">
              <option value="newest">{t("careers.list.sortNewest")}</option><option value="oldest">{t("careers.list.sortOldest")}</option>
            </select>
          </label>
          {filtersActive && <button onClick={clearFilters} className="inline-flex items-center justify-center gap-1 text-xs font-medium text-gray-500 hover:text-brand-600 md:col-span-4 md:justify-self-end"><X className="h-3.5 w-3.5" />{t("careers.list.clear")}</button>}
        </div>

        <div className="mt-6 flex items-center gap-2 text-sm text-gray-600"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand }} /><span className="font-semibold" style={{ color: brand }}>{total}</span>{t("careers.list.openPositionsLabel")}</div>

        {jobsQuery.isLoading && !result ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div> : jobs.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white p-14 text-center"><Briefcase className="mx-auto h-11 w-11 text-gray-300" /><h3 className="mt-4 font-semibold">{filtersActive ? t("careers.list.noMatchingTitle") : t("careers.list.noOpenTitle")}</h3><p className="mt-1 text-sm text-gray-500">{filtersActive ? t("careers.list.noMatchingDesc") : t("careers.list.noOpenDesc")}</p></div>
        ) : (
          <div className="mt-3 space-y-3">
            {jobs.map((job) => {
              const visual = jobVisual(job.title); const Icon = visual.icon; const salary = salaryLabel(job);
              return (
                <article key={job.id} className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl p-3 ${visual.surface}`}><Icon className="h-6 w-6" /></span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/careers/${slug}/jobs/${job.id}`} className="text-base font-bold text-gray-900 hover:text-brand-600">{job.title}</Link>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                        {job.department && <span className="rounded-md bg-violet-50 px-2.5 py-1 font-medium text-violet-600">{job.department}</span>}
                        <span className="rounded-md bg-blue-50 px-2.5 py-1 font-medium text-blue-600">{enumLabel(t, "employmentType", job.employment_type)}</span>
                        {(job.experience_min != null || job.experience_max != null) && <span className="rounded-md bg-gray-100 px-2.5 py-1 font-medium text-gray-500">{t("careers.list.experienceYears", { min: job.experience_min ?? 0, max: job.experience_max ?? "10+" })}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t("careers.list.applicants", { count: job.applicant_count })}</span>
                        {job.published_at && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{t("careers.list.posted", { date: formatDate(job.published_at) })}</span>}
                      </div>
                    </div>
                    {salary && <p className="shrink-0 text-sm font-semibold text-emerald-600">{salary}</p>}
                    <Link to={`/careers/${slug}/jobs/${job.id}/apply`} className="inline-flex h-10 min-w-24 items-center justify-center rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110" style={{ backgroundColor: brand }}>{t("careers.list.apply")}</Link>
                    <button onClick={() => toggleSaved(job.id)} className="rounded-lg p-2 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600" aria-label={t("careers.list.saveJob")}>
                      <Bookmark className={`h-5 w-5 ${savedJobs.has(job.id) ? "fill-current" : ""}`} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {totalPages > 1 && <div className="mt-6 flex items-center justify-between"><button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"><ChevronLeft className="h-4 w-4" />{t("careers.list.previous")}</button><span className="text-sm text-gray-500">{t("careers.list.pageOf", { page, total: totalPages })}</span><button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">{t("careers.list.next")}<ChevronRight className="h-4 w-4" /></button></div>}
      </main>
    </div>
  );
}