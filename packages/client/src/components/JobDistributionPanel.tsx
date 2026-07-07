// ============================================================================
// JOB DISTRIBUTION PANEL — publish a job to external boards.
// Naukri = one-click assisted (opens pre-filled + copy-paste payload).
// LinkedIn/Indeed/Apna = shows the access gate until credentials exist.
// ============================================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ExternalLink, Copy, CheckCircle2, Share2, AlertCircle } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";

interface Portal { portal: string; displayName: string; mode: "assisted" | "api" | "unavailable"; }
interface DistRow { portal: string; status: string; external_url?: string; error?: string; }

const PORTAL_COLORS: Record<string, string> = {
  naukri: "text-blue-700", linkedin: "text-sky-700", indeed: "text-indigo-700", apna: "text-emerald-700",
};

export function JobDistributionPanel({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: portalsData, isLoading } = useQuery({
    queryKey: ["dist-portals"],
    queryFn: () => apiGet<Portal[]>("/distribution/portals"),
  });
  const { data: statusData, refetch } = useQuery({
    queryKey: ["dist-status", jobId],
    queryFn: () => apiGet<DistRow[]>(`/distribution/jobs/${jobId}`),
  });

  const portals: Portal[] = (portalsData as any)?.data || (portalsData as any) || [];
  const statuses: DistRow[] = (statusData as any)?.data || (statusData as any) || [];
  const statusFor = (p: string) => statuses.find((s) => s.portal === p);

  async function publish(portal: string) {
    setBusy(portal); setResult(null);
    try {
      const res: any = await apiPost(`/distribution/jobs/${jobId}/publish`, { portal });
      const data = res?.data?.data || res?.data || res;
      setResult({ portal, ...data });
      if (data.mode === "assisted" && data.prefillUrl) window.open(data.prefillUrl, "_blank");
      refetch();
    } catch (e: any) {
      setResult({ portal, mode: "unavailable", reason: e?.response?.data?.error?.message || "Failed" });
    } finally {
      setBusy(null);
    }
  }

  async function markPosted(portal: string) {
    setBusy(portal);
    try {
      await apiPost(`/distribution/jobs/${jobId}/mark-posted`, { portal });
      refetch();
    } catch (e: any) {
      setResult({ portal, mode: "unavailable", reason: e?.response?.data?.error?.message || "Failed" });
    } finally {
      setBusy(null);
    }
  }

  function copyPayload() {
    if (!result?.payload) return;
    const text = Object.entries(result.payload)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) return <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <Share2 className="h-5 w-5 text-gray-700" />
        <h3 className="text-base font-semibold text-gray-900">Publish to job boards</h3>
      </div>
      <p className="mb-4 text-sm text-gray-500">Distribute this role to external portals.</p>

      <div className="space-y-2">
        {portals.map((p) => {
          const st = statusFor(p.portal);
          return (
            <div key={p.portal} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`font-medium ${PORTAL_COLORS[p.portal] || "text-gray-700"}`}>{p.displayName}</span>
                {st?.status === "posted" && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Posted</span>
                )}
                {st?.status === "prepared" && (
                  <span className="inline-flex items-center gap-2 text-xs text-amber-600">
                    Prepared
                    <button
                      onClick={() => markPosted(p.portal)}
                      disabled={busy === p.portal}
                      className="rounded border border-amber-300 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                    >
                      Mark as posted
                    </button>
                  </span>
                )}
                {p.mode === "unavailable" && <span className="text-xs text-gray-400">Needs API access</span>}
              </div>
              {p.mode === "unavailable" ? (
                <button
                  onClick={() => publish(p.portal)}
                  disabled={busy === p.portal}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  Why?
                </button>
              ) : (
                <button
                  onClick={() => publish(p.portal)}
                  disabled={busy === p.portal}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy === p.portal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  {p.mode === "assisted" ? "Post (assisted)" : "Post"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Result panel */}
      {result && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          {result.mode === "assisted" ? (
            <div>
              <p className="mb-2 text-sm text-gray-700">{result.instructions}</p>
              {result.prefillUrl && (
                <a href={result.prefillUrl} target="_blank" rel="noreferrer" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
                  <ExternalLink className="h-4 w-4" /> Open {result.portal} post form
                </a>
              )}
              {result.payload && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Fields to paste</span>
                    <button onClick={copyPayload} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy all"}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-auto rounded border border-gray-200 bg-white p-3 text-xs">
                    {Object.entries(result.payload).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} className="mb-1"><span className="font-medium text-gray-500">{k}:</span> <span className="text-gray-800">{String(v)}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : result.mode === "api" ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Posted to {result.portal}.
              {result.externalUrl && <a href={result.externalUrl} target="_blank" rel="noreferrer" className="underline">View</a>}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>{result.reason}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
