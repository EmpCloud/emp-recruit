import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Gift, Plus, X } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/api/client";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface ReferralRow {
  id: string;
  job_id: string;
  referrer_id: number;
  candidate_id: string;
  application_id: string | null;
  status: string;
  relationship: string | null;
  notes: string | null;
  bonus_amount: number | null;
  bonus_paid_at: string | null;
  created_at: string;
  candidate_name: string;
  job_title: string;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  bonus_eligible: "bg-purple-100 text-purple-700",
  bonus_paid: "bg-emerald-100 text-emerald-700",
};

export function ReferralListPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    job_id: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    relationship: "",
    notes: "",
  });

  const referralsQuery = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const res = await apiGet<any>("/referrals");
      return res.data;
    },
  });

  const submitMutation = useMutation({
    mutationFn: (data: typeof form) => apiPost("/referrals", data),
    onSuccess: () => {
      toast.success("Referral submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      setShowForm(false);
      setForm({ job_id: "", first_name: "", last_name: "", email: "", phone: "", relationship: "", notes: "" });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to submit referral");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitMutation.mutate(form);
  }

  const referrals: ReferralRow[] = referralsQuery.data?.data || [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
          <p className="mt-1 text-sm text-gray-500">Track employee referrals and bonus eligibility.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Refer Someone"}
        </button>
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">Submit a Referral</h3>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Job ID *</label>
              <input
                type="text"
                required
                value={form.job_id}
                onChange={(e) => setForm((p) => ({ ...p, job_id: e.target.value }))}
                placeholder="Paste the job UUID"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">First Name *</label>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last Name *</label>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Relationship</label>
              <input
                type="text"
                value={form.relationship}
                onChange={(e) => setForm((p) => ({ ...p, relationship: e.target.value }))}
                placeholder="e.g. Former colleague"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Referral"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {referralsQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : referrals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Gift className="h-12 w-12 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No referrals yet. Refer someone to get started!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">Referred Candidate</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Job Applied For</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Bonus Amount</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {referrals.map((ref) => (
                  <tr key={ref.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{ref.candidate_name}</td>
                    <td className="px-4 py-3 text-gray-700">{ref.job_title}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ref.status] || "bg-gray-100 text-gray-700"}`}
                      >
                        {ref.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {ref.bonus_amount ? `INR ${(ref.bonus_amount / 100).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(ref.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
