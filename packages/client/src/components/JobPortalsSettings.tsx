// ============================================================================
// JOB PORTALS SETTINGS — connect external job boards (LinkedIn, Indeed) by
// entering their partner API credentials. Once connected, a job's Distribution
// panel can publish to that portal via its real API.
// Backend: /distribution/portals + /distribution/portals/:portal/credentials.
// ============================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Share2, CheckCircle2, Link2, Unlink, X } from "lucide-react";
import { apiGet, apiPut, apiDelete } from "@/api/client";
import toast from "react-hot-toast";

interface Portal {
  portal: string;
  displayName: string;
  mode: "assisted" | "api" | "unavailable";
  connected: boolean;
}

// Which credential fields each portal needs (label + whether it's a secret).
// Only portals that genuinely support API posting are configurable here.
// Indeed/Apna have no public REST posting endpoint, so they're intentionally
// omitted (they show as "Not connected" and are posted via their own dashboards).
const PORTAL_FIELDS: Record<string, { key: string; label: string; secret?: boolean; hint?: string }[]> = {
  linkedin: [
    { key: "accessToken", label: "OAuth access token", secret: true, hint: "Token with the job-posting scope" },
    { key: "integrationContext", label: "Integration context (company/partner URN)", hint: "e.g. urn:li:organization:12345" },
    { key: "version", label: "API version (optional)", hint: "Default 202603" },
  ],
};

const MODE_META: Record<string, { label: string; cls: string }> = {
  api: { label: "Connected (API)", cls: "bg-emerald-50 text-emerald-700" },
  assisted: { label: "Assisted", cls: "bg-blue-50 text-blue-700" },
  unavailable: { label: "Not connected", cls: "bg-gray-100 text-gray-500" },
};

export function JobPortalsSettings() {
  const [editing, setEditing] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["distribution-portals"],
    queryFn: () => apiGet<Portal[]>("/distribution/portals"),
  });
  const portals: Portal[] = (data?.data as any) ?? [];
  // Only portals that have an API credential form are configurable here.
  const configurable = portals.filter((p) => PORTAL_FIELDS[p.portal]);

  return (
    <div className="mt-8 border-t border-gray-100 pt-8">
      <div className="mb-4 flex items-center gap-2">
        <Share2 className="h-5 w-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Job portals</h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Connect LinkedIn or Indeed with your partner API credentials to publish job postings directly to them.
      </p>

      {isLoading ? (
        <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {configurable.map((p) => {
            const meta = MODE_META[p.mode] || MODE_META.unavailable;
            return (
              <div key={p.portal} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-gray-900">{p.displayName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                </div>
                {p.connected ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Credentials saved
                    </span>
                    <button onClick={() => setEditing(p.portal)} className="ml-auto text-xs font-medium text-brand-600 hover:underline">Update</button>
                    <DisconnectButton portal={p.portal} />
                  </div>
                ) : (
                  <button
                    onClick={() => setEditing(p.portal)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Connect {p.displayName}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <CredentialsModal
          portal={editing}
          displayName={configurable.find((p) => p.portal === editing)?.displayName || editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DisconnectButton({ portal }: { portal: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => apiDelete(`/distribution/portals/${portal}/credentials`),
    onSuccess: () => {
      toast.success("Portal disconnected");
      queryClient.invalidateQueries({ queryKey: ["distribution-portals"] });
    },
  });
  return (
    <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
      {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
    </button>
  );
}

function CredentialsModal({ portal, displayName, onClose }: { portal: string; displayName: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fields = PORTAL_FIELDS[portal] || [];
  const [values, setValues] = useState<Record<string, string>>({});

  const saveMutation = useMutation({
    mutationFn: () => {
      const credentials: Record<string, string> = {};
      for (const f of fields) if (values[f.key]?.trim()) credentials[f.key] = values[f.key].trim();
      return apiPut(`/distribution/portals/${portal}/credentials`, { credentials });
    },
    onSuccess: () => {
      toast.success(`${displayName} connected`);
      queryClient.invalidateQueries({ queryKey: ["distribution-portals"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Could not save credentials"),
  });

  const requiredKeys = fields.filter((f) => !f.label.includes("optional")).map((f) => f.key);
  const canSave = requiredKeys.every((k) => values[k]?.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">Connect {displayName}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {displayName} posting requires an approved partner agreement. Enter the API credentials from your partner account.
          </p>
          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-sm font-medium text-gray-700">{f.label}</label>
              <input
                type={f.secret ? "password" : "text"}
                value={values[f.key] || ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.hint || ""}
                autoComplete="off"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Save &amp; connect
          </button>
        </div>
      </div>
    </div>
  );
}
