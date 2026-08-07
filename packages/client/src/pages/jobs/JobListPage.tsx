import { useEffect, lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus, Search, Briefcase, MapPin, ChevronRight, Upload, PencilLine,
  Archive, CirclePause, FileText, CheckCircle2, ArrowUpDown,
  List, Grid2X2, CircleDot, X,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import type { JobPosting, PaginatedResponse } from "@emp-recruit/shared";
import { cn, formatDate } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BulkImportJobsModal = lazy(() => import("@/components/BulkImportJobsModal").then((m) => ({ default: m.BulkImportJobsModal })));
const BulkUpdateJobsModal = lazy(() => import("@/components/BulkUpdateJobsModal").then((m) => ({ default: m.BulkUpdateJobsModal })));

const range = (min: number | null | undefined, max: number | null | undefined) => min == null && max == null ? "" : `${min ?? ""}–${max ?? ""}`;
const JOB_COLUMNS: ExportColumn<JobPosting>[] = [
  { header: "Title", value: (job) => job.title }, { header: "Department", value: (job) => job.department },
  { header: "Location", value: (job) => job.location }, { header: "Type", value: (job) => job.employment_type },
  { header: "Status", value: (job) => job.status }, { header: "Experience", value: (job) => range(job.experience_min, job.experience_max) },
  { header: "Created", value: (job) => job.created_at ? formatDate(job.created_at) : "" },
];

const STATUSES = ["", "draft", "open", "paused", "closed", "filled"] as const;
const STATUS_META = {
  "": { icon: Briefcase, tone: "border-brand-200 bg-brand-50 text-brand-600" },
  open: { icon: CircleDot, tone: "border-emerald-200 bg-emerald-50 text-emerald-600" },
  draft: { icon: FileText, tone: "border-slate-200 bg-slate-50 text-slate-600" },
  paused: { icon: CirclePause, tone: "border-amber-200 bg-amber-50 text-amber-600" },
  closed: { icon: Archive, tone: "border-gray-200 bg-gray-50 text-gray-500" },
  filled: { icon: CheckCircle2, tone: "border-blue-200 bg-blue-50 text-blue-600" },
} as const;
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", open: "bg-green-100 text-green-700", paused: "bg-yellow-100 text-yellow-700",
  closed: "bg-red-100 text-red-700", filled: "bg-blue-100 text-blue-700",
};

