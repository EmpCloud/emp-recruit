// ============================================================================
// CANDIDATE PORTAL LAYOUT
// Clean public-facing shell: a simple header with the job board / my-applications
// links and a sign-in / account control. Distinct from the recruiter app shell.
// ============================================================================

import { useState } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Briefcase, LogOut, User, LayoutList, MailWarning, Loader2, CheckCircle2, X } from "lucide-react";
import { usePortalStore, isCandidateLoggedIn } from "./store";
import { ppost } from "./api";

export function CandidatePortalLayout() {
  const { profile, signOut } = usePortalStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const loggedIn = isCandidateLoggedIn();

  const navLink = (to: string, label: string, Icon: any) => {
    const active = pathname === to || (to !== "/jobs-portal" && pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
          active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/jobs-portal" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Briefcase className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-bold text-gray-900">Careers</div>
              <div className="text-[11px] text-gray-400">Find your next role</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            {navLink("/jobs-portal", "Jobs", LayoutList)}
            {loggedIn && navLink("/jobs-portal/applications", "My Applications", Briefcase)}
            {loggedIn ? (
              <div className="ml-2 flex items-center gap-1">
                <Link
                  to="/jobs-portal/profile"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{profile?.first_name || "Account"}</span>
                </Link>
                <button
                  onClick={() => {
                    signOut();
                    navigate("/jobs-portal");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </div>
            ) : (
              <Link
                to="/jobs-portal/login"
                className="ml-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      {loggedIn && profile && !profile.email_verified && <VerifyEmailBanner />}

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-gray-400">
          Powered by EMP Recruit · Apply once, reach every company
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nudge unverified candidates to verify their email. Inline code entry so they
// never leave the page they're on.
// ---------------------------------------------------------------------------
function VerifyEmailBanner() {
  const setProfile = usePortalStore((s) => s.setProfile);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (dismissed) return null;

  async function resend() {
    setBusy(true); setMsg(null);
    try {
      const res = await ppost<{ dev_code?: string }>("/candidate-auth/resend-verification", {});
      setDevCode(res.dev_code || null);
      setOpen(true);
      setMsg("Code sent — check your email.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true); setMsg(null);
    try {
      const res = await ppost<{ account: any }>("/candidate-auth/verify-email", { code: code.trim() });
      setProfile(res.account);
      setDismissed(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 text-sm text-amber-800 sm:flex-row sm:items-center">
        <MailWarning className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Please verify your email address.
          {msg && <span className="ml-2 font-medium">{msg}</span>}
          {devCode && <span className="ml-2 font-mono font-bold">code: {devCode}</span>}
        </span>
        {open ? (
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="6-digit code"
              className="w-28 rounded-md border border-amber-300 px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <button onClick={verify} disabled={busy || code.length !== 6}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Verify
            </button>
          </div>
        ) : (
          <button onClick={resend} disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Send code
          </button>
        )}
        <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
