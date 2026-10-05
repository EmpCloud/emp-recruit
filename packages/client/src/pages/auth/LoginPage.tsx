import { useEffect, useState, type ElementType, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  Mail,
  UsersRound,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useLogin } from "@/api/hooks";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuthStore } from "@/lib/auth-store";

type Feature = {
  title: string;
  description: string;
  icon: ElementType;
};

const features: Feature[] = [
  {
    title: "auth.featureJobPostings",
    description: "auth.featureJobPostingsDescription",
    icon: BriefcaseBusiness,
  },
  {
    title: "auth.featureApplicantTracking",
    description: "auth.featureApplicantTrackingDescription",
    icon: UsersRound,
  },
  {
    title: "auth.featureInterviewScheduling",
    description: "auth.featureInterviewSchedulingDescription",
    icon: CalendarDays,
  },
  {
    title: "auth.featureResumeParsing",
    description: "auth.featureResumeParsingDescription",
    icon: FileText,
  },
];

function RecruitBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          compact
            ? "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700 shadow-lg shadow-indigo-500/25"
            : "flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-lg"
        }
      >
        <BriefcaseBusiness className="h-6 w-6 text-white" strokeWidth={2} />
      </span>
      <span
        className={
          compact
            ? "text-lg font-bold tracking-tight text-slate-900"
            : "text-lg font-bold tracking-tight text-white"
        }
      >
        EMP Recruit
      </span>
    </div>
  );
}