export function JobListPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? "1");
  const search = params.get("search") ?? "";
  const department = params.get("department") ?? "";
  const location = params.get("location") ?? "";
  const jobType = params.get("jobType") ?? "";
  const sort = params.get("sort") ?? "created_at";
  const order = params.get("order") ?? "desc";
  const [searchInput, setSearchInput] = useState(search);
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const queryClient = useQueryClient();

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key);
    if (key !== "page") next.delete("page"); setParams(next);
  }
  useEffect(() => { const timer = setTimeout(() => { if (searchInput.trim() !== search) setFilter("search", searchInput.trim()); }, 400); return () => clearTimeout(timer); }, [searchInput]);

  const counts = useQueries({ queries: STATUSES.map((value) => ({
    queryKey: ["jobs-status-count", value],
    queryFn: async () => (await apiGet<PaginatedResponse<JobPosting>>("/jobs", { status: value || undefined, perPage: 1 })).data?.total ?? 0,
  })) });
  const allJobsQuery = useQuery({
    queryKey: ["jobs-filter-options"],
    queryFn: async () => (await apiGet<PaginatedResponse<JobPosting>>("/jobs", { perPage: 100, sort: "title", order: "asc" })).data?.data ?? [],
  });
  const options = useMemo(() => ({
    departments: [...new Set((allJobsQuery.data ?? []).map((job) => job.department).filter(Boolean))] as string[],
    locations: [...new Set((allJobsQuery.data ?? []).map((job) => job.location).filter(Boolean))] as string[],
    types: [...new Set((allJobsQuery.data ?? []).map((job) => job.employment_type).filter(Boolean))] as string[],
  }), [allJobsQuery.data]);

  const { rows: jobs, total, isLoading } = usePaginatedList<JobPosting>(["jobs"], "/jobs", {
    status, search, department, location, employment_type: jobType, sort, order,
  }, page);
  const filtersActive = Boolean(search || department || location || jobType);
  const allSelected = jobs.length > 0 && jobs.every((job) => selected.has(job.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(jobs.map((job) => job.id)));
  const toggleOne = (id: string) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">{t("jobs.list.title")}</h1><p className="mt-1 text-sm text-gray-500">{t("jobs.list.totalCount", { count: counts[0].data ?? total })}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons baseName="jobs" title="Job Postings" subtitle={`${total} jobs`} columns={JOB_COLUMNS} fetchRows={() => fetchAllRows<JobPosting>("/jobs", { status, search })} />
          <Button variant="outline" onClick={() => setShowBulkImport(true)}><Upload className="h-4 w-4" />{t("jobs.list.bulkImport")}</Button>
          <Button variant="outline" onClick={() => setShowBulkUpdate(true)}><PencilLine className="h-4 w-4" />{t("jobs.list.bulkUpdate")}</Button>
          <Link to="/jobs/new" className={buttonVariants()}><Plus className="h-4 w-4" />{t("jobs.list.createJob")}</Link>
        </div>
      </div>

      {showBulkImport && <Suspense fallback={null}><BulkImportJobsModal open onClose={() => setShowBulkImport(false)} onImported={() => queryClient.invalidateQueries({ queryKey: ["jobs"] })} /></Suspense>}
      {showBulkUpdate && <Suspense fallback={null}><BulkUpdateJobsModal open onClose={() => setShowBulkUpdate(false)} fetchRows={() => fetchAllRows<JobPosting>("/jobs", {})} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["jobs"] })} /></Suspense>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STATUSES.map((value, index) => { const meta = STATUS_META[value]; const Icon = meta.icon; const active = status === value; return (
          <Button key={value || "all"} variant="outline" onClick={() => setFilter("status", value)} className={cn("h-auto justify-start gap-3 rounded-xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md", active && "border-brand-300 ring-1 ring-brand-200")}>
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", meta.tone)}><Icon className="h-5 w-5" /></span>
            <span><span className={cn("block text-xs font-medium", active ? "text-brand-600" : "text-gray-500")}>{t(`jobs.list.tabs.${value || "all"}`)}</span><span className="mt-0.5 block text-xl font-bold text-gray-900">{counts[index].isLoading ? "—" : counts[index].data ?? 0}</span></span>
          </Button>
        ); })}
      </div>

      <div className="flex overflow-x-auto border-b border-gray-200">
        {STATUSES.map((value) => <Button variant="ghost" key={value || "all"} onClick={() => setFilter("status", value)} className={cn("h-auto rounded-none border-b-2 px-5 py-3", status === value ? "border-brand-600 text-brand-600" : "border-transparent")}>{t(`jobs.list.tabs.${value || "all"}`)}</Button>)}
      </div>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_repeat(4,minmax(130px,1fr))_170px_auto]">
          <label className="relative"><Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("jobs.list.searchPlaceholder")} className="pl-9" /></label>
          <Select value={department || "all"} onValueChange={(value) => setFilter("department", value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("jobs.list.allDepartments")}</SelectItem>{options.departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={location || "all"} onValueChange={(value) => setFilter("location", value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("jobs.list.allLocations")}</SelectItem>{options.locations.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={status || "all"} onValueChange={(value) => setFilter("status", value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("jobs.list.allStatuses")}</SelectItem>{STATUSES.slice(1).map((item) => <SelectItem key={item} value={item}>{enumLabel(t, "jobStatus", item)}</SelectItem>)}</SelectContent></Select>
          <Select value={jobType || "all"} onValueChange={(value) => setFilter("jobType", value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("jobs.list.allJobTypes")}</SelectItem>{options.types.map((item) => <SelectItem key={item} value={item}>{enumLabel(t, "employmentType", item)}</SelectItem>)}</SelectContent></Select>
          <div className="relative"><ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-500" /><Select value={`${sort}:${order}`} onValueChange={(value) => { const [field, direction] = value.split(":"); const next = new URLSearchParams(params); next.set("sort", field); next.set("order", direction); next.delete("page"); setParams(next); }}><SelectTrigger className="pl-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="created_at:desc">{t("jobs.list.sortNewest")}</SelectItem><SelectItem value="created_at:asc">{t("jobs.list.sortOldest")}</SelectItem><SelectItem value="title:asc">{t("jobs.list.sortTitle")}</SelectItem></SelectContent></Select></div>
          <div className="flex overflow-hidden rounded-lg border border-gray-300"><Button variant="ghost" size="icon" onClick={() => setView("list")} className={cn("rounded-none", view === "list" && "bg-brand-50 text-brand-600")}><List className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setView("grid")} className={cn("rounded-none border-l border-gray-300", view === "grid" && "bg-brand-50 text-brand-600")}><Grid2X2 className="h-4 w-4" /></Button></div>
        </div>
        {filtersActive && <Button variant="ghost" size="sm" onClick={() => { setSearchInput(""); const next = new URLSearchParams(params); ["search", "department", "location", "jobType", "page"].forEach((key) => next.delete(key)); setParams(next); }} className="mt-2 h-auto px-1 text-xs"><X className="h-3.5 w-3.5" />{t("jobs.list.clearFilters")}</Button>}
      </Card>

      {isLoading ? <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div> : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center"><Briefcase className="mx-auto h-10 w-10 text-gray-400" /><p className="mt-3 font-semibold text-gray-900">{t("jobs.list.emptyTitle")}</p><p className="mt-1 text-sm text-gray-500">{t("jobs.list.emptyDescription")}</p></div>
      ) : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{jobs.map((job) => <Link key={job.id} to={`/jobs/${job.id}`} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex justify-between gap-3"><h3 className="font-semibold text-gray-900">{job.title}</h3><Badge className={cn("h-fit border-0", STATUS_BADGE[job.status])}>{enumLabel(t, "jobStatus", job.status)}</Badge></div><p className="mt-2 text-sm text-gray-500">{job.department || "—"}</p><p className="mt-3 inline-flex items-center gap-1 text-xs text-gray-400"><MapPin className="h-3.5 w-3.5" />{job.location || "—"}</p></Link>)}</div>
      ) : (
        <Card className="overflow-hidden">
          <Table><TableHeader className="bg-gray-50"><TableRow className="hover:bg-gray-50">
            <TableHead className="w-12"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t("jobs.list.selectAll")} /></TableHead>
            {["colTitle", "colDepartment", "colLocation", "colType", "colVisibility", "colStatus", "colCreated", "colActions"].map((key) => <TableHead key={key}>{t(`jobs.list.${key}`)}</TableHead>)}
          </TableRow></TableHeader><TableBody>{jobs.map((job) => <TableRow key={job.id}>
            <TableCell><input type="checkbox" checked={selected.has(job.id)} onChange={() => toggleOne(job.id)} aria-label={t("jobs.list.selectJob", { title: job.title })} /></TableCell>
            <TableCell className="whitespace-nowrap"><Link to={`/jobs/${job.id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-600">{job.title}</Link></TableCell>
            <TableCell className="whitespace-nowrap text-sm text-gray-500">{job.department || "—"}</TableCell>
            <TableCell className="whitespace-nowrap text-sm text-gray-500"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location || "—"}</span></TableCell>
            <TableCell className="whitespace-nowrap text-sm text-gray-500">{enumLabel(t, "employmentType", job.employment_type)} {(job as any).remote_policy && <Badge variant="secondary" className="ml-1 text-[10px]">{enumLabel(t, "remotePolicy", (job as any).remote_policy)}</Badge>}</TableCell>
            <TableCell><Badge className={cn("border-0", (job as any).is_internal ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")}>{(job as any).is_internal ? t("jobs.list.internal") : t("jobs.list.public")}</Badge></TableCell>
            <TableCell><Badge className={cn("border-0", STATUS_BADGE[job.status] ?? "bg-gray-100 text-gray-700")}>{enumLabel(t, "jobStatus", job.status)}</Badge></TableCell>
            <TableCell className="whitespace-nowrap text-sm text-gray-500">{formatDate(job.created_at)}</TableCell>
            <TableCell><div className="flex items-center justify-end gap-2"><Link to={`/jobs/${job.id}`} className="text-gray-400 hover:text-brand-600"><ChevronRight className="h-4 w-4" /></Link></div></TableCell>
          </TableRow>)}</TableBody></Table>
          <Pagination className="border-t border-gray-200 px-4 py-3" page={page} perPage={DEFAULT_PAGE_SIZE} total={total} onPageChange={(value) => setFilter("page", String(value))} />
        </Card>
      )}
      {view === "grid" && !isLoading && jobs.length > 0 && <Pagination page={page} perPage={DEFAULT_PAGE_SIZE} total={total} onPageChange={(value) => setFilter("page", String(value))} />}
    </div>
  );
}