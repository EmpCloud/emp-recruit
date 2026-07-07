// ============================================================================
// MEETING CONNECTIONS — "Sign in with Google / Microsoft / Zoom"
// Lets a recruiter connect a video provider once via OAuth. After connecting,
// interviews can auto-generate a Meet/Teams/Zoom link.
// ============================================================================

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Video, Link2, Unlink } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/api/client";

interface Connection {
  provider: "google" | "microsoft" | "zoom";
  configured: boolean;
  connected: boolean;
  account_email?: string;
}

const META: Record<string, { name: string; blurb: string; color: string }> = {
  google: { name: "Google Meet", blurb: "Create Meet links via Google Calendar", color: "text-emerald-600" },
  microsoft: { name: "Microsoft Teams", blurb: "Create Teams meetings via Microsoft 365", color: "text-blue-600" },
  zoom: { name: "Zoom", blurb: "Create Zoom meetings on your account", color: "text-indigo-600" },
};

export function MeetingConnections() {
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["meeting-connections"],
    queryFn: () => apiGet<Connection[]>("/meetings/connections"),
  });
  const connections: Connection[] = (data as any)?.data || (data as any) || [];

  // Surface the ?meeting_connected / ?meeting_error the OAuth callback appended.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("meeting_connected")) {
      setBanner(`Connected ${META[p.get("meeting_connected")!]?.name || p.get("meeting_connected")}.`);
      refetch();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (p.get("meeting_error")) {
      setBanner(`Could not connect: ${p.get("meeting_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refetch]);

  async function connect(provider: string) {
    setBusy(provider);
    try {
      const res: any = await apiGet<{ authUrl: string }>(
        `/meetings/oauth/${provider}/start`,
        { redirect_after: window.location.href },
      );
      const url = res?.data?.authUrl || res?.authUrl;
      if (url) window.location.href = url; // hand off to the provider consent screen
    } catch (e: any) {
      setBanner(e?.response?.data?.error?.message || "Could not start sign-in");
      setBusy(null);
    }
  }

  async function disconnect(provider: string) {
    setBusy(provider);
    try {
      await apiDelete(`/meetings/connections/${provider}`);
      await refetch();
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Video className="h-5 w-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Video meetings</h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Connect a provider once. Then interviews can generate a meeting link automatically — no manual copy-paste.
      </p>
      {banner && <div className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{banner}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {connections.map((c) => {
          const meta = META[c.provider];
          return (
            <div key={c.provider} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-1 flex items-center gap-2">
                <Video className={`h-4 w-4 ${meta.color}`} />
                <span className="font-medium text-gray-900">{meta.name}</span>
              </div>
              <p className="mb-3 text-xs text-gray-500">{meta.blurb}</p>

              {!c.configured ? (
                <span className="text-xs text-gray-400">Not enabled on the server</span>
              ) : c.connected ? (
                <div>
                  <div className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                    {c.account_email ? <span className="text-gray-400"> · {c.account_email}</span> : null}
                  </div>
                  <button
                    onClick={() => disconnect(c.provider)}
                    disabled={busy === c.provider}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busy === c.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => connect(c.provider)}
                  disabled={busy === c.provider}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy === c.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Connect {meta.name}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
