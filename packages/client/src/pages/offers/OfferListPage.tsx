import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Eye, FileText, Plus, Search, Send, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Offer, PaginatedResponse } from "@emp-recruit/shared";
import { apiGet } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import { cn, formatCurrency as formatCurrencyShared, formatDate } from "@/lib/utils";

type EnrichedOffer = Offer & { candidate_name: string; job_title_display: string; department?: string };
type StatusConfig = { labelKey: string; className: string; icon: typeof Clock };

const STATUS_TABS = [
  { labelKey: "offers.status.all", value: "all" }, { labelKey: "offers.status.draft", value: "draft" },
  { labelKey: "offers.status.pendingApproval", value: "pending_approval" }, { labelKey: "offers.status.approved", value: "approved" },
  { labelKey: "offers.status.sent", value: "sent" }, { labelKey: "offers.status.accepted", value: "accepted" },
  { labelKey: "offers.status.declined", value: "declined" }, { labelKey: "offers.status.revoked", value: "revoked" },
] as const;
const STATUS_CONFIG: Record<string, StatusConfig> = {
  draft: { labelKey: "offers.status.draft", className: "bg-gray-100 text-gray-700", icon: FileText },
  pending_approval: { labelKey: "offers.status.pendingApproval", className: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { labelKey: "offers.status.approved", className: "bg-blue-50 text-blue-700", icon: CheckCircle2 },
  sent: { labelKey: "offers.status.sent", className: "bg-purple-50 text-purple-700", icon: Send },
  accepted: { labelKey: "offers.status.accepted", className: "bg-green-50 text-green-700", icon: CheckCircle2 },
  declined: { labelKey: "offers.status.declined", className: "bg-red-50 text-red-700", icon: XCircle },
  expired: { labelKey: "offers.status.expired", className: "bg-gray-100 text-gray-600", icon: AlertCircle },
  revoked: { labelKey: "offers.status.revoked", className: "bg-red-50 text-red-700", icon: XCircle },
};
const SUMMARY = [
  { status: "all", label: "Total Offers", helper: "Across all time", icon: FileText, tone: "text-violet-600 bg-violet-100", gradient: "from-violet-100/90 via-white to-violet-50 dark:from-violet-950/60 dark:via-slate-900 dark:to-violet-950/20" },
  { status: "pending_approval", label: "Pending Approval", helper: "Needs attention", icon: Clock, tone: "text-amber-600 bg-amber-100", gradient: "from-amber-100/90 via-white to-amber-50 dark:from-amber-950/60 dark:via-slate-900 dark:to-amber-950/20" },
  { status: "sent", label: "Sent", helper: "Awaiting response", icon: Send, tone: "text-blue-600 bg-blue-100", gradient: "from-blue-100/90 via-white to-blue-50 dark:from-blue-950/60 dark:via-slate-900 dark:to-blue-950/20" },
  { status: "accepted", label: "Accepted", helper: "Successful offers", icon: CheckCircle2, tone: "text-green-600 bg-green-100", gradient: "from-green-100/90 via-white to-green-50 dark:from-green-950/60 dark:via-slate-900 dark:to-green-950/20" },
  { status: "declined", label: "Declined", helper: "Not accepted", icon: XCircle, tone: "text-red-600 bg-red-100", gradient: "from-red-100/90 via-white to-red-50 dark:from-red-950/60 dark:via-slate-900 dark:to-red-950/20" },
] as const;
const OFFER_COLUMNS: ExportColumn<EnrichedOffer>[] = [
  { header: "Candidate", value: (offer) => offer.candidate_name }, { header: "Job", value: (offer) => offer.job_title_display },
  { header: "Department", value: (offer) => offer.department ?? "" },
  { header: "Salary", value: (offer) => formatCurrency(offer.salary_amount, offer.salary_currency) },
  { header: "Status", value: (offer) => offer.status }, { header: "Created", value: (offer) => formatDate(offer.created_at) },
];
function formatCurrency(amount: number, currency: string) { return formatCurrencyShared(amount / 100, currency || "INR"); }

export function OfferListPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("all"), [page, setPage] = useState(1), [searchInput, setSearchInput] = useState(""), [search, setSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400); return () => clearTimeout(timer); }, [searchInput]);
  const { rows: offers, total, isLoading } = usePaginatedList<EnrichedOffer>(["offers"], "/offers", { status: activeTab !== "all" ? activeTab : "", search }, page);
  const countQueries = useQueries({ queries: STATUS_TABS.map((tab) => ({ queryKey: ["offer-count", tab.value], queryFn: async () => { const response = await apiGet<PaginatedResponse<EnrichedOffer>>("/offers", { status: tab.value === "all" ? undefined : tab.value, page: 1, limit: 1 }); return response.data?.total ?? 0; }, staleTime: 30_000 })) });
  const counts = Object.fromEntries(STATUS_TABS.map((tab, index) => [tab.value, countQueries[index]?.data ?? 0]));
  const selectStatus = (value: string) => { setActiveTab(value); setPage(1); };
  return <div className="space-y-5 pb-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h1 className="text-2xl font-bold text-gray-900">{t("offers.list.title")}</h1><p className="mt-1 text-sm text-gray-500">{t("offers.list.subtitle")}</p></div><div className="flex flex-wrap items-center gap-2"><ExportButtons baseName="offers" title="Offers" subtitle={`${total} offers`} columns={OFFER_COLUMNS} fetchRows={() => fetchAllRows<EnrichedOffer>("/offers", { status: activeTab !== "all" ? activeTab : "", search })} /><Link to="/offers/letter-templates" className={buttonVariants({ variant: "outline" })}><FileText className="h-4 w-4" />{t("offers.template.title")}</Link><Link to="/offers/new" className={buttonVariants()}><Plus className="h-4 w-4" />{t("offers.list.newOffer")}</Link></div></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">{SUMMARY.map(({ status, label, helper, icon: Icon, tone, gradient }) => <Card key={status} className={cn("cursor-pointer overflow-hidden bg-gradient-to-br transition hover:-translate-y-0.5 hover:shadow-md", gradient, activeTab === status && "ring-2 ring-brand-500")} onClick={() => selectStatus(status)}><CardContent className=" p-4"><div className="flex items-center gap-3"><span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tone)}><Icon className="h-5 w-5" /></span><div><p className="text-sm font-medium text-gray-600">{label}</p>{countQueries[STATUS_TABS.findIndex((tab) => tab.value === status)]?.isLoading ? <Skeleton className="mt-1 h-7 w-10" /> : <p className="text-2xl font-bold text-gray-900">{counts[status]}</p>}</div></div><p className="mt-4 text-xs text-gray-500">{helper}</p></CardContent></Card>)}</div>

    <Card className="bg-gradient-to-br from-brand-50/35 via-white to-blue-50/30 dark:from-slate-800 dark:via-slate-900 dark:to-brand-950/20"><CardContent className=" p-3"><div className="flex flex-col gap-3 lg:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input className="pl-9" placeholder={t("offers.list.searchPlaceholder")} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div><Select value={activeTab} onValueChange={selectStatus}><SelectTrigger className="lg:w-56"><SelectValue /></SelectTrigger><SelectContent>{STATUS_TABS.map((tab) => <SelectItem key={tab.value} value={tab.value}>{t(tab.labelKey)}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>

    <div className="overflow-x-auto border-b border-gray-200"><div className="flex min-w-max gap-6">{STATUS_TABS.map((tab) => <button key={tab.value} onClick={() => selectStatus(tab.value)} className={cn("flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium", activeTab === tab.value ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-900")}>{t(tab.labelKey)}<Badge variant="secondary" className="min-w-6 justify-center px-1.5">{counts[tab.value]}</Badge></button>)}</div></div>

    {isLoading ? <Card className="bg-gradient-to-br from-brand-50/35 via-white to-blue-50/30 dark:from-slate-800 dark:via-slate-900 dark:to-brand-950/20"><CardContent className=" space-y-3 p-5">{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-11 w-full" />)}</CardContent></Card> : offers.length === 0 ? <Card className="bg-gradient-to-br from-brand-50/35 via-white to-blue-50/30 dark:from-slate-800 dark:via-slate-900 dark:to-brand-950/20  border-dashed"><CardContent className=" flex min-h-64 flex-col items-center justify-center text-center"><span className="rounded-full bg-brand-50 p-4"><FileText className="h-8 w-8 text-brand-600" /></span><h3 className="mt-4 font-semibold text-gray-900">{t("offers.list.noOffersFound")}</h3><p className="mt-1 text-sm text-gray-500">{search ? t("offers.list.noSearchMatch") : t("offers.list.noStatusOffers", { status: activeTab.replace("_", " ") })}</p></CardContent></Card> : <Card className="bg-gradient-to-br from-brand-50/35 via-white to-blue-50/30 dark:from-slate-800 dark:via-slate-900 dark:to-brand-950/20  overflow-hidden"><Table><TableHeader className="bg-gray-50"><TableRow><TableHead>Candidate</TableHead><TableHead>Job / Designation</TableHead><TableHead>Salary</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{offers.map((offer, index) => <TableRow key={offer.id}><TableCell><Link to={`/offers/${offer.id}`} className="flex items-center gap-3 font-medium text-gray-900 hover:text-brand-600"><span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold", index % 3 === 0 ? "bg-violet-100 text-violet-700" : index % 3 === 1 ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700")}>{offer.candidate_name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>{offer.candidate_name}</Link></TableCell><TableCell><p className="font-medium text-gray-900">{offer.job_title_display}</p>{offer.department && <p className="text-xs text-gray-500">{offer.department}</p>}</TableCell><TableCell className="font-semibold text-gray-900">{formatCurrency(offer.salary_amount, offer.salary_currency)}</TableCell><TableCell><OfferStatus status={offer.status} t={t} /></TableCell><TableCell className="text-gray-500">{formatDate(offer.created_at)}</TableCell><TableCell className="text-right"><Link to={`/offers/${offer.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}><Eye className="h-3.5 w-3.5" />View</Link></TableCell></TableRow>)}</TableBody></Table><div className="border-t border-gray-200 px-5 py-3"><Pagination page={page} perPage={DEFAULT_PAGE_SIZE} total={total} onPageChange={setPage} /></div></Card>}
  </div>;
}
function OfferStatus({ status, t }: { status: string; t: (key: string) => string }) { const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft; const Icon = config.icon; return <Badge className={cn("border-0", config.className)}><Icon className="h-3 w-3" />{t(config.labelKey)}</Badge>; }