// ============================================================================
// CANDIDATE LOGIN / SIGN UP (password-based)
//   Login  — email + password.
//   Sign up — name + email + password → account created, email-verify code sent.
//   Verify — enter the emailed code to verify your email (optional to browse,
//            but shown right after signup).
// ============================================================================

import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Mail, Loader2, Lock, User, Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";
import { ppost } from "../api";
import { usePortalStore } from "../store";

type Mode = "login" | "signup" | "verify";

export function CandidateLoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signIn = usePortalStore((s) => s.signIn);
  const setProfile = usePortalStore((s) => s.setProfile);
  const redirectTo = params.get("redirect") || "/jobs-portal/applications";

  async function login(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const res = await ppost<{ token: string; account: any }>("/candidate-auth/login", {
        email: email.trim(), password,
      });
      signIn(res.token, res.account);
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function signup(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const res = await ppost<{ token: string; account: any; dev_code?: string }>("/candidate-auth/register", {
        email: email.trim(), password, first_name: firstName.trim(), last_name: lastName.trim() || undefined,
      });
      // Signed in immediately; email shows unverified until the code is entered.
      signIn(res.token, res.account);
      setDevCode(res.dev_code || null);
      setMode("verify");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const res = await ppost<{ account: any }>("/candidate-auth/verify-email", { code: code.trim() });
      setProfile(res.account);
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const res = await ppost<{ dev_code?: string }>("/candidate-auth/resend-verification", {});
      setDevCode(res.dev_code || null);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {mode === "login" ? "Sign in" : mode === "signup" ? "Create your account" : "Verify your email"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {mode === "login"
            ? "One account to apply to every company."
            : mode === "signup"
              ? "Sign up once, apply anywhere."
              : `We sent a 6-digit code to ${email}.`}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {/* Login / Signup tabs */}
        {mode !== "verify" && (
          <div className="mb-5 flex rounded-lg bg-gray-100 p-1 text-sm">
            <button type="button" onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 rounded-md py-1.5 font-medium transition ${mode === "login" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              Sign in
            </button>
            <button type="button" onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 rounded-md py-1.5 font-medium transition ${mode === "signup" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              Create account
            </button>
          </div>
        )}

        {/* LOGIN */}
        {mode === "login" && (
          <form onSubmit={login} className="space-y-4">
            <Field label="Email" icon={Mail}>
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" className={inputCls} />
            </Field>
            <PasswordField value={password} onChange={setPassword} show={showPw} setShow={setShowPw} placeholder="Your password" />
            <Submit loading={loading} disabled={!email || !password}>Sign in</Submit>
          </form>
        )}

        {/* SIGNUP */}
        {mode === "signup" && (
          <form onSubmit={signup} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" icon={User}>
                <input required autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Last name">
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Email" icon={Mail}>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" className={inputCls} />
            </Field>
            <PasswordField value={password} onChange={setPassword} show={showPw} setShow={setShowPw} placeholder="At least 8 characters" />
            <Submit loading={loading} disabled={!email || !password || !firstName}>Create account</Submit>
          </form>
        )}

        {/* VERIFY EMAIL */}
        {mode === "verify" && (
          <form onSubmit={verify} className="space-y-4">
            {devCode && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Dev mode — your code is <span className="font-mono font-bold">{devCode}</span>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">6-digit code</label>
              <input inputMode="numeric" maxLength={6} autoFocus value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••"
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-center text-2xl font-bold tracking-[0.5em] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </div>
            <Submit loading={loading} disabled={code.length !== 6}>Verify & continue</Submit>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => navigate(redirectTo, { replace: true })} className="text-gray-500 hover:text-gray-700">
                Skip for now
              </button>
              <button type="button" onClick={resend} className="text-brand-600 hover:underline">Resend code</button>
            </div>
          </form>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">
        Just browsing? <Link to="/jobs-portal" className="text-brand-600 hover:underline">View all jobs</Link>
      </p>
    </div>
  );
}

// --- small presentational helpers -------------------------------------------
const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

function Field({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {Icon ? (
        <div className="relative">
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <div className="[&>input]:pl-9">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function PasswordField({ value, onChange, show, setShow, placeholder }: {
  value: string; onChange: (v: string) => void; show: boolean; setShow: (v: boolean) => void; placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input type={show ? "text" : "password"} required value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function Submit({ loading, disabled, children }: { loading: boolean; disabled: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
