// ============================================================================
// CANDIDATE PROFILE — self-service profile the candidate can keep updated.
// Values here pre-fill future applications.
// ============================================================================

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Save, CheckCircle2, Lock, Eye, EyeOff } from "lucide-react";
import { pget, ppost, ppatch } from "../api";
import { usePortalStore, type CandidateProfile } from "../store";

export function CandidateProfilePage() {
  const setProfile = usePortalStore((s) => s.setProfile);
  const { data, isLoading } = useQuery({
    queryKey: ["portal-profile"],
    queryFn: () => pget<CandidateProfile>("/candidate-auth/me"),
  });

  const [form, setForm] = useState<Partial<CandidateProfile>>({});
  const [skillsText, setSkillsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm(data);
      setSkillsText((data.skills || []).join(", "));
    }
  }, [data]);

  function set<K extends keyof CandidateProfile>(k: K, v: CandidateProfile[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean),
        experience_years: form.experience_years ? Number(form.experience_years) : undefined,
      };
      const updated = await ppatch<CandidateProfile>("/candidate-auth/me", payload);
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>;

  const field = (label: string, key: keyof CandidateProfile, type = "text", placeholder = "") => (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={(form[key] as any) ?? ""}
        onChange={(e) => set(key, e.target.value as any)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Your profile</h1>
      <p className="mb-6 text-gray-500">Keep this current — it pre-fills your applications.</p>

      <form onSubmit={save} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          {field("First name", "first_name")}
          {field("Last name", "last_name")}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input value={form.email ?? ""} disabled className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
          </div>
          {field("Phone", "phone")}
        </div>
        {field("Headline", "headline", "text", "e.g. Senior Frontend Engineer")}
        <div className="grid grid-cols-2 gap-4">
          {field("Current company", "current_company")}
          {field("Current title", "current_title")}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field("Location", "location")}
          {field("Experience (years)", "experience_years", "number")}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field("LinkedIn URL", "linkedin_url")}
          {field("Portfolio URL", "portfolio_url")}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Skills <span className="font-normal text-gray-400">(comma-separated)</span></label>
          <input
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            placeholder="React, TypeScript, Node.js"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved" : "Save profile"}
          </button>
        </div>
      </form>

      <SetPasswordCard hasPassword={!!(data as any)?.has_password} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change your password.
// ---------------------------------------------------------------------------
function SetPasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr("Password must be at least 8 characters"); return; }
    setBusy(true);
    try {
      await ppost("/candidate-auth/set-password", { password: pw });
      setOk(true);
      setPw("");      setTimeout(() => setOk(false), 2500);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-gray-700" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Password</h2>
            <p className="text-sm text-gray-500">
              Change the password you use to sign in.
            </p>
          </div>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {hasPassword ? "Change password" : "Set password"}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          {err && <div className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : ok ? <CheckCircle2 className="h-4 w-4" /> : null}
            {ok ? "Saved" : "Save password"}
          </button>
        </form>
      )}
    </div>
  );
}
