import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp, Building2, CalendarDays, ChevronRight, Clock3, Grid2X2,
  List, Mail, Plus, Search, Star, TrendingUp, Users, X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
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
import type { Candidate } from "@emp-recruit/shared";
import { cn, formatDate } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";

const CANDIDATE_COLUMNS: ExportColumn<Candidate>[] = [
  { header: "First Name", value: (c) => c.first_name },
  { header: "Last Name", value: (c) => c.last_name },
  { header: "Email", value: (c) => c.email },
  { header: "Current Company", value: (c) => c.current_company },
  { header: "Current Title", value: (c) => c.current_title },
  { header: "Experience (yrs)", value: (c) => c.experience_years },
  { header: "Source", value: (c) => c.source },
  { header: "Added", value: (c) => c.created_at ? formatDate(c.created_at) : "" },
];

const SOURCE_BADGE: Record<string, string> = {
  direct: "bg-gray-100 text-gray-700", referral: "bg-purple-100 text-purple-700",
  linkedin: "bg-blue-100 text-blue-700", indeed: "bg-indigo-100 text-indigo-700",
  naukri: "bg-green-100 text-green-700", other: "bg-gray-100 text-gray-700",
};
const SOURCES = ["direct", "referral", "linkedin", "indeed", "naukri", "other"];
const STAGES = ["applied", "screened", "interview", "offer", "hired", "rejected"];

type CandidateStats = { total: number; newThisWeek: number; interviewing: number; shortlisted: number };

