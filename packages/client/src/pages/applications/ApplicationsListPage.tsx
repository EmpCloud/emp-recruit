import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp, CalendarDays, ChevronDown, CircleX, FileText, Grid2X2,
  List, Search, Sparkles, TimerReset, UsersRound, X,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PaginatedResponse, JobPosting } from "@emp-recruit/shared";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const STAGES = ["applied", "screened", "interview", "offer", "hired", "rejected", "withdrawn"];
const STAGE_BADGE: Record<string, string> = {
  applied: "bg-blue-100 text-blue-700", screened: "bg-purple-100 text-purple-700",
  interview: "bg-orange-100 text-orange-700", offer: "bg-amber-100 text-amber-700",
  hired: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-700",
};
const AVATAR_TONES = ["bg-brand-100 text-brand-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-orange-100 text-orange-700"];

interface AppRow {
  id: string;
  candidate_id: string;
  candidate_first_name: string;
  candidate_last_name: string;
  candidate_email: string;
  job_id: string;
  job_title: string;
  job_department: string | null;
  stage: string;
  source: string;
  rating: number | null;
  applied_at: string;
}
type ApplicationStats = { total: number; newThisWeek: number; inReview: number; interviewing: number; rejected: number };

const APPLICATION_COLUMNS: ExportColumn<AppRow>[] = [
  { header: "Candidate", value: (a) => `${a.candidate_first_name} ${a.candidate_last_name}`.trim() },
  { header: "Email", value: (a) => a.candidate_email }, { header: "Job", value: (a) => a.job_title },
  { header: "Department", value: (a) => a.job_department }, { header: "Stage", value: (a) => a.stage },
  { header: "Source", value: (a) => a.source }, { header: "Rating", value: (a) => a.rating },
  { header: "Applied", value: (a) => a.applied_at ? formatDate(a.applied_at) : "" },
];