function RecruitmentDashboardPreview() {
  return (
    <div
      aria-hidden="true"
      className="relative h-[300px] w-full overflow-hidden rounded-t-[24px] border-[10px] border-b-0 border-slate-800 bg-white shadow-2xl shadow-indigo-950/40"
    >
      <div className="flex h-full">
        <aside className="w-[112px] shrink-0 bg-indigo-950 px-3 py-4 text-white">
          <div className="mb-5 flex items-center gap-2 text-[8px] font-bold">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-500">
              <BriefcaseBusiness className="h-3 w-3" />
            </span>
            EMP Recruit
          </div>
          {["Dashboard", "Jobs", "Candidates", "Interviews", "Offers", "Analytics"].map(
            (item, index) => (
              <div
                key={item}
                className={
                  index === 0
                    ? "mb-1.5 rounded-md bg-indigo-500 px-2 py-2 text-[7px] font-semibold"
                    : "mb-1.5 px-2 py-2 text-[7px] text-indigo-200"
                }
              >
                {item}
              </div>
            ),
          )}
        </aside>
        <div className="min-w-0 flex-1 bg-slate-50 p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-[12px] font-bold text-slate-900">Good morning, Alex</p>
              <p className="text-[6px] text-slate-400">
                Here&apos;s what&apos;s happening with your hiring today.
              </p>
            </div>
            <div className="h-5 w-24 rounded-md bg-white shadow-sm" />
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {[
              ["Total Applicants", "248"],
              ["Active Jobs", "12"],
              ["Interviews", "36"],
              ["Hired", "8"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white p-3 shadow-sm">
                <p className="text-base font-bold text-slate-900">{value}</p>
                <p className="text-[6px] text-slate-500">{label}</p>
                <p className="mt-1 text-[5px] font-medium text-emerald-500">
                  ↑ 12% from last month
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[8px] font-semibold text-slate-800">Recent Candidates</p>
              <p className="text-[6px] font-medium text-indigo-600">View all →</p>
            </div>
            {["Jessica Davis", "Michael Chen", "Priya Sharma"].map((name, index) => (
              <div
                key={name}
                className="grid grid-cols-[18px_1fr_70px_48px] items-center gap-2 border-t border-slate-100 py-2"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-100 text-[5px] font-bold text-indigo-700">
                  {name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <span className="text-[6px] font-medium text-slate-700">{name}</span>
                <span className="h-1.5 rounded-full bg-slate-100" />
                <span
                  className={
                    index === 0
                      ? "rounded-full bg-blue-50 py-1 text-center text-[5px] text-blue-600"
                      : "rounded-full bg-emerald-50 py-1 text-center text-[5px] text-emerald-600"
                  }
                >
                  {index === 0 ? "Interview" : "Active"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loginMutation = useLogin();
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (searchParams.get("expired") === "1") {
      setSessionExpired(true);
      searchParams.delete("expired");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSessionExpired(false);
    try {
      const response = await loginMutation.mutateAsync({ email, password });
      if (response.success) {
        login(response.data.user, response.data.tokens);
        toast.success(
          t("auth.welcomeToast", { firstName: response.data.user.firstName }),
        );
        navigate("/dashboard");
      } else {
        toast.error(response.error?.message || t("auth.loginFailed"));
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.error?.message || t("auth.loginFailedCredentials"),
      );
    }
  }

  return (
    <main className="flex min-h-screen overflow-hidden bg-white">
      <section className="relative hidden min-h-screen w-[61%] overflow-hidden bg-gradient-to-br from-[#3026c7] via-[#3530cd] to-[#6d2de0] text-white lg:block">
        <div className="absolute -left-24 top-24 h-80 w-80 rounded-full border border-white/5 bg-indigo-500/10" />
        <div className="absolute -right-40 -top-32 h-[520px] w-[520px] rotate-45 rounded-[100px] border border-white/10 bg-white/[0.035]" />
        <div className="absolute -bottom-64 -left-32 h-[520px] w-[520px] rotate-45 rounded-[80px] border border-white/10 bg-indigo-400/10" />
        <div className="absolute left-10 top-28 grid grid-cols-5 gap-3 opacity-20">
          {Array.from({ length: 20 }).map((_, index) => (
            <span key={index} className="h-1 w-1 rounded-full bg-white" />
          ))}
        </div>

        <div className="relative z-10 flex h-screen flex-col px-[6.75vw] pb-0 pt-8">
          <div className="flex items-center justify-between">
            <RecruitBrand />
            <div className="rounded-full border border-white/15 bg-white/[0.07] px-4 py-2 text-[11px] font-medium text-indigo-100">
              ✦ {t("auth.heroTagline")}
            </div>
          </div>

          <div className="mt-7 max-w-[650px]">
            <h1 className="text-[44px] font-extrabold leading-[1.04] tracking-tight">
              {t("auth.heroTitleTop")}
              <br />
              {t("auth.heroTitleMiddle")}{" "}
              <span className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-transparent">
                {t("auth.heroTitleAccent")}
              </span>
            </h1>
            <p className="mt-3 max-w-[630px] text-[15px] leading-6 text-indigo-100">
              {t("auth.heroSubtitle")}
            </p>
          </div>

          <div className="mt-5 grid max-w-[720px] grid-cols-2 gap-x-12 gap-y-3.5">
            {features.map(({ title, description, icon: Icon }) => (
              <div key={title} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                  <Icon className="h-5 w-5 text-indigo-100" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-white">{t(title)}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-indigo-200">
                    {t(description)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="relative mt-6 flex-1">
            <RecruitmentDashboardPreview />
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen flex-1 items-start justify-center bg-white px-5 pb-12 pt-[13vh]">
        <div className="absolute end-7 top-6 z-20">
          <LanguageSwitcher showLabel />
        </div>

        <div className="w-full max-w-[360px]">
          <div className="rounded-2xl border border-slate-200 bg-white px-7 py-8 shadow-[0_20px_60px_-28px_rgba(30,41,59,0.35)] sm:px-9">
            <div className="flex justify-center">
              <RecruitBrand compact />
            </div>
            <div className="mt-7 text-center">
              <h2 className="text-[28px] font-bold tracking-tight text-slate-950">
                {t("auth.welcomeBack")}
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                {t("auth.signInSubtitle")}
              </p>
            </div>

            {sessionExpired && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("auth.sessionExpired")}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-semibold text-slate-700"
                >
                  {t("auth.emailLabel")}
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                    required
                    className="block h-11 w-full rounded-lg border border-slate-200 bg-white ps-10 pe-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {t("auth.passwordLabel")}
                  </label>
                  <button
                    type="button"
                    onClick={() => toast.error(t("auth.passwordResetUnavailable"))}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    {t("auth.forgotPassword")}
                  </button>
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t("auth.passwordPlaceholder")}
                    required
                    className="block h-11 w-full rounded-lg border border-slate-200 bg-white ps-10 pe-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={
                      showPassword
                        ? t("auth.hidePassword")
                        : t("auth.showPassword")
                    }
                    className="absolute end-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                {t("auth.rememberMe")}
              </label>

              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:from-indigo-700 hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("auth.signingIn")}
                  </>
                ) : (
                  <>
                    {t("auth.signIn")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-[11px] leading-5 text-slate-400">
            {t("auth.ecosystemNote")}
            <br />
            {t("auth.ecosystemTagline")}
          </p>
        </div>
      </section>
    </main>
  );
}
