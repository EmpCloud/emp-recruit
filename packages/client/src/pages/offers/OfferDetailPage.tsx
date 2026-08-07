import { useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  User,
  Briefcase,
  Calendar,
  DollarSign,
  AlertCircle,
  FileDown,
  Download,
  Eye,
  Mail,
  X,
  Plus,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { cn, formatDate, formatCurrency as formatCurrencyShared } from "@/lib/utils";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { Offer, OfferApprover } from "@emp-recruit/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OfferDetail = Offer & {
  approvers: OfferApprover[];
  candidate_name?: string;
  candidate_email?: string | null;
  job_title_display?: string;
};

interface OfferLetterTemplate {
  id: string;
  name: string;
  is_default: boolean;
}

interface GeneratedLetter {
  id: string;
  content: string;
  file_path: string | null;
  sent_at: string | null;
}

const STATUS_CONFIG: Record<string, { labelKey: string; className: string; icon: typeof Clock }> = {
  draft: { labelKey: "offers.status.draft", className: "bg-gray-100 text-gray-700", icon: FileText },
  pending_approval: { labelKey: "offers.status.pendingApproval", className: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { labelKey: "offers.status.approved", className: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  sent: { labelKey: "offers.status.sent", className: "bg-purple-100 text-purple-700", icon: Send },
  accepted: { labelKey: "offers.status.accepted", className: "bg-green-100 text-green-700 dark:text-green-300", icon: CheckCircle2 },
  declined: { labelKey: "offers.status.declined", className: "bg-red-100 text-red-700", icon: XCircle },
  expired: { labelKey: "offers.status.expired", className: "bg-gray-100 text-gray-500", icon: AlertCircle },
  revoked: { labelKey: "offers.status.revoked", className: "bg-red-100 text-red-600", icon: Ban },
};

const APPROVER_STATUS: Record<string, { labelKey: string; className: string }> = {
  pending: { labelKey: "offers.approverStatus.pending", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/70 dark:text-yellow-300" },
  approved: { labelKey: "offers.approverStatus.approved", className: "bg-green-100 text-green-700 dark:bg-green-950/70 dark:text-green-300" },
  rejected: { labelKey: "offers.approverStatus.rejected", className: "bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300" },
};

function formatCurrency(amount: number, currency: string) {
  // Amounts are stored in minor units; locale-aware formatting keeps grouping
  // consistent with the rest of the app.
  return formatCurrencyShared(amount / 100, currency || "INR");
}

export function OfferDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["offer", id],
    queryFn: () => apiGet<OfferDetail>(`/offers/${id}`),
    enabled: !!id,
  });

  const offer = data?.data;

  // #21 — Submit for Approval state. The backend rejects an empty
  // approver_ids array, so we now gather selected approvers from a modal
  // picker and surface errors via toast.
  const [showApproverModal, setShowApproverModal] = useState(false);
  const [selectedApproverIds, setSelectedApproverIds] = useState<number[]>([]);

  const { data: usersData } = useQuery({
    queryKey: ["org-users", "approver"],
    queryFn: () =>
      apiGet<{ id: number; first_name: string; last_name: string; email: string; role: string; designation: string | null }[]>(
        "/organizations/users",
        { role: "approver" },
      ),
    enabled: showApproverModal,
  });
  const orgUsers = usersData?.data ?? [];

  const submitApproval = useMutation({
    mutationFn: (approver_ids: number[]) =>
      apiPost(`/offers/${id}/submit-approval`, { approver_ids }),
    onSuccess: () => {
      toast.success(t("offers.detail.toastSubmitted"));
      setShowApproverModal(false);
      setSelectedApproverIds([]);
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || t("offers.detail.toastSubmitFailed");
      toast.error(msg);
    },
  });

  const sendOffer = useMutation({
    mutationFn: () => apiPost(`/offers/${id}/send`),
    onSuccess: () => {
      toast.success(t("offers.detail.toastSent"));
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || t("offers.detail.toastSendFailed"));
    },
  });

  const revokeOffer = useMutation({
    mutationFn: () => apiPost(`/offers/${id}/revoke`),
    onSuccess: () => {
      toast.success(t("offers.detail.toastRevoked"));
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || t("offers.detail.toastRevokeFailed"));
    },
  });

  // #34 — approve/reject mutations previously had no onError handler, so
  // a 403 ("You are not an approver for this offer") or 400 ("You have
  // already acted on this offer") silently failed and the user thought
  // the buttons were broken. Surface the server message via toast.
  const approveOffer = useMutation({
    mutationFn: (comment?: string) => apiPost(`/offers/${id}/approve`, { comment }),
    onSuccess: () => {
      toast.success(t("offers.detail.toastApproved"));
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || t("offers.detail.toastApproveFailed"));
    },
  });

  const rejectOffer = useMutation({
    mutationFn: (comment?: string) => apiPost(`/offers/${id}/reject`, { comment }),
    onSuccess: () => {
      toast.success(t("offers.detail.toastRejected"));
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || t("offers.detail.toastRejectFailed"));
    },
  });

  const acceptOffer = useMutation({
    mutationFn: () => apiPost<Offer>(`/offers/${id}/accept`),
    onSuccess: (res) => {
      toast.success(t("offers.detail.toastAccepted"));
      // Seed the cache with the server's new status immediately (merge so we
      // keep the enriched fields the transition endpoint doesn't return) — this
      // flips the status-gated buttons right away, then the invalidate refetches
      // the fully-enriched record.
      if (res?.data) {
        queryClient.setQueryData<OfferDetail>(["offer", id], (prev) =>
          prev ? { ...prev, ...res.data } : prev,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || t("offers.detail.toastAcceptFailed"));
    },
  });

  const declineOffer = useMutation({
    mutationFn: () => apiPost<Offer>(`/offers/${id}/decline`),
    onSuccess: (res) => {
      toast.success(t("offers.detail.toastDeclined"));
      if (res?.data) {
        queryClient.setQueryData<OfferDetail>(["offer", id], (prev) =>
          prev ? { ...prev, ...res.data } : prev,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || t("offers.detail.toastDeclineFailed"));
    },
  });

  // --- Offer Letter ---
  const [showLetterPreview, setShowLetterPreview] = useState(false);
  const [showTemplateSelect, setShowTemplateSelect] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { data: templatesData } = useQuery({
    queryKey: ["offer-letter-templates"],
    queryFn: () => apiGet<OfferLetterTemplate[]>("/offer-letters/templates"),
    enabled: showTemplateSelect,
  });

  const { data: letterData, refetch: refetchLetter } = useQuery({
    queryKey: ["offer-letter", id],
    queryFn: () => apiGet<GeneratedLetter>(`/offer-letters/${id}`),
    enabled: !!id,
    retry: false,
  });

  const generateLetter = useMutation({
    mutationFn: (templateId: string) =>
      apiPost(`/offer-letters/generate/${id}`, { templateId }),
    onSuccess: () => {
      toast.success(t("offers.detail.toastLetterGenerated"));
      refetchLetter();
      setShowTemplateSelect(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || t("offers.detail.toastLetterGenerateFailed")),
  });

  const sendLetter = useMutation({
    mutationFn: () => apiPost(`/offer-letters/${id}/send`),
    onSuccess: () => {
      toast.success(t("offers.detail.toastLetterSent"));
      refetchLetter();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || t("offers.detail.toastLetterSendFailed")),
  });

  const generatedLetter = letterData?.data;
  const letterTemplates = templatesData?.data || [];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-sm font-medium text-gray-900">{t("offers.detail.notFound")}</h3>
        <Link to="/offers" className="mt-2 text-sm text-brand-600 hover:underline">
          {t("offers.detail.backToOffers")}
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[offer.status] || STATUS_CONFIG.draft;
  const statusLabel = t(statusConfig.labelKey);
  const StatusIcon = statusConfig.icon;

  // Terminal states — the offer is closed and no further action (generating /
  // emailing a letter, approving) applies.
  const isTerminal = ["revoked", "declined", "expired"].includes(offer.status);

  const summaryItems = [
    { icon: User, label: t("offers.detail.candidate"), value: offer.candidate_name || offer.candidate_id, sub: offer.candidate_email || "", tone: "from-violet-100/90 via-white to-violet-50 dark:from-violet-950/60 dark:via-slate-900 dark:to-violet-950/20" },
    { icon: Briefcase, label: t("offers.detail.jobTitle"), value: offer.job_title_display || offer.job_title, sub: offer.department || "", tone: "from-indigo-100/90 via-white to-indigo-50 dark:from-indigo-950/60 dark:via-slate-900 dark:to-indigo-950/20" },
    { icon: DollarSign, label: t("offers.detail.salary"), value: formatCurrency(offer.salary_amount, offer.salary_currency), sub: t("offers.detail.perYear"), tone: "from-blue-100/90 via-white to-blue-50 dark:from-blue-950/60 dark:via-slate-900 dark:to-blue-950/20" },
    { icon: Calendar, label: t("offers.detail.joiningDate"), value: formatDate(offer.joining_date), sub: "", tone: "from-purple-100/90 via-white to-purple-50 dark:from-purple-950/60 dark:via-slate-900 dark:to-purple-950/20" },
    { icon: Send, label: t("offers.detail.sentAt"), value: offer.sent_at ? formatDate(offer.sent_at) : "Not sent", sub: "", tone: "from-pink-100/90 via-white to-pink-50 dark:from-pink-950/60 dark:via-slate-900 dark:to-pink-950/20" },
  ];
  const timeline = [
    { label: t("offers.detail.timelineCreated"), date: offer.created_at, icon: FileText, color: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300" },
    offer.approved_at && { label: t("offers.detail.timelineApproved"), date: offer.approved_at, icon: CheckCircle2, color: "bg-blue-100 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300" },
    offer.sent_at && { label: t("offers.detail.timelineSentToCandidate"), date: offer.sent_at, icon: Send, color: "bg-purple-100 text-purple-600 dark:bg-purple-950/70 dark:text-purple-300" },
    offer.responded_at && { label: offer.status === "accepted" ? t("offers.detail.timelineAccepted") : t("offers.detail.timelineDeclined"), date: offer.responded_at, icon: offer.status === "accepted" ? CheckCircle2 : XCircle, color: offer.status === "accepted" ? "bg-green-100 text-green-600 dark:bg-green-950/70 dark:text-green-300" : "bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-300" },
    offer.status === "revoked" && { label: t("offers.detail.timelineRevoked"), date: offer.updated_at, icon: Ban, color: "bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-300" },
    offer.status === "expired" && { label: statusLabel, date: offer.expiry_date, icon: AlertCircle, color: "bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-300" },
  ].filter(Boolean) as { label: string; date: string; icon: typeof FileText; color: string }[];

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <Button variant="outline" size="icon" onClick={() => navigate("/offers")} aria-label={t("offers.detail.backToOffers")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold text-gray-900">{t("offers.detail.title")}</h1><Badge className={statusConfig.className}><StatusIcon className="h-3.5 w-3.5" />{statusLabel}</Badge></div><p className="mt-1 text-sm text-gray-500">{t("offers.detail.offerNumber", { id: offer.id.slice(0, 8) })}</p></div>
        <div className="flex flex-wrap gap-2">
          {generatedLetter?.file_path && <a href={generatedLetter.file_path} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><Download className="h-4 w-4" />Download PDF</a>}
          <Link to="/offers/new" className={buttonVariants()}><Plus className="h-4 w-4" />{t("offers.list.newOffer")}</Link>
          {offer.status === "draft" && <><Link to={`/offers/${id}/edit`} className={buttonVariants({ variant: "outline" })}>{t("offers.detail.edit")}</Link><Button onClick={() => setShowApproverModal(true)} disabled={submitApproval.isPending} className="bg-amber-600 hover:bg-amber-700"><Clock className="h-4 w-4" />{t("offers.detail.submitForApproval")}</Button></>}
          {offer.status === "pending_approval" && <><Button onClick={() => approveOffer.mutate(undefined)} disabled={approveOffer.isPending} className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-4 w-4" />{t("offers.detail.approve")}</Button><Button onClick={() => rejectOffer.mutate(undefined)} disabled={rejectOffer.isPending} className="bg-red-600 hover:bg-red-700"><XCircle className="h-4 w-4" />{t("offers.detail.reject")}</Button></>}
          {offer.status === "approved" && <Button onClick={() => sendOffer.mutate()} disabled={sendOffer.isPending}><Send className="h-4 w-4" />{sendOffer.isPending ? t("offers.detail.marking") : t("offers.detail.markAsSent")}</Button>}
          {offer.status === "sent" && <><Button onClick={() => acceptOffer.mutate()} disabled={acceptOffer.isPending} className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-4 w-4" />{t("offers.detail.markAccepted")}</Button><Button variant="outline" onClick={() => declineOffer.mutate()} disabled={declineOffer.isPending} className="border-red-300 text-red-700 hover:bg-red-50"><XCircle className="h-4 w-4" />{t("offers.detail.markDeclined")}</Button></>}
          {["sent", "approved", "pending_approval"].includes(offer.status) && <Button variant="outline" onClick={() => revokeOffer.mutate()} disabled={revokeOffer.isPending}><Ban className="h-4 w-4" />{t("offers.detail.revoke")}</Button>}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{summaryItems.map(({ icon: Icon, label, value, sub, tone }) => <Card key={label} className={`overflow-hidden bg-gradient-to-br ${tone}`}><CardContent className="flex items-center gap-3 p-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-brand-600 shadow-sm dark:bg-slate-800/90 dark:text-brand-300"><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs text-gray-500">{label}</p><p className="truncate text-sm font-semibold text-gray-900">{value}</p>{sub && <p className="truncate text-xs text-gray-500">{sub}</p>}</div></CardContent></Card>)}</div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,1fr)]">
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-brand-50/35 via-white to-blue-50/30 dark:from-slate-800 dark:via-slate-900 dark:to-brand-950/20"><CardHeader className="border-b border-gray-200 pb-4"><CardTitle className="text-base">Offer Overview</CardTitle></CardHeader><CardContent className="p-5">
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2"><Detail icon={User} label={t("offers.detail.candidate")} value={offer.candidate_name || offer.candidate_id} sub={offer.candidate_email || undefined} /><Detail icon={DollarSign} label={t("offers.detail.salary")} value={`${formatCurrency(offer.salary_amount, offer.salary_currency)} ${t("offers.detail.perYear")}`} /><Detail icon={Mail} label="Email" value={offer.candidate_email || "—"} /><Detail icon={Calendar} label={t("offers.detail.joiningDate")} value={formatDate(offer.joining_date)} /><Detail icon={Briefcase} label={t("offers.detail.jobTitle")} value={offer.job_title_display || offer.job_title} /><Detail icon={Calendar} label={t("offers.detail.expiryDate")} value={formatDate(offer.expiry_date)} valueClass={offer.status === "expired" ? "text-red-600" : undefined} /><Detail icon={Briefcase} label="Department" value={offer.department || "—"} /><Detail icon={Send} label={t("offers.detail.sentAt")} value={offer.sent_at ? formatDate(offer.sent_at) : "—"} /></div>
            {offer.benefits && <div className="mt-5 border-t border-gray-200 pt-4"><p className="text-xs font-medium text-gray-500">{t("offers.detail.benefits")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{offer.benefits}</p></div>}{offer.notes && <div className="mt-4 border-t border-gray-200 pt-4"><p className="text-xs font-medium text-gray-500">{t("offers.detail.notes")}</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{offer.notes}</p></div>}
          </CardContent></Card>

          <Card className="bg-gradient-to-br from-violet-50/70 via-white to-blue-50/50 dark:from-violet-950/40 dark:via-slate-900 dark:to-blue-950/30"><CardHeader className="flex-row items-center justify-between space-y-0 border-b border-gray-200 pb-4"><CardTitle className="flex items-center gap-2 text-base"><FileDown className="h-5 w-5 text-brand-600" />{t("offers.detail.offerLetter")}</CardTitle>{generatedLetter && <Button variant="outline" size="sm" onClick={() => setShowLetterPreview(true)}><Eye className="h-4 w-4" />{t("offers.detail.preview")}</Button>}</CardHeader><CardContent className="p-5">
            {generatedLetter ? <div className="flex flex-col items-center rounded-xl border border-green-200 bg-green-50/80 p-7 dark:border-green-900 dark:bg-green-950/40 text-center"><CheckCircle2 className="h-10 w-10 text-green-600" /><p className="mt-3 text-sm font-medium text-green-800 dark:text-green-300">{isTerminal ? t("offers.detail.letterTerminalNotice", { status: statusLabel.toLowerCase() }) : t("offers.detail.letterGeneratedNotice")}</p>{generatedLetter.sent_at && <p className="mt-1 text-xs text-green-700 dark:text-green-300">{t("offers.detail.sentOn", { date: formatDate(generatedLetter.sent_at) })}</p>}<div className="mt-4 flex flex-wrap justify-center gap-2">{!isTerminal && <Button size="sm" onClick={() => setShowTemplateSelect(true)}><FileText className="h-4 w-4" />{t("offers.detail.regenerate")}</Button>}{!isTerminal && <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => sendLetter.mutate()} disabled={sendLetter.isPending}><Mail className="h-4 w-4" />{t("offers.detail.emailOfferLetter")}</Button>}</div></div> : <div className="flex flex-col items-center py-7 text-center"><div className="rounded-2xl bg-brand-50 p-4"><FileText className="h-10 w-10 text-brand-400" /></div><p className="mt-4 text-sm text-gray-500">{isTerminal ? t("offers.detail.noLetterTerminal") : t("offers.detail.noLetterYet")}</p>{!isTerminal && <Button variant="outline" className="mt-4" onClick={() => setShowTemplateSelect(true)}><FileText className="h-4 w-4" />{t("offers.detail.generateOfferLetter")}</Button>}</div>}
          </CardContent></Card>
        </div>

        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-amber-50/60 via-white to-green-50/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-green-950/20"><CardHeader className="border-b border-gray-200 pb-4"><CardTitle className="text-base">{t("offers.detail.approvalWorkflow")}</CardTitle></CardHeader><CardContent className="p-4">
            {isTerminal && offer.approvers?.length > 0 && <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300"><AlertCircle className="mr-2 inline h-4 w-4" />{t("offers.detail.approvalTerminalNotice", { status: statusLabel.toLowerCase() })}</div>}
            {!offer.approvers?.length ? <div className="py-8 text-center"><Clock className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-2 text-sm text-gray-500">{t("offers.detail.noApprovers")}</p></div> : <div className="space-y-3">{offer.approvers.map((approver, index) => { const state = APPROVER_STATUS[approver.status] || APPROVER_STATUS.pending; return <div key={approver.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-800/90"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-sm font-semibold text-brand-700">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-900">{(approver as any).approver_name || t("offers.detail.userNumber", { id: approver.user_id })}</p>{approver.notes && <p className="truncate text-xs text-gray-500 dark:text-gray-300">{approver.notes}</p>}{approver.acted_at && <p className="text-xs text-gray-400 dark:text-gray-400">{formatDate(approver.acted_at)}</p>}</div><Badge className={state.className}>{t(state.labelKey)}</Badge></div>; })}</div>}
          </CardContent></Card>

          <Card className="bg-gradient-to-br from-blue-50/60 via-white to-purple-50/50 dark:from-blue-950/30 dark:via-slate-900 dark:to-purple-950/30"><CardHeader className="border-b border-gray-200 pb-4"><CardTitle className="text-base">{t("offers.detail.timeline")}</CardTitle></CardHeader><CardContent className="p-5"><div>{timeline.map(({ label, date, icon: Icon, color }, index) => <div key={`${label}-${date}`} className="relative flex gap-3 pb-5 last:pb-0">{index < timeline.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-gray-200" />}<span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color}`}><Icon className="h-4 w-4" /></span><div><p className="text-sm font-medium text-gray-900">{label}</p><p className="text-xs text-gray-500">{formatDate(date)}</p></div></div>)}</div></CardContent></Card>
        </div>
      </div>

      {showTemplateSelect && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTemplateSelect(false)}><Card className="w-full max-w-md" onClick={(event) => event.stopPropagation()}><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>{t("offers.detail.selectTemplate")}</CardTitle><p className="mt-1 text-sm text-gray-500">{t("offers.detail.selectTemplateDesc")}</p></div><Button variant="ghost" size="icon" onClick={() => setShowTemplateSelect(false)}><X className="h-5 w-5" /></Button></CardHeader><CardContent><Select value={selectedTemplateId || undefined} onValueChange={setSelectedTemplateId}><SelectTrigger><SelectValue placeholder={t("offers.detail.selectTemplate")} /></SelectTrigger><SelectContent>{letterTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}{template.is_default ? ` · ${t("offers.detail.default")}` : ""}</SelectItem>)}</SelectContent></Select>{!letterTemplates.length ? <div className="py-6 text-center"><p className="text-sm text-gray-500">{t("offers.detail.noTemplates")}</p><Link to="/offers/letter-templates" className={cn(buttonVariants(), "mt-3")}><Plus className="h-4 w-4" />{t("offers.detail.createTemplate")}</Link></div> : <><Button className="mt-4 w-full" onClick={() => selectedTemplateId && generateLetter.mutate(selectedTemplateId)} disabled={!selectedTemplateId || generateLetter.isPending}>{generateLetter.isPending ? t("offers.detail.generating") : t("offers.detail.generateLetter")}</Button><Link to="/offers/letter-templates" className="mt-3 block text-center text-xs font-medium text-brand-600">{t("offers.detail.manageTemplates")}</Link></>}</CardContent></Card></div>}

      {showLetterPreview && generatedLetter && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowLetterPreview(false)}><Card className="max-h-[88vh] w-full max-w-3xl overflow-auto" onClick={(event) => event.stopPropagation()}><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>{t("offers.detail.offerLetterPreview")}</CardTitle><Button variant="ghost" size="icon" onClick={() => setShowLetterPreview(false)}><X className="h-5 w-5" /></Button></CardHeader><CardContent><div className="prose prose-sm max-w-none rounded-lg border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-950 dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatedLetter.content) }} /></CardContent></Card></div>}

      {showApproverModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowApproverModal(false)}><Card className="max-h-[90vh] w-full max-w-md overflow-auto" onClick={(event) => event.stopPropagation()}><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>{t("offers.detail.submitForApproval")}</CardTitle><Button variant="ghost" size="icon" onClick={() => setShowApproverModal(false)}><X className="h-5 w-5" /></Button></CardHeader><CardContent><p className="mb-4 text-sm text-gray-500">Select one or more approvers for this offer.</p><div className="space-y-2">{orgUsers.map((user) => { const selected = selectedApproverIds.includes(user.id); return <button key={user.id} type="button" onClick={() => setSelectedApproverIds((current) => selected ? current.filter((value) => value !== user.id) : [...current, user.id])} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${selected ? "border-brand-500 bg-brand-50 dark:bg-brand-950/60" : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{user.first_name[0]}{user.last_name[0]}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-gray-900">{user.first_name} {user.last_name}</span><span className="block truncate text-xs text-gray-500">{user.email}</span></span>{selected && <CheckCircle2 className="h-5 w-5 text-brand-600" />}</button>; })}</div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowApproverModal(false)}>{t("offers.detail.cancel")}</Button><Button onClick={() => submitApproval.mutate(selectedApproverIds)} disabled={!selectedApproverIds.length || submitApproval.isPending}>{submitApproval.isPending ? t("offers.detail.submitting") : t("offers.detail.submit")}</Button></div></CardContent></Card></div>}
    </div>
  );
}

function Detail({ icon: Icon, label, value, sub, valueClass }: { icon: typeof User; label: string; value: string; sub?: string; valueClass?: string }) {
  return <div className="flex items-start gap-3"><span className="rounded-lg bg-brand-50 p-2 text-brand-600"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs text-gray-500">{label}</p><p className={cn("text-sm font-semibold text-gray-900", valueClass)}>{value}</p>{sub && <p className="text-xs text-gray-500">{sub}</p>}</div></div>;
}