import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { isLoggedIn, useAuthStore, extractSSOToken } from "@/lib/auth-store";
import { apiPost } from "@/api/client";

// Layouts (eagerly loaded)
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PortalLayout } from "@/components/layout/PortalLayout";

// Lazy-loaded pages
const LoginPage = lazy(() =>
  import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

// Jobs
const JobListPage = lazy(() =>
  import("@/pages/jobs/JobListPage").then((m) => ({ default: m.JobListPage })),
);
const JobDetailPage = lazy(() =>
  import("@/pages/jobs/JobDetailPage").then((m) => ({ default: m.JobDetailPage })),
);
const JobCreatePage = lazy(() =>
  import("@/pages/jobs/JobCreatePage").then((m) => ({ default: m.JobCreatePage })),
);
const JobEditPage = lazy(() =>
  import("@/pages/jobs/JobFormPage").then((m) => ({ default: m.JobFormPage })),
);
const JobPipelinePage = lazy(() =>
  import("@/pages/jobs/JobPipelinePage").then((m) => ({ default: m.JobPipelinePage })),
);

// Candidates
const CandidateListPage = lazy(() =>
  import("@/pages/candidates/CandidateListPage").then((m) => ({ default: m.CandidateListPage })),
);
const CandidateDetailPage = lazy(() =>
  import("@/pages/candidates/CandidateDetailPage").then((m) => ({ default: m.CandidateDetailPage })),
);
const CandidateCreatePage = lazy(() =>
  import("@/pages/candidates/CandidateCreatePage").then((m) => ({ default: m.CandidateCreatePage })),
);

// Interviews
const InterviewListPage = lazy(() =>
  import("@/pages/interviews/InterviewListPage").then((m) => ({ default: m.InterviewListPage })),
);
const InterviewDetailPage = lazy(() =>
  import("@/pages/interviews/InterviewDetailPage").then((m) => ({ default: m.InterviewDetailPage })),
);
const InterviewSchedulePage = lazy(() =>
  import("@/pages/interviews/InterviewSchedulePage").then((m) => ({ default: m.InterviewSchedulePage })),
);
const InterviewFeedbackPage = lazy(() =>
  import("@/pages/interviews/InterviewFeedbackPage").then((m) => ({ default: m.InterviewFeedbackPage })),
);

// Offers
const OfferListPage = lazy(() =>
  import("@/pages/offers/OfferListPage").then((m) => ({ default: m.OfferListPage })),
);
const OfferDetailPage = lazy(() =>
  import("@/pages/offers/OfferDetailPage").then((m) => ({ default: m.OfferDetailPage })),
);
const OfferCreatePage = lazy(() =>
  import("@/pages/offers/OfferCreatePage").then((m) => ({ default: m.OfferCreatePage })),
);
const OfferLetterTemplatePage = lazy(() =>
  import("@/pages/offers/OfferLetterTemplatePage").then((m) => ({ default: m.OfferLetterTemplatePage })),
);

// Comparison
const ComparisonPage = lazy(() =>
  import("@/pages/candidates/ComparisonPage").then((m) => ({ default: m.ComparisonPage })),
);

// Onboarding
const OnboardingListPage = lazy(() =>
  import("@/pages/onboarding/OnboardingListPage").then((m) => ({ default: m.OnboardingListPage })),
);
const OnboardingDetailPage = lazy(() =>
  import("@/pages/onboarding/OnboardingDetailPage").then((m) => ({ default: m.OnboardingDetailPage })),
);
const OnboardingTemplatesPage = lazy(() =>
  import("@/pages/onboarding/OnboardingTemplatesPage").then((m) => ({ default: m.OnboardingTemplatesPage })),
);

// Referrals
const ReferralListPage = lazy(() =>
  import("@/pages/referrals/ReferralListPage").then((m) => ({ default: m.ReferralListPage })),
);

// Analytics
const AnalyticsPage = lazy(() =>
  import("@/pages/analytics/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);

// Settings
const SettingsPage = lazy(() =>
  import("@/pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

// Careers (public)
const CareerListPage = lazy(() =>
  import("@/pages/careers/CareerListPage").then((m) => ({ default: m.CareerListPage })),
);
const CareerJobDetailPage = lazy(() =>
  import("@/pages/careers/CareerJobDetailPage").then((m) => ({ default: m.CareerJobDetailPage })),
);
const CareerApplyPage = lazy(() =>
  import("@/pages/careers/CareerApplyPage").then((m) => ({ default: m.CareerApplyPage })),
);
const ApplicationSuccessPage = lazy(() =>
  import("@/pages/careers/ApplicationSuccessPage").then((m) => ({ default: m.ApplicationSuccessPage })),
);

// Scoring
const ScoreReportPage = lazy(() =>
  import("@/pages/scoring/ScoreReportPage").then((m) => ({ default: m.ScoreReportPage })),
);

// Candidate Portal
const PortalRequestPage = lazy(() =>
  import("@/pages/portal/PortalRequestPage").then((m) => ({ default: m.PortalRequestPage })),
);
const PortalDashboardPage = lazy(() =>
  import("@/pages/portal/PortalDashboardPage").then((m) => ({ default: m.PortalDashboardPage })),
);
const PortalApplicationDetailPage = lazy(() =>
  import("@/pages/portal/PortalApplicationDetailPage").then((m) => ({ default: m.PortalApplicationDetailPage })),
);
const PortalInterviewsPage = lazy(() =>
  import("@/pages/portal/PortalInterviewsPage").then((m) => ({ default: m.PortalInterviewsPage })),
);

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
    </div>
  );
}

function AuthRedirect() {
  return isLoggedIn() ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}

function SSOGate({ children }: { children: React.ReactNode }) {
  const login = useAuthStore((s) => s.login);
  const [ssoToken] = useState(() => extractSSOToken());
  const [ready, setReady] = useState(!ssoToken); // ready immediately if no SSO token
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ssoToken) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await apiPost<{
          user: any;
          tokens: { accessToken: string; refreshToken: string };
        }>("/auth/sso", { token: ssoToken });

        if (cancelled) return;

        const { user, tokens } = res.data;
        login(user, tokens);

        // Redirect to dashboard after SSO login
        if (window.location.pathname === "/" || window.location.pathname === "/login") {
          window.location.replace("/dashboard");
          return; // Page is redirecting, don't setReady
        }
        setReady(true);
      } catch (err: any) {
        if (cancelled) return;
        console.error("SSO exchange failed:", err);
        setError("SSO login failed. Please try logging in manually.");
        setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [ssoToken, login]);

  if (!ready) return <PageLoader />;
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a href="/login" className="text-brand-600 underline">Go to login</a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <SSOGate>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* Root redirect */}
        <Route path="/" element={<AuthRedirect />} />

        {/* Protected routes inside DashboardLayout */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Jobs */}
          <Route path="/jobs" element={<JobListPage />} />
          <Route path="/jobs/new" element={<JobCreatePage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/jobs/:id/edit" element={<JobEditPage />} />
          <Route path="/jobs/:id/pipeline" element={<JobPipelinePage />} />

          {/* Candidates */}
          <Route path="/candidates" element={<CandidateListPage />} />
          <Route path="/candidates/new" element={<CandidateCreatePage />} />
          <Route path="/candidates/compare" element={<ComparisonPage />} />
          <Route path="/candidates/:id" element={<CandidateDetailPage />} />

          {/* Interviews */}
          <Route path="/interviews" element={<InterviewListPage />} />
          <Route path="/interviews/schedule" element={<InterviewSchedulePage />} />
          <Route path="/interviews/:id" element={<InterviewDetailPage />} />
          <Route path="/interviews/:id/feedback" element={<InterviewFeedbackPage />} />

          {/* Offers */}
          <Route path="/offers" element={<OfferListPage />} />
          <Route path="/offers/new" element={<OfferCreatePage />} />
          <Route path="/offers/letter-templates" element={<OfferLetterTemplatePage />} />
          <Route path="/offers/:id" element={<OfferDetailPage />} />

          {/* Onboarding */}
          <Route path="/onboarding" element={<OnboardingListPage />} />
          <Route path="/onboarding/templates" element={<OnboardingTemplatesPage />} />
          <Route path="/onboarding/:id" element={<OnboardingDetailPage />} />

          {/* Scoring */}
          <Route path="/scoring/:appId" element={<ScoreReportPage />} />

          {/* Referrals */}
          <Route path="/referrals" element={<ReferralListPage />} />

          {/* Analytics */}
          <Route path="/analytics" element={<AnalyticsPage />} />

          {/* Settings */}
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Candidate Portal (no employee auth — uses portal tokens) */}
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalRequestPage />} />
          <Route path="dashboard" element={<PortalDashboardPage />} />
          <Route path="applications/:id" element={<PortalApplicationDetailPage />} />
          <Route path="interviews" element={<PortalInterviewsPage />} />
        </Route>

        {/* Public career pages (no auth) */}
        <Route path="/careers/:slug" element={<PublicLayout />}>
          <Route index element={<CareerListPage />} />
          <Route path="jobs/:jobId" element={<CareerJobDetailPage />} />
          <Route path="jobs/:jobId/apply" element={<CareerApplyPage />} />
          <Route path="jobs/:jobId/success" element={<ApplicationSuccessPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<div className="p-8"><h1 className="text-2xl font-bold text-gray-900">Page Not Found</h1></div>} />
      </Routes>
    </Suspense>
    </SSOGate>
  );
}