export function CandidateListPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? "1");
  const search = params.get("search") ?? "";
  const source = params.get("source") ?? "";
  const experience = params.get("experience") ?? "";
  const stage = params.get("stage") ?? "";
  const sort = params.get("sort") ?? "created_at";
  const order = params.get("order") ?? "desc";
  const [searchInput, setSearchInput] = useState(search);
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() !== search) setFilter("search", searchInput.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const statsQuery = useQuery({
    queryKey: ["candidate-stats"],
    queryFn: async () => (await apiGet<CandidateStats>("/candidates/stats")).data,
  });
  const { rows: candidates, total, isLoading } = usePaginatedList<Candidate>(
    ["candidates"], "/candidates", { search, source, experience, stage, sort, order }, page,
  );
  const stats = statsQuery.data;
  const filtersActive = Boolean(search || source || experience || stage);
  const allSelected = candidates.length > 0 && candidates.every((candidate) => selected.has(candidate.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(candidates.map((candidate) => candidate.id)));
  const toggleOne = (id: string) => setSelected((current) => {
    const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const clearFilters = () => {
    setSearchInput("");
    const next = new URLSearchParams(params);
    ["search", "source", "experience", "stage", "page"].forEach((key) => next.delete(key));
    setParams(next);
  };

  const statCards = [
    { label: t("candidates.list.totalCandidates"), value: stats?.total ?? total, note: t("candidates.list.allTime"), icon: Users, tone: "bg-brand-600 text-white" },
    { label: t("candidates.list.newThisWeek"), value: stats?.newThisWeek ?? 0, note: t("candidates.list.recentlyAdded"), icon: TrendingUp, tone: "bg-emerald-500 text-white" },
    { label: t("candidates.list.interviewing"), value: stats?.interviewing ?? 0, note: t("candidates.list.inProgress"), icon: CalendarDays, tone: "bg-blue-500 text-white" },
    { label: t("candidates.list.shortlisted"), value: stats?.shortlisted ?? 0, note: t("candidates.list.readyForNextStep"), icon: Star, tone: "bg-amber-500 text-white" },
  ];

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("candidates.list.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("candidates.list.subtitle", { count: stats?.total ?? total })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons baseName="candidates" title="Candidates" subtitle={`${total} candidates`} columns={CANDIDATE_COLUMNS} fetchRows={() => fetchAllRows<Candidate>("/candidates", { search, source, experience, stage })} />
          <Link to="/candidates/new" className={buttonVariants()}><Plus className="h-4 w-4" />{t("candidates.list.addCandidate")}</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, note, icon: Icon, tone }) => (
          <Card key={label} className="relative overflow-hidden p-4">
            <div className="flex items-center gap-4">
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm", tone)}><Icon className="h-5 w-5" /></span>
              <div><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-0.5 text-2xl font-bold text-gray-900">{statsQuery.isLoading ? "—" : value}</p><p className="mt-0.5 text-xs text-gray-400">{note}</p></div>
            </div>
            <Icon className="absolute -bottom-2 -right-2 h-14 w-14 text-gray-100" />
          </Card>
        ))}
      </div>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,2fr)_repeat(3,minmax(145px,1fr))_190px_auto]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t("candidates.list.searchPlaceholder")} className="pl-9" /></label>
          <Select value={source || "all"} onValueChange={(value) => setFilter("source", value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("candidates.list.allSources")}</SelectItem>{SOURCES.map((item) => <SelectItem key={item} value={item}>{enumLabel(t, "source", item)}</SelectItem>)}</SelectContent></Select>
          <Select value={experience || "all"} onValueChange={(value) => setFilter("experience", value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("candidates.list.allExperience")}</SelectItem><SelectItem value="entry">0–2 years</SelectItem><SelectItem value="mid">2–5 years</SelectItem><SelectItem value="senior">5+ years</SelectItem></SelectContent></Select>
          <Select value={stage || "all"} onValueChange={(value) => setFilter("stage", value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("candidates.list.allStages")}</SelectItem>{STAGES.map((item) => <SelectItem key={item} value={item}>{enumLabel(t, "applicationStage", item)}</SelectItem>)}</SelectContent></Select>
          <div className="relative"><ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-500" /><Select value={`${sort}:${order}`} onValueChange={(value) => { const [field, direction] = value.split(":"); const next = new URLSearchParams(params); next.set("sort", field); next.set("order", direction); next.delete("page"); setParams(next); }}><SelectTrigger className="pl-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="created_at:desc">{t("candidates.list.sortRecent")}</SelectItem><SelectItem value="created_at:asc">{t("candidates.list.sortOldest")}</SelectItem><SelectItem value="first_name:asc">{t("candidates.list.sortName")}</SelectItem><SelectItem value="experience_years:desc">{t("candidates.list.sortExperience")}</SelectItem></SelectContent></Select></div>
          <div className="flex overflow-hidden rounded-lg border border-gray-300"><Button variant="ghost" size="icon" onClick={() => setView("list")} aria-label="List view" className={cn("rounded-none", view === "list" && "bg-brand-50 text-brand-600")}><List className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setView("grid")} aria-label="Grid view" className={cn("rounded-none border-l border-gray-300", view === "grid" && "bg-brand-50 text-brand-600")}><Grid2X2 className="h-4 w-4" /></Button></div>
        </div>
        {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2 h-auto px-1 text-xs"><X className="h-3.5 w-3.5" />{t("candidates.list.clearFilters")}</Button>}
      </Card>

      {isLoading ? <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div> : candidates.length === 0 ? (
        <Card className="border-dashed py-14 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Users className="h-7 w-7" /></span><p className="mt-4 font-semibold text-gray-900">{t("candidates.list.emptyTitle")}</p><p className="mt-1 text-sm text-gray-500">{t("candidates.list.emptyDescription")}</p><Link to="/candidates/new" className={cn(buttonVariants({ size: "sm" }), "mt-4")}><Plus className="h-4 w-4" />{t("candidates.list.addCandidate")}</Link></Card>
      ) : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{candidates.map((candidate) => <Card key={candidate.id} className="p-5 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><Link to={`/candidates/${candidate.id}`} className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{candidate.first_name[0]}{candidate.last_name[0]}</span><span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{candidate.first_name} {candidate.last_name}</span><span className="block truncate text-xs text-gray-500">{candidate.current_title || t("candidates.list.noTitle")}</span></span></Link><Badge className={cn("border-0 capitalize", SOURCE_BADGE[candidate.source])}>{enumLabel(t, "source", candidate.source)}</Badge></div><div className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm text-gray-500"><p className="flex items-center gap-2 truncate"><Mail className="h-4 w-4" />{candidate.email}</p><p className="flex items-center gap-2"><Building2 className="h-4 w-4" />{candidate.current_company || "—"}</p><p className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{candidate.experience_years != null ? t("candidates.list.years", { count: Number(candidate.experience_years) }) : "—"}</p></div></Card>)}</div>
      ) : (
        <Card className="overflow-hidden">
          <Table><TableHeader className="bg-gray-50"><TableRow className="hover:bg-gray-50"><TableHead className="w-12"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t("candidates.list.selectAll")} /></TableHead>{["colName", "colEmail", "colCurrentCompany", "colExperience", "colSource", "colAdded", "colActions"].map((key) => <TableHead key={key}>{t(`candidates.list.${key}`)}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{candidates.map((candidate) => <TableRow key={candidate.id}>
            <TableCell><input type="checkbox" checked={selected.has(candidate.id)} onChange={() => toggleOne(candidate.id)} aria-label={`${candidate.first_name} ${candidate.last_name}`} /></TableCell>
            <TableCell><Link to={`/candidates/${candidate.id}`} className="flex min-w-[180px] items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{candidate.first_name[0]}{candidate.last_name[0]}</span><span><span className="block font-semibold text-gray-900 hover:text-brand-600">{candidate.first_name} {candidate.last_name}</span>{candidate.current_title && <span className="block text-xs text-gray-500">{candidate.current_title}</span>}</span></Link></TableCell>
            <TableCell className="whitespace-nowrap text-gray-500"><span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{candidate.email}</span></TableCell>
            <TableCell className="whitespace-nowrap text-gray-500"><span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{candidate.current_company || "—"}</span></TableCell>
            <TableCell className="whitespace-nowrap text-gray-500"><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{candidate.experience_years != null ? t("candidates.list.years", { count: Number(candidate.experience_years) }) : "—"}</span></TableCell>
            <TableCell><Badge className={cn("border-0 capitalize", SOURCE_BADGE[candidate.source] ?? SOURCE_BADGE.other)}>{enumLabel(t, "source", candidate.source)}</Badge></TableCell>
            <TableCell className="whitespace-nowrap text-gray-500"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(candidate.created_at)}</span></TableCell>
            <TableCell><div className="flex justify-end"><Link to={`/candidates/${candidate.id}`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}><ChevronRight className="h-4 w-4" /></Link></div></TableCell>
          </TableRow>)}</TableBody></Table>
          <Pagination className="border-t border-gray-200 px-4 py-3" page={page} perPage={DEFAULT_PAGE_SIZE} total={total} onPageChange={(value) => setFilter("page", String(value))} />
        </Card>
      )}
      {view === "grid" && !isLoading && candidates.length > 0 && <Pagination page={page} perPage={DEFAULT_PAGE_SIZE} total={total} onPageChange={(value) => setFilter("page", String(value))} />}
    </div>
  );
}