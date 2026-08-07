import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, CircleDollarSign, Clock3, Gift, Pencil, Plus, Search, UserRound, WalletCards, X } from "lucide-react";
import toast from "react-hot-toast";
import { api, apiGet, apiPost } from "@/api/client";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { getUser } from "@/lib/auth-store";
import { canAccessRecruit } from "@/lib/roles";
import { useTranslation } from "react-i18next";
import type { JobPosting, PaginatedResponse } from "@emp-recruit/shared";

interface ReferralRow {
  id: string; job_id: string; referrer_id: number; candidate_id: string; application_id: string | null;
  status: string; relationship: string | null; notes: string | null; bonus_amount: number | null;
  bonus_paid_at: string | null; created_at: string; candidate_name: string; candidate_email: string;
  job_title: string; job_department: string | null; application_stage: string | null;
}
type ReferralStats = { total: number; underReview: number; bonusEligible: number; bonusPaid: number };
const STATUS_OPTIONS = [
  { value: "submitted", labelKey: "referrals.statusSubmitted" }, { value: "under_review", labelKey: "referrals.statusUnderReview" },
  { value: "hired", labelKey: "referrals.statusHired" }, { value: "rejected", labelKey: "referrals.statusRejected" },
  { value: "bonus_eligible", labelKey: "referrals.statusBonusEligible" }, { value: "bonus_paid", labelKey: "referrals.statusBonusPaid" },
];
const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700", under_review: "bg-yellow-100 text-yellow-700", hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700", bonus_eligible: "bg-purple-100 text-purple-700", bonus_paid: "bg-emerald-100 text-emerald-700",
};
const STAGE_COLORS: Record<string, string> = { applied: "text-blue-600", screened: "text-amber-600", interview: "text-purple-600", offer: "text-violet-600", hired: "text-green-600", rejected: "text-red-600" };
const AVATAR_TONES = ["bg-brand-100 text-brand-700", "bg-amber-100 text-amber-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700"];
const REFERRAL_COLUMNS: ExportColumn<ReferralRow>[] = [
  { header: "Candidate", value: (r) => r.candidate_name }, { header: "Email", value: (r) => r.candidate_email },
  { header: "Job", value: (r) => r.job_title }, { header: "Status", value: (r) => r.status },
  { header: "Relationship", value: (r) => r.relationship }, { header: "Bonus Amount", value: (r) => r.bonus_amount },
  { header: "Referred", value: (r) => r.created_at ? formatDate(r.created_at) : "" },
];

