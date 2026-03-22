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
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import type { Offer, OfferApprover } from "@emp-recruit/shared";

type OfferDetail = Offer & { approvers: OfferApprover[] };

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700", icon: FileText },
  pending_approval: { label: "Pending Approval", className: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  sent: { label: "Sent", className: "bg-purple-100 text-purple-700", icon: Send },
  accepted: { label: "Accepted", className: "bg-green-100 text-green-700", icon: CheckCircle2 },
  declined: { label: "Declined", className: "bg-red-100 text-red-700", icon: XCircle },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-500", icon: AlertCircle },
  revoked: { label: "Revoked", className: "bg-red-100 text-red-600", icon: Ban },
};

const APPROVER_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "---";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["offer", id],
    queryFn: () => apiGet<OfferDetail>(`/offers/${id}`),
    enabled: !!id,
  });

  const offer = data?.data;

  const submitApproval = useMutation({
    mutationFn: () => apiPost(`/offers/${id}/submit-approval`, { approver_ids: [] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offer", id] }),
  });

  const sendOffer = useMutation({
    mutationFn: () => apiPost(`/offers/${id}/send`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offer", id] }),
  });

  const revokeOffer = useMutation({
    mutationFn: () => apiPost(`/offers/${id}/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offer", id] }),
  });

  const approveOffer = useMutation({
    mutationFn: (comment?: string) => apiPost(`/offers/${id}/approve`, { comment }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offer", id] }),
  });

  const rejectOffer = useMutation({
    mutationFn: (comment?: string) => apiPost(`/offers/${id}/reject`, { comment }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offer", id] }),
  });

  const acceptOffer = useMutation({
    mutationFn: () => apiPost(`/offers/${id}/accept`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offer", id] }),
  });

  const declineOffer = useMutation({
    mutationFn: () => apiPost(`/offers/${id}/decline`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offer", id] }),
  });

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
        <h3 className="mt-4 text-sm font-medium text-gray-900">Offer not found</h3>
        <Link to="/offers" className="mt-2 text-sm text-brand-600 hover:underline">
          Back to offers
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[offer.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/offers")} className="rounded-lg p-2 hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Offer Details</h1>
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${statusConfig.className}`}>
              <StatusIcon className="h-4 w-4" />
              {statusConfig.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Offer #{offer.id.slice(0, 8)}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {offer.status === "draft" && (
            <>
              <Link
                to={`/offers/${id}`}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Edit
              </Link>
              <button
                onClick={() => submitApproval.mutate()}
                disabled={submitApproval.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors"
              >
                <Clock className="h-4 w-4" />
                Submit for Approval
              </button>
            </>
          )}
          {offer.status === "pending_approval" && (
            <>
              <button
                onClick={() => approveOffer.mutate()}
                disabled={approveOffer.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </button>
              <button
                onClick={() => rejectOffer.mutate()}
                disabled={rejectOffer.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </>
          )}
          {offer.status === "approved" && (
            <button
              onClick={() => sendOffer.mutate()}
              disabled={sendOffer.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              Send to Candidate
            </button>
          )}
          {offer.status === "sent" && (
            <>
              <button
                onClick={() => acceptOffer.mutate()}
                disabled={acceptOffer.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark Accepted
              </button>
              <button
                onClick={() => declineOffer.mutate()}
                disabled={declineOffer.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Mark Declined
              </button>
            </>
          )}
          {["sent", "approved", "pending_approval"].includes(offer.status) && (
            <button
              onClick={() => revokeOffer.mutate()}
              disabled={revokeOffer.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Ban className="h-4 w-4" />
              Revoke
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Details Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Offer Information</h2>
            <div className="mt-4 grid grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Candidate</p>
                  <p className="text-sm font-medium text-gray-900">{offer.candidate_id}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Job Title</p>
                  <p className="text-sm font-medium text-gray-900">{offer.job_title}</p>
                  {offer.department && <p className="text-xs text-gray-500">{offer.department}</p>}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DollarSign className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Salary</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatCurrency(offer.salary_amount, offer.salary_currency)}
                    <span className="ml-1 text-xs text-gray-500">/ year</span>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Joining Date</p>
                  <p className="text-sm font-medium text-gray-900">{formatDate(offer.joining_date)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Expiry Date</p>
                  <p className="text-sm font-medium text-gray-900">{formatDate(offer.expiry_date)}</p>
                </div>
              </div>
              {offer.sent_at && (
                <div className="flex items-start gap-3">
                  <Send className="mt-0.5 h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs font-medium uppercase text-gray-500">Sent At</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(offer.sent_at)}</p>
                  </div>
                </div>
              )}
              {offer.responded_at && (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs font-medium uppercase text-gray-500">Responded At</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(offer.responded_at)}</p>
                  </div>
                </div>
              )}
            </div>

            {offer.benefits && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                <p className="text-xs font-medium uppercase text-gray-500">Benefits</p>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{offer.benefits}</p>
              </div>
            )}

            {offer.notes && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="text-xs font-medium uppercase text-gray-500">Notes</p>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{offer.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Approval Workflow Sidebar */}
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Approval Workflow</h2>
            {offer.approvers.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center py-8">
                <Clock className="h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500 text-center">
                  No approvers assigned yet. Submit this offer for approval to begin the workflow.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {offer.approvers.map((approver, idx) => {
                  const aStatus = APPROVER_STATUS[approver.status] || APPROVER_STATUS.pending;
                  return (
                    <div
                      key={approver.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-600">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          User #{approver.user_id}
                        </p>
                        {approver.notes && (
                          <p className="text-xs text-gray-500 truncate">{approver.notes}</p>
                        )}
                        {approver.acted_at && (
                          <p className="text-xs text-gray-400">{formatDate(approver.acted_at)}</p>
                        )}
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${aStatus.className}`}>
                        {aStatus.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-gray-400" />
                  <div className="w-px flex-1 bg-gray-200" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Created</p>
                  <p className="text-xs text-gray-500">{formatDate(offer.created_at)}</p>
                </div>
              </div>
              {offer.approved_at && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-blue-400" />
                    <div className="w-px flex-1 bg-gray-200" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Approved</p>
                    <p className="text-xs text-gray-500">{formatDate(offer.approved_at)}</p>
                  </div>
                </div>
              )}
              {offer.sent_at && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-purple-400" />
                    <div className="w-px flex-1 bg-gray-200" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Sent to Candidate</p>
                    <p className="text-xs text-gray-500">{formatDate(offer.sent_at)}</p>
                  </div>
                </div>
              )}
              {offer.responded_at && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-2 w-2 rounded-full ${offer.status === "accepted" ? "bg-green-400" : "bg-red-400"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {offer.status === "accepted" ? "Accepted" : "Declined"}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(offer.responded_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