export function ApplicationsListPage() {
  const { t } = useTranslation();
  const [stage, setStage] = useState("");
  const [jobId, setJobId] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("applied_at");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400); return () => clearTimeout(timer); }, [searchInput]);
  const { data: jobsData } = useQuery({ queryKey: ["jobs-for-app-filter"], queryFn: () => apiGet<PaginatedResponse<JobPosting>>("/jobs", { perPage: 100 }) });
  const statsQuery = useQuery({ queryKey: ["application-stats"], queryFn: async () => (await apiGet<ApplicationStats>("/applications/stats")).data });
  const jobs = jobsData?.data?.data ?? [];
  const departments = useMemo(() => Array.from(new Set(jobs.map((job) => job.department).filter(Boolean))).sort() as string[], [jobs]);
  const locations = useMemo(() => Array.from(new Set(jobs.map((job) => job.location).filter(Boolean))).sort() as string[], [jobs]);
  const { rows, total, isLoading } = usePaginatedList<AppRow>(["applications"], "/applications", { sort, order, stage, job_id: jobId, department, location, date_from: dateFrom, date_to: dateTo, search }, page);
  const filtersActive = Boolean(stage || jobId || department || location || dateFrom || dateTo || search);
  const setFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };
  const clearFilters = () => { setStage(""); setJobId(""); setDepartment(""); setLocation(""); setDateFrom(""); setDateTo(""); setSearchInput(""); setSearch(""); setPage(1); };
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  const toggleOne = (id: string) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const stats = statsQuery.data;
  const percentage = (value: number) => stats?.total ? `${Math.round((value / stats.total) * 100)}% of total` : t("applications.noActivity");
  const statCards = [
    { label: t("applications.totalApplications"), value: stats?.total ?? total, note: t("applications.allTime"), icon: FileText, tone: "bg-brand-600 text-white" },
    { label: t("applications.newThisWeek"), value: stats?.newThisWeek ?? 0, note: t("applications.lastSevenDays"), icon: Sparkles, tone: "bg-blue-500 text-white" },
    { label: t("applications.inReview"), value: stats?.inReview ?? 0, note: percentage(stats?.inReview ?? 0), icon: TimerReset, tone: "bg-purple-500 text-white" },
    { label: t("applications.interviewing"), value: stats?.interviewing ?? 0, note: percentage(stats?.interviewing ?? 0), icon: UsersRound, tone: "bg-cyan-600 text-white" },
    { label: t("applications.rejected"), value: stats?.rejected ?? 0, note: percentage(stats?.rejected ?? 0), icon: CircleX, tone: "bg-rose-500 text-white" },
  ];

  const exportParams = { sort, order, stage, job_id: jobId, department, location, date_from: dateFrom, date_to: dateTo, search };

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold text-gray-900">{t("applications.title")}</h1><p className="mt-1 text-sm text-gray-500">{t("applications.subtitle")}</p></div><ExportButtons baseName="applications" title="Applications" subtitle={`${total} applications${filtersActive ? " (filtered)" : ""}`} columns={APPLICATION_COLUMNS} fetchRows={() => fetchAllRows<AppRow>("/applications", exportParams)} /></div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{statCards.map(({ label, value, note, icon: Icon, tone }) => <Card key={label} className="relative overflow-hidden p-4"><div className="flex items-center gap-3"><span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm", tone)}><Icon className="h-5 w-5" /></span><div><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-0.5 text-2xl font-bold text-gray-900">{statsQuery.isLoading ? "—" : value}</p><p className="mt-0.5 text-xs text-gray-400">{note}</p></div></div><Icon className="absolute -bottom-2 -right-2 h-12 w-12 text-gray-100" /></Card>)}</div>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,2fr)_repeat(4,minmax(140px,1fr))]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t("applications.searchPlaceholder")} className="pl-9" /></label>
          <Select value={jobId || "all"} onValueChange={(value) => setFilter(setJobId)(value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("applications.allJobs")}</SelectItem>{jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}</SelectContent></Select>
          <Select value={department || "all"} onValueChange={(value) => setFilter(setDepartment)(value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("applications.allDepartments")}</SelectItem>{departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={location || "all"} onValueChange={(value) => setFilter(setLocation)(value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("applications.allLocations")}</SelectItem>{locations.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={stage || "all"} onValueChange={(value) => setFilter(setStage)(value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("applications.allStages")}</SelectItem>{STAGES.map((item) => <SelectItem key={item} value={item}>{t(`applications.stages.${item}`)}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-[180px_180px_220px_1fr_auto_auto] xl:items-end">
          <label><span className="mb-1 block text-xs font-medium text-gray-500">{t("applications.appliedFrom")}</span><Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setFilter(setDateFrom)(event.target.value)} /></label>
          <label><span className="mb-1 block text-xs font-medium text-gray-500">{t("applications.appliedTo")}</span><Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setFilter(setDateTo)(event.target.value)} /></label>
          <div className="relative"><ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-500" /><Select value={`${sort}:${order}`} onValueChange={(value) => { const [field, direction] = value.split(":"); setSort(field); setOrder(direction); setPage(1); }}><SelectTrigger className="pl-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="applied_at:desc">{t("applications.sortRecent")}</SelectItem><SelectItem value="applied_at:asc">{t("applications.sortOldest")}</SelectItem><SelectItem value="rating:desc">{t("applications.sortRating")}</SelectItem></SelectContent></Select></div>
          <div />
          {filtersActive ? <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4" />{t("applications.clear")}</Button> : <span />}
          <div className="flex overflow-hidden rounded-lg border border-gray-300"><Button variant="ghost" size="icon" onClick={() => setView("list")} aria-label="List view" className={cn("rounded-none", view === "list" && "bg-brand-50 text-brand-600")}><List className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setView("grid")} aria-label="Grid view" className={cn("rounded-none border-l border-gray-300", view === "grid" && "bg-brand-50 text-brand-600")}><Grid2X2 className="h-4 w-4" /></Button></div>
        </div>
      </Card>

      {isLoading ? <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div> : rows.length === 0 ? <Card className="border-dashed py-14 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><FileText className="h-7 w-7" /></span><p className="mt-4 font-semibold text-gray-900">{t("applications.emptyTitle")}</p><p className="mt-1 text-sm text-gray-500">{filtersActive ? t("applications.emptyFiltered") : t("applications.noApplications")}</p>{filtersActive && <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4"><X className="h-4 w-4" />{t("applications.clear")}</Button>}</Card> : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((app, index) => <Card key={app.id} className="p-5 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><Link to={`/candidates/${app.candidate_id}`} className="flex min-w-0 items-center gap-3"><span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold", AVATAR_TONES[index % AVATAR_TONES.length])}>{getInitials(`${app.candidate_first_name} ${app.candidate_last_name}`)}</span><span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{app.candidate_first_name} {app.candidate_last_name}</span><span className="block truncate text-xs text-gray-500">{app.candidate_email}</span></span></Link><Badge className={cn("border-0", STAGE_BADGE[app.stage])}>{t(`applications.stages.${app.stage}`)}</Badge></div><div className="mt-4 border-t border-gray-100 pt-4"><p className="font-medium text-gray-900">{app.job_title}</p><p className="mt-1 text-xs text-gray-500">{app.job_department || "—"}</p><p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400"><CalendarDays className="h-3.5 w-3.5" />{formatDate(app.applied_at)}</p></div></Card>)}</div>
      ) : <Card className="overflow-hidden"><Table><TableHeader className="bg-gray-50"><TableRow className="hover:bg-gray-50"><TableHead className="w-12"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t("applications.selectAll")} /></TableHead>{["candidate", "role", "department", "stageLabel", "source", "rating", "appliedDate", "actions"].map((key) => <TableHead key={key}>{t(`applications.${key}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((app, index) => <TableRow key={app.id}><TableCell><input type="checkbox" checked={selected.has(app.id)} onChange={() => toggleOne(app.id)} aria-label={`${app.candidate_first_name} ${app.candidate_last_name}`} /></TableCell><TableCell><Link to={`/candidates/${app.candidate_id}`} className="flex min-w-[190px] items-center gap-3"><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", AVATAR_TONES[index % AVATAR_TONES.length])}>{getInitials(`${app.candidate_first_name} ${app.candidate_last_name}`)}</span><span><span className="block font-semibold text-gray-900 hover:text-brand-600">{app.candidate_first_name} {app.candidate_last_name}</span><span className="block text-xs text-gray-500">{app.candidate_email}</span></span></Link></TableCell><TableCell className="min-w-[180px] font-medium text-gray-700">{app.job_title}</TableCell><TableCell className="whitespace-nowrap text-gray-500">{app.job_department || "—"}</TableCell><TableCell><Badge className={cn("border-0", STAGE_BADGE[app.stage] ?? STAGE_BADGE.withdrawn)}><span className="mr-1 h-1.5 w-1.5 rounded-full bg-current" />{t(`applications.stages.${app.stage}`)}</Badge></TableCell><TableCell><Badge variant="secondary" className="capitalize">{app.source || "—"}</Badge></TableCell><TableCell className="whitespace-nowrap text-gray-500">{app.rating ? `${app.rating}/5` : "—"}</TableCell><TableCell className="whitespace-nowrap text-gray-500">{formatDate(app.applied_at)}</TableCell><TableCell><div className="flex justify-end gap-1"><Link to={`/candidates/${app.candidate_id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}>{t("applications.view")}<ChevronDown className="h-3.5 w-3.5" /></Link></div></TableCell></TableRow>)}</TableBody></Table><Pagination className="border-t border-gray-200 px-4 py-3" page={page} perPage={DEFAULT_PAGE_SIZE} total={total} onPageChange={setPage} /></Card>}
      {view === "grid" && !isLoading && rows.length > 0 && <Pagination page={page} perPage={DEFAULT_PAGE_SIZE} total={total} onPageChange={setPage} />}
    </div>
  );
}