export function ReferralListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = getUser();
  const isAdmin = canAccessRecruit(user);
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editingRef, setEditingRef] = useState<ReferralRow | null>(null);
  const [editForm, setEditForm] = useState({ status: "", bonus_amount: "" });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [jobId, setJobId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [debouncedCandidateSearch, setDebouncedCandidateSearch] = useState("");
  const [form, setForm] = useState({ job_id: "", first_name: "", last_name: "", email: "", phone: "", relationship: "", notes: "" });

  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400); return () => clearTimeout(timer); }, [searchInput]);
  useEffect(() => { const timer = setTimeout(() => setDebouncedCandidateSearch(candidateSearch.trim()), 250); return () => clearTimeout(timer); }, [candidateSearch]);
  const jobsQuery = useQuery({ queryKey: ["jobs-for-referral"], queryFn: async () => (await apiGet<PaginatedResponse<JobPosting>>("/jobs", { perPage: 100 })).data?.data ?? [] });
  const allJobs = jobsQuery.data ?? [];
  const openJobs = allJobs.filter((job) => job.status === "open");
  const candidatesQuery = useQuery({ queryKey: ["candidates-for-referral", debouncedCandidateSearch], queryFn: () => apiGet<PaginatedResponse<{ id: string; first_name: string; last_name: string; email: string; phone: string | null }>>("/candidates", { perPage: 10, search: debouncedCandidateSearch }), enabled: showForm && debouncedCandidateSearch.length > 0 });
  const candidateOptions = debouncedCandidateSearch ? candidatesQuery.data?.data?.data ?? [] : [];
  const statsQuery = useQuery({ queryKey: ["referral-stats"], queryFn: async () => (await apiGet<ReferralStats>("/referrals/stats")).data });
  const { rows: referrals, total, isLoading } = usePaginatedList<ReferralRow>(["referrals"], "/referrals", { status, search, job_id: jobId, date_from: dateFrom, date_to: dateTo, sort, order }, page);
  const filtersActive = Boolean(status || search || jobId || dateFrom || dateTo);
  const stats = statsQuery.data;
  const percentage = (value: number) => stats?.total ? `${Math.round((value / stats.total) * 100)}% of total` : t("referrals.noActivity");
  const statCards = [
    { label: t("referrals.totalReferrals"), value: stats?.total ?? total, note: t("referrals.allTime"), icon: UserRound, tone: "bg-purple-600 text-white" },
    { label: t("referrals.underReview"), value: stats?.underReview ?? 0, note: percentage(stats?.underReview ?? 0), icon: Clock3, tone: "bg-amber-500 text-white" },
    { label: t("referrals.bonusEligible"), value: stats?.bonusEligible ?? 0, note: percentage(stats?.bonusEligible ?? 0), icon: Gift, tone: "bg-blue-600 text-white" },
    { label: t("referrals.bonusPaid"), value: stats?.bonusPaid ?? 0, note: percentage(stats?.bonusPaid ?? 0), icon: WalletCards, tone: "bg-emerald-600 text-white" },
  ];

  const submitMutation = useMutation({ mutationFn: (data: typeof form) => apiPost("/referrals", data), onSuccess: () => { toast.success(t("referrals.submitSuccess")); queryClient.invalidateQueries({ queryKey: ["referrals"] }); queryClient.invalidateQueries({ queryKey: ["referral-stats"] }); setShowForm(false); setForm({ job_id: "", first_name: "", last_name: "", email: "", phone: "", relationship: "", notes: "" }); }, onError: (error: any) => toast.error(error.response?.data?.error?.message || t("referrals.submitError")) });
  const updateMutation = useMutation({ mutationFn: (payload: { id: string; status: string; bonus_amount?: number }) => api.patch(`/referrals/${payload.id}/status`, { status: payload.status, ...(payload.bonus_amount !== undefined ? { bonus_amount: payload.bonus_amount } : {}) }), onSuccess: () => { toast.success(t("referrals.updateSuccess")); queryClient.invalidateQueries({ queryKey: ["referrals"] }); queryClient.invalidateQueries({ queryKey: ["referral-stats"] }); setEditingRef(null); }, onError: (error: any) => toast.error(error.response?.data?.error?.message || t("referrals.updateError")) });
  const openEdit = (referral: ReferralRow) => { setEditingRef(referral); setEditForm({ status: referral.status, bonus_amount: referral.bonus_amount != null ? String(referral.bonus_amount / 100) : "" }); };
  const submitEdit = () => { if (!editingRef || !editForm.status) return; const amount = editForm.bonus_amount ? Number(editForm.bonus_amount) : undefined; if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) { toast.error(t("referrals.bonusNegative")); return; } updateMutation.mutate({ id: editingRef.id, status: editForm.status, ...(amount !== undefined ? { bonus_amount: Math.round(amount * 100) } : {}) }); };
  const handleSubmit = (event: React.FormEvent) => { event.preventDefault(); if (!form.job_id || !form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) { toast.error(t("referrals.completeRequired")); return; } submitMutation.mutate(form); };
  const clearFilters = () => { setStatus(""); setJobId(""); setDateFrom(""); setDateTo(""); setSearchInput(""); setSearch(""); setPage(1); };
  const statusLabel = (value: string) => { const option = STATUS_OPTIONS.find((item) => item.value === value); return option ? t(option.labelKey) : value.replace(/_/g, " "); };

  return <div className="space-y-5 pb-4">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold text-gray-900">{t("referrals.title")}</h1><p className="mt-1 text-sm text-gray-500">{t("referrals.subtitle")}</p></div><div className="flex flex-wrap gap-2"><ExportButtons baseName="referrals" title="Referrals" subtitle={`${total} referrals`} columns={REFERRAL_COLUMNS} fetchRows={() => fetchAllRows<ReferralRow>("/referrals", { status, search, job_id: jobId, date_from: dateFrom, date_to: dateTo, sort, order })} /><Button onClick={() => setShowForm((value) => !value)}>{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? t("referrals.cancel") : t("referrals.referSomeone")}</Button></div></div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statCards.map(({ label, value, note, icon: Icon, tone }) => <Card key={label} className="relative overflow-hidden p-4"><div className="flex items-center gap-4"><span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm", tone)}><Icon className="h-5 w-5" /></span><div><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-0.5 text-2xl font-bold text-gray-900">{statsQuery.isLoading ? "—" : value}</p><p className="mt-0.5 text-xs text-gray-400">{note}</p></div></div><Icon className="absolute -bottom-2 -right-2 h-14 w-14 text-gray-100" /></Card>)}</div>

    {showForm && <Card className="p-5"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Plus className="h-5 w-5" /></span><div><h2 className="font-semibold text-gray-900">{t("referrals.submitFormTitle")}</h2><p className="text-xs text-gray-500">{t("referrals.formDescription")}</p></div></div><div className="relative mt-4"><Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder={t("referrals.searchByNameEmail")} className="pl-9" />{candidateOptions.length > 0 && <Card className="absolute z-30 mt-1 max-h-48 w-full overflow-auto p-1">{candidateOptions.map((candidate) => <Button key={candidate.id} type="button" variant="ghost" onClick={() => { setForm((current) => ({ ...current, first_name: candidate.first_name, last_name: candidate.last_name, email: candidate.email, phone: candidate.phone || current.phone })); setCandidateSearch(""); setDebouncedCandidateSearch(""); }} className="h-auto w-full justify-between px-3 py-2 text-left"><span><span className="block text-sm font-medium text-gray-900">{candidate.first_name} {candidate.last_name}</span><span className="block text-xs text-gray-500">{candidate.email}</span></span><span className="text-xs text-brand-600">{t("referrals.use")}</span></Button>)}</Card>}</div><form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Select value={form.job_id || undefined} onValueChange={(value) => setForm((current) => ({ ...current, job_id: value }))}><SelectTrigger><SelectValue placeholder={t("referrals.selectJobPositionOption")} /></SelectTrigger><SelectContent>{openJobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}{job.department ? ` — ${job.department}` : ""}</SelectItem>)}</SelectContent></Select></div><Input required value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} placeholder={t("referrals.firstName")} /><Input required value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} placeholder={t("referrals.lastName")} /><Input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder={t("referrals.email")} /><Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value.replace(/[^\d+\-()\s]/g, "") }))} placeholder={t("referrals.phone")} /><Input value={form.relationship} onChange={(event) => setForm((current) => ({ ...current, relationship: event.target.value }))} placeholder={t("referrals.relationshipPlaceholder")} /><Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder={t("referrals.notes")} /><div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={submitMutation.isPending}>{submitMutation.isPending ? t("referrals.submitting") : t("referrals.submitReferral")}</Button></div></form></Card>}

    <Card className="p-3"><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,2fr)_repeat(2,minmax(160px,1fr))_320px_210px_auto] xl:items-end"><label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t("referrals.searchPlaceholder")} className="pl-9" /></label><Select value={status || "all"} onValueChange={(value) => { setStatus(value === "all" ? "" : value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("referrals.allStatuses")}</SelectItem>{status.includes(",") && <SelectItem value={status}>{status.replace(/,/g, " + ")}</SelectItem>}{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>)}</SelectContent></Select><Select value={jobId || "all"} onValueChange={(value) => { setJobId(value === "all" ? "" : value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("referrals.allJobs")}</SelectItem>{allJobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}</SelectContent></Select><div className="grid grid-cols-2 gap-2"><Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /><Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></div><div className="relative"><ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-500" /><Select value={`${sort}:${order}`} onValueChange={(value) => { const [field, direction] = value.split(":"); setSort(field); setOrder(direction); setPage(1); }}><SelectTrigger className="pl-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="created_at:desc">{t("referrals.sortNewest")}</SelectItem><SelectItem value="created_at:asc">{t("referrals.sortOldest")}</SelectItem><SelectItem value="bonus_amount:desc">{t("referrals.sortBonus")}</SelectItem></SelectContent></Select></div>{filtersActive ? <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4" />{t("referrals.clear")}</Button> : <span />}</div></Card>

    {isLoading ? <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div> : referrals.length === 0 ? <Card className="border-dashed py-14 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Gift className="h-7 w-7" /></span><p className="mt-4 font-semibold text-gray-900">{t("referrals.emptyTitle")}</p><p className="mt-1 text-sm text-gray-500">{filtersActive ? t("referrals.noMatch") : t("referrals.emptyState")}</p>{filtersActive && <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">{t("referrals.clear")}</Button>}</Card> : <Card className="overflow-hidden"><Table><TableHeader className="bg-gray-50"><TableRow className="hover:bg-gray-50">{["colCandidate", "colJob", "referrer", "status", "colBonus", "colDate", "progressStage", "actions"].map((key) => <TableHead key={key}>{t(`referrals.${key}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{referrals.map((referral, index) => <TableRow key={referral.id}><TableCell><Link to={`/candidates/${referral.candidate_id}`} className="flex min-w-[190px] items-center gap-3"><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", AVATAR_TONES[index % AVATAR_TONES.length])}>{getInitials(referral.candidate_name)}</span><span><span className="block font-semibold text-gray-900 hover:text-brand-600">{referral.candidate_name}</span><span className="block text-xs text-gray-500">{referral.candidate_email}</span></span></Link></TableCell><TableCell><Link to={`/jobs/${referral.job_id}`} className="min-w-[170px] font-medium text-gray-700 hover:text-brand-600">{referral.job_title}</Link><span className="block text-xs text-gray-400">{referral.job_department || "—"}</span></TableCell><TableCell className="whitespace-nowrap text-gray-500"><span className="inline-flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold">#{referral.referrer_id}</span>{t("referrals.employeeReferrer")}</span></TableCell><TableCell><Badge className={cn("border-0", STATUS_COLORS[referral.status])}>{statusLabel(referral.status)}</Badge></TableCell><TableCell className="whitespace-nowrap text-gray-500">{referral.bonus_amount ? `INR ${(referral.bonus_amount / 100).toLocaleString()}` : "—"}</TableCell><TableCell className="whitespace-nowrap text-gray-500">{formatDate(referral.created_at)}</TableCell><TableCell className="whitespace-nowrap"><span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", STAGE_COLORS[referral.application_stage || ""] || "text-gray-500")}><span className="h-2 w-2 rounded-full bg-current" />{referral.application_stage ? t(`applications.stages.${referral.application_stage}`) : t("referrals.awaitingApplication")}</span></TableCell><TableCell><div className="flex justify-end gap-1"><Link to={`/candidates/${referral.candidate_id}`}><Button variant="outline" size="sm" className="h-8">{t("referrals.view")}</Button></Link>{isAdmin && <Button variant="ghost" size="icon" onClick={() => openEdit(referral)} className="h-8 w-8" title={t("referrals.updateTitle")}><Pencil className="h-4 w-4" /></Button>}</div></TableCell></TableRow>)}</TableBody></Table><Pagination className="border-t border-gray-200 px-4 py-3" page={page} perPage={DEFAULT_PAGE_SIZE} total={total} onPageChange={setPage} /></Card>}

    {editingRef && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="w-full max-w-md overflow-hidden"><div className="flex items-center justify-between border-b border-gray-200 p-5"><div><h3 className="font-semibold text-gray-900">{t("referrals.modalTitle")}</h3><p className="mt-1 text-xs text-gray-500">{editingRef.candidate_name} · {editingRef.job_title}</p></div><Button variant="ghost" size="icon" onClick={() => setEditingRef(null)}><X className="h-4 w-4" /></Button></div><div className="space-y-4 p-5"><Select value={editForm.status} onValueChange={(value) => setEditForm((current) => ({ ...current, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>)}</SelectContent></Select><div className="relative"><CircleDollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input type="number" min={0} step="0.01" value={editForm.bonus_amount} onChange={(event) => setEditForm((current) => ({ ...current, bonus_amount: event.target.value }))} placeholder={t("referrals.bonusAmountInr")} className="pl-9" /></div></div><div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 p-4"><Button variant="outline" onClick={() => setEditingRef(null)}>{t("referrals.cancel")}</Button><Button onClick={submitEdit} disabled={updateMutation.isPending}>{updateMutation.isPending ? t("referrals.saving") : t("referrals.save")}</Button></div></Card></div>}
  </div>;
}